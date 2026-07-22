'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Play, Check, CalendarPlus, Trash2, AlertTriangle, Zap, Clock, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { normalizeTaskStatus, getStartSignal, isWaitingReceipt, type ReadinessReceipt } from '@/lib/taskReadiness'
import { KoteiBadge, GyomuBadge } from '@/components/ui/KoteiBadge'
import type { TaskRow } from '@/types'

/**
 * 案件詳細・タスクタブの事務管理タスクのテーブルビュー。
 * 列は事務管理タスク一覧と同じ思想（案件/担当は案件内なので省略）。
 * 期限はその場で編集でき、選択した複数タスクへ期限を一括設定できる。
 */
export default function CaseTaskTableView({ tasks, today, onAdvance, loadingTaskId, receipts, docNamesByTask, onRefresh }: {
  tasks: TaskRow[]
  today: string
  onAdvance: (task: TaskRow) => void
  loadingTaskId: string | null
  receipts: ReadinessReceipt[]
  docNamesByTask?: Map<string, string[]>
  onRefresh: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  // 禁止期間終了時の⚡確認モーダル（金融タスク用）。理由テキストを見せて「解消したか」を人に確認させる。
  const [prohibitionGate, setProhibitionGate] = useState<null | {
    task: TaskRow; bankName: string; reason: string; endDate: string | null; daysPassed: number
  }>(null)

  const allIds = tasks.map(t => t.id)
  const allSel = allIds.length > 0 && allIds.every(id => sel.has(id))
  const someSel = allIds.some(id => sel.has(id))
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSel(allSel ? new Set() : new Set(allIds))

  const saveDue = async (id: string, v: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('tasks').update({ due_date: v || null }).eq('id', id)
    if (error) { showToast(`期限の保存に失敗: ${error.message}`, 'error'); return }
    onRefresh()
  }

  const applyBulkDue = async () => {
    if (!bulkDate || sel.size === 0) return
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('tasks').update({ due_date: bulkDate }).in('id', Array.from(sel))
    setBusy(false)
    if (error) { showToast(`一括設定に失敗: ${error.message}`, 'error'); return }
    showToast(`${sel.size}件に期限を設定しました`, 'success')
    setSel(new Set()); setBulkDate('')
    onRefresh()
  }

  // 着手前タスクにだけ「着手OK」「受領次第OK」を1クリックでトグル。
  // ext_data.ready_reason = 手動着手OK理由、ready_on_receipt = 受領次第OK。両者は排他。
  const applyReady = async (t: TaskRow, kind: 'manual' | 'receipt', reason?: string) => {
    const supabase = createClient()
    const ext = { ...((t.ext_data ?? {}) as Record<string, unknown>) }
    const isOnManual = !!(ext.ready === true || (typeof ext.ready_reason === 'string' && ext.ready_reason.trim()))
    const isOnReceipt = isWaitingReceipt(t)
    if (kind === 'manual') {
      if (isOnManual) { delete ext.ready_reason; delete ext.ready } else { ext.ready_reason = reason || '手動で着手OK'; ext.ready = true; delete ext.ready_on_receipt }
    } else {
      if (isOnReceipt) { delete ext.ready_on_receipt } else { ext.ready_on_receipt = true; delete ext.ready_reason; delete ext.ready }
    }
    const { error } = await supabase.from('tasks').update({ ext_data: ext }).eq('id', t.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onRefresh()
  }
  // 金融タスク(fin:/fin-read:)の着手OK切替時、口座に禁止期間が設定されていて期日到来していれば確認モーダル。
  // 禁止期間が過ぎていない場合は通常運用外なので警告出しつつも押させない（手動で禁止期間を短く更新してから）。
  const toggleReady = async (t: TaskRow, kind: 'manual' | 'receipt') => {
    if (kind !== 'manual') { void applyReady(t, kind); return }
    const isOnManual = !!(((t.ext_data ?? {}) as Record<string, unknown>).ready === true || (typeof ((t.ext_data ?? {}) as Record<string, unknown>).ready_reason === 'string' && ((t.ext_data ?? {}) as Record<string, string>).ready_reason?.trim()))
    // 解除方向はモーダル不要
    if (isOnManual) { void applyReady(t, 'manual'); return }
    // 金融タスクなら関連口座の禁止期間を確認
    const rid = t.source_rid ?? ''
    const m = rid.match(/^fin(?:-read)?:(.+)$/)
    if (!m) { void applyReady(t, 'manual'); return }
    const bankName = m[1]
    const supabase = createClient()
    const { data } = await supabase.from('financial_assets')
      .select('survey_prohibited_end,survey_prohibited_reason')
      .eq('case_id', t.case_id).eq('institution_name', bankName).limit(1).maybeSingle()
    const endDate = (data?.survey_prohibited_end as string | null) ?? null
    const reason = ((data?.survey_prohibited_reason as string | null) ?? '').trim()
    if (!endDate && !reason) { void applyReady(t, 'manual'); return }
    // 禁止期間ありのケース：モーダルで理由と経過日数を提示して人の判断を仰ぐ
    const daysPassed = endDate ? Math.floor((new Date(today).getTime() - new Date(endDate).getTime()) / 86400000) : 0
    setProhibitionGate({ task: t, bankName, reason: reason || '(理由未入力)', endDate, daysPassed })
  }

  const applyBulkDelete = async () => {
    if (sel.size === 0) return
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('tasks').delete().in('id', Array.from(sel))
    setBusy(false)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    showToast(`${sel.size}件のタスクを削除しました`, 'success')
    setSel(new Set()); setConfirmDel(false)
    onRefresh()
  }

  return (
    <div className="space-y-2">
      {/* 一括期限設定ツールバー（選択時のみ） */}
      {sel.size > 0 && (
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 flex-wrap">
          <CalendarPlus className="w-4 h-4 text-brand-600" />
          <span className="text-[12.5px] font-semibold text-brand-800">{sel.size}件 選択中</span>
          <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500" />
          <button type="button" onClick={applyBulkDue} disabled={!bulkDate || busy} className="px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50">選択分に期限設定</button>
          <span className="w-px h-5 bg-brand-200" />
          <button type="button" onClick={() => setConfirmDel(true)} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />選択分を削除
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="ml-auto px-2 py-1.5 text-[12px] text-gray-500 hover:text-gray-800">選択解除</button>
        </div>
      )}

      {/* 禁止期間終了時の⚡確認モーダル（金融タスク用） */}
      {prohibitionGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setProhibitionGate(null)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-gray-800 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />禁止期間の解消を確認しましたか？
            </div>
            <div className="text-[12px] text-gray-500 mb-3">{prohibitionGate.bankName}</div>
            <div className="bg-gray-50 rounded-md p-2.5 mb-3">
              <div className="text-[11px] text-gray-500 mb-0.5">禁止理由</div>
              <div className="text-[13px] text-gray-800 leading-relaxed">{prohibitionGate.reason}</div>
              {prohibitionGate.endDate && (
                <>
                  <div className="text-[11px] text-gray-500 mt-2 mb-0.5">終了予定日</div>
                  <div className="text-[13px] text-gray-800">{prohibitionGate.endDate}
                    <span className="text-[11px] text-gray-500 ml-1">（{prohibitionGate.daysPassed >= 0 ? `${prohibitionGate.daysPassed}日経過` : `あと${-prohibitionGate.daysPassed}日`}）</span>
                  </div>
                </>
              )}
            </div>
            <p className="text-[12.5px] text-gray-700 leading-relaxed mb-3">上記の禁止理由が<b>実際に解消されたこと</b>を確認しましたか？<br/><span className="text-[11.5px] text-gray-500">確認方法は状況に応じて（通帳・電話・依頼者確認・書面 等）</span></p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setProhibitionGate(null)} className="px-3 py-1.5 text-[12.5px] text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50">まだ</button>
              <button type="button" onClick={async () => { const g = prohibitionGate; setProhibitionGate(null); await applyReady(g.task, 'manual', `禁止期間終了確認済（${g.endDate ?? '期日未設定'}）: ${g.reason}`) }} className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700">
                <Check className="w-3.5 h-3.5" />確認済み・着手OKに
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一括削除の確認ダイアログ */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !busy && setConfirmDel(false)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-red-200 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[14px] font-bold text-red-700 mb-2">
              <AlertTriangle className="w-4.5 h-4.5" />{sel.size}件のタスクを削除しますか？
            </div>
            <p className="text-[12.5px] text-gray-600 leading-relaxed mb-4">この操作は取り消せません。完了済みのタスクも削除されます。</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDel(false)} disabled={busy} className="px-3 py-1.5 text-[12.5px] text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">キャンセル</button>
              <button type="button" onClick={applyBulkDelete} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}削除する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 w-9 text-center">
                <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = !allSel && someSel }} onChange={toggleAll} className="w-4 h-4 accent-brand-600 cursor-pointer" aria-label="全選択" />
              </th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">工程</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">業務区分</th>
              <th className="px-2.5 py-2 text-left font-semibold">タスク名</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">ステータス</th>
              <th className="px-2.5 py-2 text-left font-semibold w-44">着手フラグ</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">期限</th>
              <th className="px-2.5 py-2 text-left font-semibold w-48">実施結果</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">到着物</th>
              <th className="px-2.5 py-2 text-center font-semibold w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-[13px] text-gray-400">該当するタスクがありません</td></tr>
            ) : tasks.map((t, i) => {
              const status = normalizeTaskStatus(t.status)
              const overdue = !!(t.due_date && t.due_date < today && status !== '完了')
              const signal = getStartSignal(t, receipts)
              const ext = (t.ext_data ?? {}) as Record<string, unknown>
              const result = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
              const checked = sel.has(t.id)
              return (
                <tr key={t.id} className={`border-b border-gray-100 last:border-b-0 ${checked ? 'bg-brand-50/50' : overdue ? 'bg-red-50/30' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-2 text-center"><input type="checkbox" checked={checked} onChange={() => toggle(t.id)} className="w-4 h-4 accent-brand-600 cursor-pointer" aria-label={`${t.title}を選択`} /></td>
                  <td className="px-2.5 py-2"><KoteiBadge phase={t.phase} /></td>
                  <td className="px-2.5 py-2"><GyomuBadge phase={t.phase} /></td>
                  <td className="px-2.5 py-2"><Link href={`/tasks/${t.id}`} className="text-gray-800 hover:text-brand-700 hover:underline">{t.title}</Link></td>
                  <td className="px-2.5 py-2">
                    {status === '完了' ? <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">完了</span>
                      : status === '対応中' ? <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">対応中</span>
                      : signal.ready ? <span className="inline-flex whitespace-nowrap items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">着手OK</span>
                      : <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-500 border border-gray-200">未着手</span>}
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    {status === '着手前' ? (
                      (() => {
                        const isReadyManual = !!(signal.ready && signal.source !== 'doc')
                        const isReadyDoc = !!(signal.ready && signal.source === 'doc')
                        const isOnReceipt = isWaitingReceipt(t)
                        // 書類受領起因の自動着手OKは編集不可（受信簿由来なので表示のみ）。
                        if (isReadyDoc) return <span className="block text-[11.5px] text-amber-800 line-clamp-2" title={signal.reason ?? ''}>{signal.reason}</span>
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1">
                              <button type="button" onClick={() => toggleReady(t, 'manual')} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors ${isReadyManual ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`} title={isReadyManual ? '解除する' : '前段未完でも着手OKにする'}>
                                <Zap className="w-3 h-3" />着手OK{isReadyManual && <Check className="w-2.5 h-2.5" />}
                              </button>
                              <button type="button" onClick={() => toggleReady(t, 'receipt')} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors ${isOnReceipt ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-700'}`} title={isOnReceipt ? '解除する' : '書類受領を待たずに着手可'}>
                                <Clock className="w-3 h-3" />受領次第{isOnReceipt && <Check className="w-2.5 h-2.5" />}
                              </button>
                              {isReadyManual && (
                                <button type="button" onClick={() => toggleReady(t, 'manual')} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] text-gray-400 hover:text-red-600" title="着手OKを解除" aria-label="解除"><X className="w-2.5 h-2.5" /></button>
                              )}
                            </div>
                            {isReadyManual && signal.reason && <span className="block text-[10.5px] text-brand-700 line-clamp-1" title={signal.reason}>{signal.reason}</span>}
                          </div>
                        )
                      })()
                    ) : (
                      <span className="text-gray-300 text-[12px]">—</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2">
                    <input type="date" defaultValue={t.due_date ?? ''} key={`d-${t.due_date ?? ''}`} onBlur={e => { if (e.target.value !== (t.due_date ?? '')) saveDue(t.id, e.target.value) }} className={`w-full px-1.5 py-1 text-[12px] border rounded outline-none focus:border-brand-500 ${overdue ? 'border-red-300 bg-red-50/40 text-red-700' : 'border-gray-200 bg-gray-50'}`} />
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    {result ? <span className="block text-[11.5px] text-gray-600 line-clamp-2" title={result}>{result}</span> : <span className="text-gray-300 text-[12px]">—</span>}
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    {(() => {
                      const docs = docNamesByTask?.get(t.id) ?? []
                      return docs.length > 0
                        ? <div className="flex flex-wrap gap-1">{docs.map((d, k) => <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-100">{d}</span>)}</div>
                        : <span className="text-gray-300 text-[12px]">—</span>
                    })()}
                  </td>
                  <td className="px-2.5 py-2 text-center">
                    {status === '完了' ? <span className="text-[11px] text-gray-400">—</span> : (
                      <button type="button" onClick={() => onAdvance(t)} disabled={loadingTaskId === t.id} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50">
                        {loadingTaskId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : status === '着手前' ? <Play className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                        {status === '着手前' ? '着手' : '完了'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

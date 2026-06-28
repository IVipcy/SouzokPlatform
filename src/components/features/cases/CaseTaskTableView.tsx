'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Play, Check, CalendarPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { normalizeTaskStatus, getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
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

  return (
    <div className="space-y-2">
      {/* 一括期限設定ツールバー（選択時のみ） */}
      {sel.size > 0 && (
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 flex-wrap">
          <CalendarPlus className="w-4 h-4 text-brand-600" />
          <span className="text-[12.5px] font-semibold text-brand-800">{sel.size}件 選択中</span>
          <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500" />
          <button type="button" onClick={applyBulkDue} disabled={!bulkDate || busy} className="px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50">選択分に期限設定</button>
          <button type="button" onClick={() => setSel(new Set())} className="px-2 py-1.5 text-[12px] text-gray-500 hover:text-gray-800">選択解除</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 w-9 text-center">
                <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = !allSel && someSel }} onChange={toggleAll} className="w-4 h-4 accent-brand-600 cursor-pointer" aria-label="全選択" />
              </th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">工程</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">業務区分</th>
              <th className="px-2.5 py-2 text-left font-semibold">タスク名</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">ステータス</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">期限</th>
              <th className="px-2.5 py-2 text-left font-semibold w-48">実施結果</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">到着物</th>
              <th className="px-2.5 py-2 text-center font-semibold w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-[13px] text-gray-400">該当するタスクがありません</td></tr>
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
                    {status === '完了' ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">完了</span>
                      : status === '対応中' ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">対応中</span>
                      : signal.ready ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">着手OK</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-500 border border-gray-200">未着手</span>}
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

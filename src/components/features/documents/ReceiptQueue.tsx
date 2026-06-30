'use client'

// 受信簿 処理キュー：今日のサマリ＋未スキャン/未紐づけ(=未着手OK)のワークリスト。
// 行クリックで処理パネル（モーダル）を開き、その場で②スキャン済・③紐づけ＝着手OKを実行する。

import { useMemo, useState, useEffect } from 'react'
import { Scan, Flag, CheckCircle2, ClipboardCheck, Lock, Unlink, ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useIsManager } from '@/components/providers/AuthProvider'
import { READY_REASON_DOC } from '@/lib/taskReadiness'
import type { DocumentReceiptRow } from '@/types'

type Entry = {
  itemId: string
  caseId: string
  caseNumber: string
  dealName: string
  receivedDate: string | null
  itemName: string
  receivedFrom: string | null
  uploaded: boolean
  linked: boolean
  stage: 'unscanned' | 'unlinked' | 'done'
}

const fmtDate = (d: string | null) => (d ? d.slice(5).replace('-', '/') : '—')

export default function ReceiptQueue({ receipts, onJumpToCase, onChanged }: {
  receipts: DocumentReceiptRow[]
  onJumpToCase: (caseId: string) => void
  onChanged: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [tab, setTab] = useState<'unscanned' | 'unlinked'>('unscanned')
  const [selected, setSelected] = useState<Entry | null>(null)

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const r of receipts) {
      for (const it of r.items ?? []) {
        const uploaded = !!(it.uploaded_at || it.case_document_id)
        const linked = (it.item_tasks?.length ?? 0) > 0 || !!it.link_not_required
        const stage: Entry['stage'] = !uploaded ? 'unscanned' : !linked ? 'unlinked' : 'done'
        out.push({ itemId: it.id, caseId: r.case_id, caseNumber: r.cases?.case_number ?? '', dealName: r.cases?.deal_name ?? '', receivedDate: r.received_date, itemName: it.item_name, receivedFrom: it.received_from, uploaded, linked, stage })
      }
    }
    return out
  }, [receipts])

  const todays = entries.filter(e => e.receivedDate === today)
  const sum = (list: Entry[], s: Entry['stage']) => list.filter(e => e.stage === s).length
  const queue = entries.filter(e => e.stage === tab).sort((a, b) => (b.receivedDate ?? '').localeCompare(a.receivedDate ?? ''))
  const totalUnscanned = sum(entries, 'unscanned')
  const totalUnlinked = sum(entries, 'unlinked')

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
        <div className="flex items-baseline gap-2.5 mb-3">
          <span className="text-[28px] font-semibold leading-none">{todays.length}</span>
          <span className="text-[13px] text-gray-400">件 到着（本日）</span>
          <span className="ml-auto text-[11.5px] text-gray-400">{today.replace(/-/g, '/')}</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          <SummaryCard icon={ClipboardCheck} label="受領記録済" value={todays.length} />
          <SummaryCard icon={Scan} label="未スキャン" value={sum(todays, 'unscanned')} tone="warn" />
          <SummaryCard icon={Flag} label="未紐づけ" value={sum(todays, 'unlinked')} tone="info" />
          <SummaryCard icon={CheckCircle2} label="処理済" value={sum(todays, 'done')} tone="ok" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TabBtn active={tab === 'unscanned'} onClick={() => setTab('unscanned')} icon={Scan} label="未スキャン" count={totalUnscanned} />
        <TabBtn active={tab === 'unlinked'} onClick={() => setTab('unlinked')} icon={Flag} label="未紐づけ（未着手OK）" count={totalUnlinked} />
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
              <th className="px-3 py-2 text-left font-semibold w-44">案件</th>
              <th className="px-3 py-2 text-left font-semibold">到着物</th>
              <th className="px-3 py-2 text-left font-semibold w-36">受領先</th>
              <th className="px-3 py-2 text-left font-semibold w-24">受領日</th>
              <th className="px-3 py-2 text-right font-semibold w-24">処理</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[13px] text-gray-400">{tab === 'unscanned' ? '未スキャンの到着物はありません' : '未紐づけ（未着手OK）の到着物はありません'}</td></tr>
            ) : queue.map(e => (
              <tr key={e.itemId} className="border-b border-gray-100 last:border-b-0 hover:bg-brand-50/30 cursor-pointer" onClick={() => setSelected(e)}>
                <td className="px-3 py-2"><span className="font-mono text-[11px] text-brand-700">{e.caseNumber}</span> <span className="text-gray-700">{e.dealName}</span></td>
                <td className="px-3 py-2 font-medium text-gray-800">{e.itemName}</td>
                <td className="px-3 py-2 text-gray-600">{e.receivedFrom || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 text-gray-600">{fmtDate(e.receivedDate)}</td>
                <td className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600">{tab === 'unscanned' ? 'スキャン' : '紐づけ'}<span aria-hidden>→</span></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">行をクリックすると処理パネルが開きます。タブの件数はバックログ全体です。</p>

      {selected && (
        <ProcessModal entry={selected} onClose={() => setSelected(null)} onChanged={onChanged} onJumpToCase={onJumpToCase} />
      )}
    </div>
  )
}

function ProcessModal({ entry, onClose, onChanged, onJumpToCase }: { entry: Entry; onClose: () => void; onChanged: () => void; onJumpToCase: (caseId: string) => void }) {
  const supabase = createClient()
  const isManager = useIsManager()
  const [busy, setBusy] = useState(false)
  const [tasks, setTasks] = useState<Array<{ id: string; title: string }>>([])
  const [taskId, setTaskId] = useState('')
  const [uploaded, setUploaded] = useState(entry.uploaded)
  const [linked, setLinked] = useState(entry.linked)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('tasks').select('id, title, status, task_kind').eq('case_id', entry.caseId).order('sort_order')
      if (!alive || !data) return
      setTasks((data as Array<{ id: string; title: string; status: string; task_kind: string | null }>)
        .filter(t => t.task_kind !== 'system' && t.status !== '完了' && t.status !== 'キャンセル')
        .map(t => ({ id: t.id, title: t.title })))
    })()
    return () => { alive = false }
  }, [entry.caseId, supabase])

  const markScanned = async (v: boolean) => {
    setBusy(true)
    const { error } = await supabase.from('document_receipt_items').update({ uploaded_at: v ? new Date().toISOString() : null }).eq('id', entry.itemId)
    setBusy(false)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    setUploaded(v); onChanged()
  }

  const linkReadyOK = async () => {
    if (!taskId) return
    if (!isManager) { showToast('紐づけ（着手OK）は管理担当のみ', 'error'); return }
    setBusy(true)
    // 到着物にタスクを結ぶ＋そのタスクを「必要書類受領済」で着手OKに
    const { error: e1 } = await supabase.from('document_receipt_item_tasks').upsert({ receipt_item_id: entry.itemId, task_id: taskId }, { onConflict: 'receipt_item_id,task_id', ignoreDuplicates: true })
    const { data: row } = await supabase.from('tasks').select('ext_data').eq('id', taskId).maybeSingle()
    const ext = ((row as { ext_data: Record<string, unknown> | null } | null)?.ext_data ?? {}) as Record<string, unknown>
    const { error: e2 } = await supabase.from('tasks').update({ ext_data: { ...ext, ready_reason: READY_REASON_DOC, ready_on_receipt: false, ready_wait_note: null } }).eq('id', taskId)
    setBusy(false)
    if (e1 || e2) { showToast(`保存に失敗: ${(e1 ?? e2)?.message}`, 'error'); return }
    setLinked(true); showToast('紐づけて着手OKにしました', 'success'); onChanged()
  }

  const markNotRequired = async () => {
    setBusy(true)
    const { error } = await supabase.from('document_receipt_items').update({ link_not_required: true }).eq('id', entry.itemId)
    setBusy(false)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    setLinked(true); onChanged()
  }

  return (
    <Modal isOpen onClose={onClose} title="到着物の処理">
      <div className="space-y-4">
        <div>
          <div className="text-[15px] font-semibold text-gray-900">{entry.itemName}</div>
          <div className="text-[12px] text-gray-500 mt-0.5">
            <span className="font-mono text-brand-700">{entry.caseNumber}</span> {entry.dealName}　／　受領 {fmtDate(entry.receivedDate)}{entry.receivedFrom ? `・${entry.receivedFrom}` : ''}
          </div>
        </div>

        {/* ② スキャンアップ */}
        <div className="rounded-md border border-gray-200 px-3.5 py-3">
          <div className="flex items-center gap-2 mb-2 text-[12px] font-semibold text-gray-700"><Scan className="w-4 h-4" />② スキャン格納</div>
          {uploaded ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><CheckCircle2 className="w-3 h-3" />スキャン済</span>
              <button type="button" onClick={() => markScanned(false)} disabled={busy} className="text-[11px] text-gray-400 hover:text-red-500">取消</button>
            </div>
          ) : (
            <button type="button" onClick={() => markScanned(true)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50 disabled:opacity-50"><Scan className="w-3.5 h-3.5" />スキャン済にする</button>
          )}
          <p className="text-[11px] text-gray-400 mt-1.5">実ファイルの添付（PDF）は「受信簿一覧」または案件フォルダ一括アップから。ここではスキャン済フラグを立てます。</p>
        </div>

        {/* ③ タスク紐づけ＝着手OK */}
        <div className="rounded-md border border-gray-200 px-3.5 py-3">
          <div className="flex items-center gap-2 mb-2 text-[12px] font-semibold text-gray-700"><Flag className="w-4 h-4" />③ タスク紐づけ＝着手OK（管理担当）</div>
          {linked ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><CheckCircle2 className="w-3 h-3" />紐づけ済</span>
          ) : (
            <>
              <select value={taskId} onChange={e => setTaskId(e.target.value)} className="w-full px-2.5 py-1.5 text-[12.5px] border border-gray-300 rounded-md bg-white outline-none focus:border-brand-400">
                <option value="">着手OKにするタスクを選択…</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={linkReadyOK} disabled={busy || !taskId} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"><Flag className="w-3.5 h-3.5" />紐づけて着手OK</button>
                <button type="button" onClick={markNotRequired} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"><Unlink className="w-3.5 h-3.5" />紐づけ不要</button>
              </div>
              {!isManager && <p className="text-[11px] text-amber-600 mt-1.5 inline-flex items-center gap-1"><Lock className="w-3 h-3" />紐づけ（着手OK）は管理担当のみ操作できます</p>}
            </>
          )}
        </div>

        <div className="flex justify-between items-center pt-1">
          <button type="button" onClick={() => onJumpToCase(entry.caseId)} className="inline-flex items-center gap-1 text-[12px] text-brand-600 hover:text-brand-700"><ExternalLink className="w-3.5 h-3.5" />この案件の受信簿を開く</button>
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-gray-600 hover:text-gray-800">閉じる</button>
        </div>
      </div>
    </Modal>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: 'warn' | 'info' | 'ok' }) {
  const vc = tone === 'warn' ? 'text-amber-700' : tone === 'info' ? 'text-brand-700' : tone === 'ok' ? 'text-emerald-700' : 'text-gray-900'
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={`text-[22px] font-semibold mt-0.5 ${vc}`}>{value}</div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] rounded-md border ${active ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
      <Icon className="w-3.5 h-3.5" />{label}
      <span className={`text-[10px] font-semibold px-1.5 rounded-full ${count > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
    </button>
  )
}

'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { SagyoDocumentRow } from '@/types'
import type { RoleRow } from './ProcedureIntakeSection'
import type { TimelineReceipt } from './CaseTimeline'

const STATUS = ['未請求', '請求済', '受領', '不要']

type Props = {
  caseId: string
  gyomu: string
  /** この業務の資料(kind=doc)の役割行。1行＝1資料。 */
  docRoles: RoleRow[]
  /** この業務の sagyo_documents（受領状況の実体）。 */
  documents: SagyoDocumentRow[]
  receipts: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 資料（受領管理）。手続き系タブで「受領する資料」を相続人調査と同じ型で管理する。
 * 1行＝1資料（doc-kindの作業）。受領は受信簿(document_receipts)を選ぶと receipt_id 連動で受領日が入る。
 * sagyo_documents を自然キー (case_id, gyomu, sagyou=資料名) で1資料1行に対応づけ（初回編集時に作成）。
 */
export default function ProcedureDocsTable({ caseId, gyomu, docRoles, documents, receipts, onRefresh }: Props) {
  const supabase = createClient()
  // sagyou(資料名) -> 実体行。楽観反映は overrides で持つ。
  const base = useMemo(() => {
    const m: Record<string, SagyoDocumentRow> = {}
    for (const d of documents) if (d.sagyou) m[d.sagyou] = d
    return m
  }, [documents])
  const [overrides, setOverrides] = useState<Record<string, Partial<SagyoDocumentRow>>>({})
  // 資料(sagyou)→実体行の作成中Promise。二重INSERT防止。
  const inflight = useRef<Record<string, Promise<string | null>>>({})

  const rowFor = (sagyou: string): Partial<SagyoDocumentRow> => ({ ...base[sagyou], ...overrides[sagyou] })

  const receiptLabel = (r: TimelineReceipt) => {
    const d = r.received_date ? r.received_date.slice(5).replace('-', '/') : '日付未定'
    const first = r.items?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.item_name
    return first ? `${d}・${first}` : d
  }

  // 資料1件に対応する sagyo_documents 行を保証（無ければ作成し、idをoverridesへ）。
  const ensureRow = (sagyou: string): Promise<string | null> => {
    const cur = rowFor(sagyou)
    if (cur.id) return Promise.resolve(cur.id)
    if (sagyou in inflight.current) return inflight.current[sagyou]
    const p = (async () => {
      const { data, error } = await supabase
        .from('sagyo_documents')
        .insert({ case_id: caseId, gyomu, sagyou, name: sagyou, sort_order: 0, status: '未請求' })
        .select('*').single()
      if (error || !data) { showToast(`保存に失敗しました: ${error?.message ?? ''}`, 'error'); return null }
      setOverrides(prev => ({ ...prev, [sagyou]: { ...prev[sagyou], id: (data as SagyoDocumentRow).id } }))
      return (data as SagyoDocumentRow).id
    })()
    inflight.current[sagyou] = p
    return p
  }

  const save = async (sagyou: string, patch: Partial<SagyoDocumentRow>) => {
    setOverrides(prev => ({ ...prev, [sagyou]: { ...prev[sagyou], ...patch } }))
    const id = await ensureRow(sagyou)
    if (!id) return
    const normalized = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]))
    const { error } = await supabase.from('sagyo_documents').update(normalized).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
    else onRefresh?.()
  }

  // 受信簿を選ぶ → receipt_id と受領日をセット（外すとクリア）
  const linkReceipt = (sagyou: string, receiptId: string) => {
    if (!receiptId) { save(sagyou, { receipt_id: null }); return }
    const rec = receipts.find(r => r.id === receiptId)
    save(sagyou, { receipt_id: receiptId, received_date: rec?.received_date ?? null, status: '受領' })
  }

  const cls = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'
  const recvCount = docRoles.filter(r => { const d = rowFor(r.sagyou); return d.received_date || d.status === '受領' }).length

  return (
    <div>
      <div className="mb-2 text-[12px] text-gray-500">受領 <span className="font-semibold text-green-600">{recvCount}</span> / {docRoles.length}</div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[11.5px] text-gray-500">
              <th className="px-2.5 py-1.5 text-left font-semibold w-52">資料</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-36">請求先</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-32">請求日</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-32">受領日</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-44">受信簿</th>
              <th className="px-2.5 py-1.5 text-left font-semibold w-24">状況</th>
            </tr>
          </thead>
          <tbody>
            {docRoles.map((role, i) => {
              const d = rowFor(role.sagyou)
              return (
                <tr key={role.sagyou + i} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-1.5 text-[13px] font-medium text-gray-800">{role.sagyou}</td>
                  <td className="px-2.5 py-1.5">
                    <input type="text" defaultValue={d.requested_to ?? ''} key={`to-${d.requested_to ?? ''}`} onBlur={e => { if (e.target.value !== (d.requested_to ?? '')) save(role.sagyou, { requested_to: e.target.value || null }) }} placeholder="請求先" className={cls} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input type="date" defaultValue={d.requested_date ?? ''} key={`rq-${d.requested_date ?? ''}`} onBlur={e => { if (e.target.value !== (d.requested_date ?? '')) save(role.sagyou, { requested_date: e.target.value || null }) }} className={cls} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input type="date" defaultValue={d.received_date ?? ''} key={`rc-${d.received_date ?? ''}`} onBlur={e => { if (e.target.value !== (d.received_date ?? '')) save(role.sagyou, { received_date: e.target.value || null }) }} className={cls} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <select value={d.receipt_id ?? ''} onChange={e => linkReceipt(role.sagyou, e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">未連動</option>
                      {receipts.map(rec => <option key={rec.id} value={rec.id}>{receiptLabel(rec)}</option>)}
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <select value={d.status ?? ''} onChange={e => save(role.sagyou, { status: e.target.value || null })} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">受領は受信簿を選ぶと受領日が自動で入ります（受信簿からタスク着手も可）。受け取る書類はオーダーシートの「作業区分＝請求・受領」で増減できます。</p>
    </div>
  )
}

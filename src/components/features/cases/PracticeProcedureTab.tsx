'use client'

import { useState, Fragment } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown, FileText } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { tasksFor } from '@/lib/serviceMaster'
import SagyoDocumentsTable from './SagyoDocumentsTable'
import type { RoleRow } from './ProcedureIntakeSection'
import type { CaseRow, SagyoDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

const OWNER = ['自社', '依頼者', '不要']
const STATUS = ['未着手', '着手', '完了', '保留']

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** 対象業務（例: 放棄手続き）。intake_roles をこの業務でフィルタして表示・編集する。 */
  gyomu: string
  title: string
  description?: string
  /** オーダーシートに埋め込む場合は true（外側の見出し Section を省く。OSSection が見出しを描く）。 */
  embedded?: boolean
  /** 作業に紐づく必要書類（sagyo_documents）。 */
  sagyoDocuments?: SagyoDocumentRow[]
  /** 受信簿（受領連動の選択肢）。 */
  receipts?: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 手続き系業務タブ（放棄 / 信託 / 調停 / 検認 / 後見）。
 * 遺言・相続登記タブと同格の「業務タブ」。受注区分→業務で出し分けされる（caseTabs）。
 * その業務の作業を「誰が・いつまで・状況」で管理する。
 * データは intake_roles(JSONB) を業務でフィルタして読み書き（受注内容タブと同じ実体）。
 *
 * ※ props 駆動（ローカル state を持たない）。オーダーシートで他セクションと同時表示されても
 *    intake_roles の取り合い（last-writer-wins の上書き）を起こさないようにするため。
 */
export default function PracticeProcedureTab({ caseData, patchCase, gyomu, title, description, embedded, sagyoDocuments = [], receipts = [], onRefresh }: Props) {
  const roles: RoleRow[] = caseData.intake_roles ?? []
  const save = (next: RoleRow[]) => patchCase({ intake_roles: next })
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggleExpand = (i: number) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const docsFor = (sagyou: string) => sagyoDocuments.filter(d => d.gyomu === gyomu && d.sagyou === sagyou)

  const rowsWithIdx = roles.map((r, i) => ({ r, i })).filter(x => x.r.gyomu === gyomu)
  const setRow = (i: number, patch: Partial<RoleRow>) => save(roles.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => save([...roles, { gyomu, sagyou: '', owner: '自社', note: '', status: '未着手', due: null }])

  // 役割分担から外された等で作業が無い場合、マスタから標準作業を読み込めるようにする
  const seedFromMaster = () => {
    const seeded: RoleRow[] = tasksFor(caseData.service_category ?? '', gyomu)
      .map(t => ({ gyomu, sagyou: t.task, owner: '自社', note: '', status: '未着手', due: null }))
    save([...roles, ...(seeded.length ? seeded : [{ gyomu, sagyou: '', owner: '自社', note: '', status: '未着手', due: null }])])
  }

  const body = (
    <>
      {description && <p className="text-[12px] text-gray-400 mb-2">{description}</p>}
      {rowsWithIdx.length === 0 ? (
          <div className="text-[13px] text-gray-500">
            <p className="mb-2">この業務の作業がまだありません。</p>
            <button type="button" onClick={seedFromMaster} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> 標準の作業を読み込む
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                    <th className="px-2.5 py-2 text-left font-semibold w-72">作業</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-28">担当</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-36">期限</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-28">状況</th>
                    <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-24">到着物</th>
                    <th className="px-2.5 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rowsWithIdx.map(({ r, i }, n) => {
                    const docs = docsFor(r.sagyou)
                    const received = docs.filter(d => d.received_date || d.status === '受領').length
                    const isOpen = expanded.has(i)
                    return (
                    <Fragment key={i}>
                    <tr className={`border-b border-gray-100 last:border-b-0 ${n % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <TextCell value={r.sagyou} onCommit={v => setRow(i, { sagyou: v })} placeholder="作業内容" />
                      <SelectCell value={r.owner} options={OWNER} onChange={v => setRow(i, { owner: v })} />
                      <DateCell value={r.due ?? null} onCommit={v => setRow(i, { due: v || null })} />
                      <SelectCell value={r.status ?? ''} options={STATUS} onChange={v => setRow(i, { status: v })} />
                      <TextCell value={r.note} onCommit={v => setRow(i, { note: v })} placeholder="メモ" />
                      <td className="px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => toggleExpand(i)}
                          disabled={!r.sagyou}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-500 hover:text-brand-700 disabled:opacity-40"
                          title="到着物・請求・受領"
                        >
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <FileText className="w-3.5 h-3.5" />
                          {docs.length > 0 && <span className="tabular-nums">{received}/{docs.length}</span>}
                        </button>
                      </td>
                      <td className="px-2.5 py-1.5 text-center">
                        <button type="button" onClick={() => save(roles.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                    {isOpen && r.sagyou && (
                      <tr className="bg-brand-50/30">
                        <td colSpan={7} className="px-3 py-2.5">
                          <SagyoDocumentsTable caseId={caseData.id} gyomu={gyomu} sagyou={r.sagyou} documents={docs} receipts={receipts} onRefresh={onRefresh} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )})}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addRow} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> 作業を追加
            </button>
          </>
        )}
    </>
  )

  if (embedded) return body
  return (
    <div className="space-y-3.5">
      <Section title={title}>{body}</Section>
    </div>
  )
}

function TextCell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        key={value}
        defaultValue={value}
        onBlur={e => { if (e.target.value !== value) onCommit(e.target.value) }}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}

function SelectCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )
}

function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="date"
        key={value ?? ''}
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}

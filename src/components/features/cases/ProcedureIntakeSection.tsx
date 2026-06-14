'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import type { CaseRow } from '@/types'

export type DocRow = { name: string; status: string; arrival_date: string | null; note: string }
export type RoleRow = { item: string; owner: string; note: string }

const DOC_STATUS = ['その場で受領', '後日郵送', '依頼者が取得', '不要']
const ROLE_OWNER = ['自社', '依頼者', '不要']

export const DEFAULT_DOCS: DocRow[] = [
  { name: '契約書', status: '', arrival_date: null, note: '' },
  { name: '委任状（戸籍用・認印）', status: '', arrival_date: null, note: '' },
  { name: '委任状（財産調査用・実印）', status: '', arrival_date: null, note: '' },
  { name: '戸籍（依頼者持参分）', status: '', arrival_date: null, note: '' },
  { name: '通帳・証書', status: '', arrival_date: null, note: '' },
  { name: '印鑑証明書', status: '', arrival_date: null, note: '' },
  { name: '本人確認書類', status: '', arrival_date: null, note: '' },
]
export const DEFAULT_ROLES: RoleRow[] = [
  { item: '戸籍収集', owner: '', note: '' },
  { item: '残高証明（財産調査）', owner: '', note: '' },
  { item: '解約手続', owner: '', note: '' },
  { item: '名寄帳請求', owner: '', note: '' },
  { item: '固定資産評価証明', owner: '', note: '' },
  { item: '名寄せ取得（別料金）', owner: '', note: '' },
  { item: '相続登記', owner: '', note: '' },
]

// ─── ① 受領書類エディタ（再利用可能） ───
export function IntakeDocsEditor({ docs, onSave }: { docs: DocRow[]; onSave: (next: DocRow[]) => void }) {
  const setDoc = (i: number, patch: Partial<DocRow>) => onSave(docs.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-56">書類</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">受領状況</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">到着予定日</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {docs.map((d, i) => (
              <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <Cell value={d.name} onCommit={v => setDoc(i, { name: v })} placeholder="書類名" />
                <SelectCell value={d.status} options={DOC_STATUS} onChange={v => setDoc(i, { status: v })} />
                <DateCell value={d.arrival_date} onCommit={v => setDoc(i, { arrival_date: v || null })} />
                <Cell value={d.note} onCommit={v => setDoc(i, { note: v })} placeholder="例：実印分は後日、料金 等" />
                <td className="px-2.5 py-1.5 text-center">
                  <button type="button" onClick={() => onSave(docs.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onSave([...docs, { name: '', status: '', arrival_date: null, note: '' }])} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
        <Plus className="w-3.5 h-3.5" /> 書類を追加
      </button>
    </>
  )
}

// ─── ② 役割分担エディタ（再利用可能） ───
export function IntakeRolesEditor({ roles, onSave }: { roles: RoleRow[]; onSave: (next: RoleRow[]) => void }) {
  const setRole = (i: number, patch: Partial<RoleRow>) => onSave(roles.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 620 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-56">項目</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">担当</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <Cell value={r.item} onCommit={v => setRole(i, { item: v })} placeholder="項目" />
                <SelectCell value={r.owner} options={ROLE_OWNER} onChange={v => setRole(i, { owner: v })} />
                <Cell value={r.note} onCommit={v => setRole(i, { note: v })} placeholder="例：名寄せは別料金 等" />
                <td className="px-2.5 py-1.5 text-center">
                  <button type="button" onClick={() => onSave(roles.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onSave([...roles, { item: '', owner: '', note: '' }])} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
        <Plus className="w-3.5 h-3.5" /> 項目を追加
      </button>
    </>
  )
}

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 手続き詳細（面談時のヒアリング）。新規案件登録（面談情報）時に入力する。
 *   ① 受領書類: その場で何を受領し、何が後日来るか（到着予定日）
 *   ② 役割分担: 戸籍収集・財産調査・解約・名寄帳請求 等を自社/依頼者どちらが行うか
 * 同じデータ（intake_documents / intake_roles）は「受注内容・契約手続き」タブでも編集できる。
 */
export default function ProcedureIntakeSection({ caseData, patchCase }: Props) {
  const [docs, setDocs] = useState<DocRow[]>(caseData.intake_documents ?? DEFAULT_DOCS)
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)

  const saveDocs = (next: DocRow[]) => { setDocs(next); patchCase({ intake_documents: next }) }
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }

  return (
    <Section title="手続き詳細">
      <div className="mb-2 text-[12px] font-bold text-gray-500">① 受領書類（その場で何をもらい、何が後日来るか）</div>
      <div className="mb-5">
        <IntakeDocsEditor docs={docs} onSave={saveDocs} />
      </div>
      <div className="mb-2 text-[12px] font-bold text-gray-500">② 役割分担（自社 / 依頼者 どちらが行うか）</div>
      <IntakeRolesEditor roles={roles} onSave={saveRoles} />
    </Section>
  )
}

function Cell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
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
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}

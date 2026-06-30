'use client'

import { useState } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, SectionHeading, InlineEdit, InlineSelect, InlineCheckbox } from '@/components/ui/InlineFields'
import { PROPERTY_EVALUATION_METHODS } from '@/lib/constants'
import { MoneyInput } from './FinancialAssetsTable'
import type { RealEstatePropertyRow } from '@/types'

const PROPERTY_TYPES = ['戸建', 'マンション', '土地', '収益物件', 'その他']
const REQ = ['要', '不要', '確認中']

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
}

/** 不動産を表形式でインライン編集・行追加。行展開で詳細項目も編集できる（財産調査） */
export default function RealEstateTable({ caseId, properties, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const setLocal = (id: string, field: keyof RealEstatePropertyRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))

  const commit = async (id: string, field: keyof RealEstatePropertyRow, value: string) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('real_estate_properties').insert({ case_id: caseId }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as RealEstatePropertyRow])
    onRefresh?.()
  }

  const delRow = async (row: RealEstatePropertyRow) => {
    if (!confirm(`「${row.address || '未入力の不動産'}」を削除しますか？`)) return
    const { error } = await supabase.from('real_estate_properties').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 920 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-1 py-2 w-7" />
              <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">評価額</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 text-left font-semibold w-56">調査結果</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</td></tr>
            ) : (
              rows.map(r => (
                <RealRow
                  key={r.id}
                  r={r}
                  open={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  setLocal={setLocal}
                  commit={commit}
                  saveField={saveField}
                  onDelete={() => delRow(r)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 不動産を追加
      </button>
    </div>
  )
}

function RealRow({ r, open, onToggle, setLocal, commit, saveField, onDelete }: {
  r: RealEstatePropertyRow
  open: boolean
  onToggle: () => void
  setLocal: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  commit: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  saveField: (id: string, field: keyof RealEstatePropertyRow, value: unknown) => Promise<void>
  onDelete: () => void
}) {
  const sel = (field: keyof RealEstatePropertyRow, options: readonly string[]) => (
    <td className="px-2.5 py-1.5">
      <select value={(r[field] as string) ?? ''} onChange={e => { setLocal(r.id, field, e.target.value); commit(r.id, field, e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )

  return (
    <>
      <tr className="border-b border-gray-100">
        <td className="px-1 py-1.5 text-center">
          <button type="button" onClick={onToggle} className="text-gray-400 hover:text-brand-600" title="詳細">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        {sel('property_type', PROPERTY_TYPES)}
        <CellInput value={r.address} onChange={v => setLocal(r.id, 'address', v)} onCommit={v => commit(r.id, 'address', v)} placeholder="所在地" />
        <td className="px-2.5 py-1.5"><MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} /></td>
        <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="住人・売却意向・ランク・査定状況 等" />
        <CellInput value={r.survey_result} onChange={v => setLocal(r.id, 'survey_result', v)} onCommit={v => commit(r.id, 'survey_result', v)} placeholder="この物件で分かったこと" />
        <td className="px-2.5 py-1.5 text-center">
          <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={7} className="px-4 py-3 space-y-3">
            {/* 物件詳細（固定資産申請書にも連携）。請求・取得の進捗は下の「取得資料管理」で管理。 */}
            <div>
              <SectionHeading title="物件詳細（固定資産申請書にも連携）" className="mb-2" />
              <FieldGrid>
                <InlineEdit label="所在（登記上の地番）" value={r.lot_number} onSave={v => saveField(r.id, 'lot_number', v || null)} />
                <InlineEdit label="家屋番号" value={r.kaoku_bango} onSave={v => saveField(r.id, 'kaoku_bango', v || null)} />
                <InlineSelect label="近傍宅地価格 要否" value={r.near_land_price} options={REQ} onSave={v => saveField(r.id, 'near_land_price', v)} />
                <InlineEdit label="築年数" value={r.building_age != null ? String(r.building_age) : null} onSave={v => saveField(r.id, 'building_age', v ? Number(v) : null)} />
                <InlineSelect label="評価方法" value={r.evaluation_method} options={[...PROPERTY_EVALUATION_METHODS]} onSave={v => saveField(r.id, 'evaluation_method', v)} />
                <InlineEdit label="売却仲介業者" value={r.sale_agent_name} onSave={v => saveField(r.id, 'sale_agent_name', v)} />
                <InlineCheckbox label="マンション敷地注意" value={r.is_condo_land} onSave={v => saveField(r.id, 'is_condo_land', v)} />
              </FieldGrid>
            </div>

            {/* 発見元（どの資料からこの不動産が判明したか） */}
            <div>
              <SectionHeading title="発見元（どの資料から判明したか）" className="mb-2" />
              <FieldGrid>
                <InlineCheckbox label="名寄せ参照" value={r.ref_nayose} onSave={v => saveField(r.id, 'ref_nayose', v)} />
                <InlineCheckbox label="権利書参照" value={r.ref_title_deed} onSave={v => saveField(r.id, 'ref_title_deed', v)} />
                <InlineCheckbox label="納税通知書参照" value={r.ref_tax_notice} onSave={v => saveField(r.id, 'ref_tax_notice', v)} />
              </FieldGrid>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CellInput({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}

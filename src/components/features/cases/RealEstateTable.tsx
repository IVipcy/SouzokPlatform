'use client'

import { useState } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, InlineEdit, InlineSelect, InlineCheckbox, InlineDate } from '@/components/ui/InlineFields'
import {
  SELLING_INTENTIONS, OCCUPANCY_STATUSES, PROPERTY_RANKS,
  NAMEYOSE_TARGETS, PROPERTY_EVALUATION_METHODS,
} from '@/lib/constants'
import type { RealEstatePropertyRow } from '@/types'

const PROPERTY_TYPES = ['戸建', 'マンション', '土地', '収益物件', 'その他']
const APPRAISAL_STATUSES = ['未対応', '対応中', '完了', '不要']
const REQ = ['要', '不要', '確認中']
// 取得物（要否＋取得済）: req=要否カラム / got=取得済(真偽)カラム
const ACQ_ITEMS: { label: string; req: keyof RealEstatePropertyRow; got: keyof RealEstatePropertyRow }[] = [
  { label: '登記情報', req: 'registry_required', got: 'has_registry_info' },
  { label: '公図', req: 'cadastral_required', got: 'has_cadastral_map' },
  { label: '地積測量図', req: 'survey_map_required', got: 'has_survey_map' },
  { label: '路線価', req: 'route_price_required', got: 'has_route_price' },
  { label: '評価証明', req: 'eval_cert_required', got: 'eval_cert_obtained' },
]

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
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 940 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-1 py-2 w-7" />
              <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">住人</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">売却意向</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">評価ランク</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">査定状況</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</td></tr>
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
        {sel('resident_status', OCCUPANCY_STATUSES)}
        {sel('sale_intention', SELLING_INTENTIONS)}
        {sel('rank', PROPERTY_RANKS)}
        {sel('appraisal_status', APPRAISAL_STATUSES)}
        <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" />
        <td className="px-2.5 py-1.5 text-center">
          <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={9} className="px-4 py-3 space-y-3">
            {/* 名寄せ */}
            <div>
              <div className="text-[12px] font-bold text-gray-500 mb-1.5">名寄せ</div>
              <FieldGrid>
                <InlineSelect label="名寄せ請求先" value={r.name_consolidation_dest} options={[...NAMEYOSE_TARGETS]} onSave={v => saveField(r.id, 'name_consolidation_dest', v)} />
                <InlineDate label="名寄せ到着日" value={r.name_consolidation_arrival_date} onSave={v => saveField(r.id, 'name_consolidation_arrival_date', v || null)} />
                <InlineSelect label="行政SQ要否" value={r.admin_sq_required} options={REQ} onSave={v => saveField(r.id, 'admin_sq_required', v)} />
                <InlineSelect label="司法SQ要否" value={r.judicial_sq_required} options={REQ} onSave={v => saveField(r.id, 'judicial_sq_required', v)} />
                <InlineCheckbox label="マンション敷地注意" value={r.is_condo_land} onSave={v => saveField(r.id, 'is_condo_land', v)} />
              </FieldGrid>
            </div>

            {/* 参照元 */}
            <div>
              <div className="text-[12px] font-bold text-gray-500 mb-1.5">参照元</div>
              <FieldGrid>
                <InlineCheckbox label="名寄せ参照" value={r.ref_nayose} onSave={v => saveField(r.id, 'ref_nayose', v)} />
                <InlineCheckbox label="権利書参照" value={r.ref_title_deed} onSave={v => saveField(r.id, 'ref_title_deed', v)} />
                <InlineCheckbox label="納税通知書参照" value={r.ref_tax_notice} onSave={v => saveField(r.id, 'ref_tax_notice', v)} />
              </FieldGrid>
            </div>

            {/* 取得物（要否／取得済） */}
            <div>
              <div className="text-[12px] font-bold text-gray-500 mb-1.5">取得物（要否／取得済）</div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-[13px] border-collapse" style={{ minWidth: 360 }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                      <th className="px-2.5 py-2 text-left font-semibold">取得物</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-28">要否</th>
                      <th className="px-2.5 py-2 text-center font-semibold w-20">取得済</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACQ_ITEMS.map(item => (
                      <tr key={item.label} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-2.5 py-1.5 font-medium text-gray-700">{item.label}</td>
                        <td className="px-2.5 py-1.5">
                          <select value={(r[item.req] as string) ?? ''} onChange={e => saveField(r.id, item.req, e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                            <option value="">—</option>
                            {REQ.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          <input type="checkbox" checked={!!r[item.got]} onChange={e => saveField(r.id, item.got, e.target.checked)} className="w-4 h-4 accent-brand-600 cursor-pointer" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* その他 */}
            <div>
              <div className="text-[12px] font-bold text-gray-500 mb-1.5">その他</div>
              <FieldGrid>
                <InlineEdit label="地番" value={r.lot_number} onSave={v => saveField(r.id, 'lot_number', v)} />
                <InlineEdit label="築年数" value={r.building_age != null ? String(r.building_age) : null} onSave={v => saveField(r.id, 'building_age', v ? Number(v) : null)} />
                <InlineEdit label="エリア評価" value={r.area_evaluation} onSave={v => saveField(r.id, 'area_evaluation', v)} />
                <InlineSelect label="評価方法" value={r.evaluation_method} options={[...PROPERTY_EVALUATION_METHODS]} onSave={v => saveField(r.id, 'evaluation_method', v)} />
                <InlineEdit label="評価証明書取得先" value={r.evaluation_cert_dest} onSave={v => saveField(r.id, 'evaluation_cert_dest', v)} />
                <InlineEdit label="売却仲介業者" value={r.sale_agent_name} onSave={v => saveField(r.id, 'sale_agent_name', v)} />
                <InlineCheckbox label="権利証（取得済）" value={r.has_title_deed} onSave={v => saveField(r.id, 'has_title_deed', v)} />
                <InlineCheckbox label="課税通知書（取得済）" value={r.has_tax_notice} onSave={v => saveField(r.id, 'has_tax_notice', v)} />
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

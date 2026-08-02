'use client'

// オーダーシート＞財産調査(不動産)：市区町村ブロック。
// 1市区町村＝1ブロック。中に 物件一覧 →（各表）の順で:
//   物件一覧            … RealEstateTable（同一市区町村内の物件を追加）
//   ① 名寄帳            … 市区町村単位の real_estate_acquisitions 行（複数可・追加）
//   ② 固定資産評価証明  … 名寄帳と同仕様（市区町村単位・複数可・追加）
//   ③ 登記情報/法務局   … 物件単位（取得区分/請求先/対象物件/取得する資料）
// 取得区分は 不要/自社取得/依頼者取得。
// 名寄帳・評価証明の「面談時に受領✓」→ 契約手続きの書類に「受領済・受領日入り」で自動追加（contract_document_id で紐付け・✓解除で削除）。
// 登記情報/法務局の請求先は JTN/民事法務協会/法務局/国税局HP。路線価は請求先=国税局HPのときだけ選べる。

import { useState, useEffect } from 'react'
import { Plus, Trash2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { RE_ACQUIRERS, reAcquirerLabel, RE_REQUEST_TO } from '@/lib/acquirer'
import { municipalityOf } from './RealEstateSection'
import RealEstateTable from './RealEstateTable'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow } from '@/types'

const HOUMU_ITEMS = ['登記情報', '所有者事項', '公図', '地積測量図'] as const   // JTN/民事法務協会/法務局
const KOKUZEI_ITEMS = ['路線価'] as const                                       // 国税局HP
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'
const itemsOf = (r: RealEstateAcquisitionRow): string[] => {
  const arr = r.item_types ?? []
  if (arr.length > 0) return arr
  return r.item_type ? [r.item_type] : []
}
function warekiYears(): string[] {
  const y = new Date().getFullYear()
  const reiwa = (yy: number) => `令和${yy - 2018}年度`
  return [reiwa(y), reiwa(y - 1)]
}
const todayYmd = () => new Date().toLocaleDateString('sv-SE')

export default function RealEstateOrderBlocks({ caseId, properties, acquisitions, onRefresh, addressSuggestions = [] }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
  addressSuggestions?: string[]
}) {
  const supabase = createClient()
  const years = warekiYears()
  const [localAcq, setLocalAcq] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocalAcq(acquisitions) }, [acquisitions])

  // 市区町村ブロック＝物件の市区町村 ∪ 市区町村スコープの取得行
  const propMunis = properties.map(municipalityOf).filter(Boolean)
  const acqMunis = localAcq.filter(a => (a.scope ?? 'municipality') === 'municipality').map(a => (a.target_municipality ?? '').trim()).filter(Boolean)
  const munis = [...new Set([...propMunis, ...acqMunis])]

  // ── 名寄帳/評価証明（市区町村単位・複数行）──
  const muniDocRows = (muni: string, itemType: string) =>
    localAcq.filter(a => (a.scope ?? 'municipality') === 'municipality' && (a.target_municipality ?? '').trim() === muni && (a.item_type === itemType || itemsOf(a).includes(itemType)))

  const addMuniDoc = async (muni: string, itemType: string) => {
    const seed = { case_id: caseId, scope: 'municipality', target_municipality: muni, item_type: itemType, item_types: [itemType], request_to: null, acquirer: '自社', sort_order: 0 }
    const { data, error } = await supabase.from('real_estate_acquisitions').insert(seed).select().single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setLocalAcq(prev => [...prev, data as unknown as RealEstateAcquisitionRow])
    onRefresh?.()
  }

  const patchRow = async (id: string, patch: Partial<RealEstateAcquisitionRow>) => {
    setLocalAcq(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('real_estate_acquisitions').update(patch).eq('id', id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  const deleteRow = async (row: RealEstateAcquisitionRow) => {
    if (row.contract_document_id) await supabase.from('contract_documents').delete().eq('id', row.contract_document_id)
    setLocalAcq(prev => prev.filter(r => r.id !== row.id))
    const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  // 面談時に受領✓ → 契約手続きの書類に「受領済・受領日入り」で追加／解除で削除
  const toggleReceived = async (row: RealEstateAcquisitionRow, itemType: string, muni: string, checked: boolean) => {
    if (checked) {
      const yr = row.doc_year ? `・${row.doc_year}` : ''
      const name = `${itemType}（${muni}${yr}）`
      const { data, error } = await supabase.from('contract_documents')
        .insert({ case_id: caseId, name, category: '不動産', status: 'その場で受領', arrival_date: todayYmd(), sort_order: 0 })
        .select('id').single()
      if (error || !data) { showToast(`契約手続きへの追加に失敗: ${error?.message ?? ''}`, 'error'); return }
      await patchRow(row.id, { received_at_meeting: true, contract_document_id: (data as { id: string }).id })
    } else {
      if (row.contract_document_id) await supabase.from('contract_documents').delete().eq('id', row.contract_document_id)
      await patchRow(row.id, { received_at_meeting: false, contract_document_id: null })
    }
  }

  // ── 登記情報/法務局（物件単位）──
  const findPropRow = (propId: string) => localAcq.find(a => (a.scope ?? 'property') === 'property' && a.target_property_id === propId)
  const ensurePropRow = async (prop: RealEstatePropertyRow): Promise<RealEstateAcquisitionRow | null> => {
    const existing = findPropRow(prop.id)
    if (existing) return existing
    const propMuni = (prop.municipality ?? '').trim() || null
    const seed = { case_id: caseId, scope: 'property', target_property_id: prop.id, target_municipality: propMuni, item_type: null, item_types: [], request_to: '法務局', acquirer: '自社', sort_order: 0 }
    const { data, error } = await supabase.from('real_estate_acquisitions').insert(seed).select().single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return null }
    const row = data as unknown as RealEstateAcquisitionRow
    setLocalAcq(prev => [...prev, row])
    return row
  }
  const patchProp = async (prop: RealEstatePropertyRow, patch: Partial<RealEstateAcquisitionRow>) => {
    const row = await ensurePropRow(prop)
    if (!row) return
    setLocalAcq(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('real_estate_acquisitions').update(patch).eq('id', row.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const togglePropItem = async (prop: RealEstatePropertyRow, item: string) => {
    const row = findPropRow(prop.id)
    const cur = row ? itemsOf(row) : []
    const next = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item]
    await patchProp(prop, { item_types: next, item_type: next[0] ?? null })
  }

  // ＋市区町村を追加（空物件を1件作ってブロックを増やす）
  const addMunicipality = async () => {
    const name = window.prompt('追加する市区町村名（都道府県＋市区町村。例: 東京都墨田区）')?.trim()
    if (!name) return
    const { error } = await supabase.from('real_estate_properties').insert({ case_id: caseId, municipality: name })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  const acqSelectCls = 'px-1.5 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500 w-24'
  const chipCls = (on: boolean) =>
    `inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11.5px] font-medium border transition-colors ${
      on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`

  return (
    <div className="mt-4 space-y-5">
      {munis.length === 0 && (
        <p className="text-[12px] text-gray-400">「＋ 市区町村（物件）を追加」で市区町村ブロックを作成してください。</p>
      )}

      {munis.map(muni => {
        const muniProps = properties.filter(p => municipalityOf(p) === muni)
        return (
          <div key={muni} className="border border-brand-200 rounded-xl overflow-hidden">
            <div className="bg-brand-50 px-3.5 py-2 flex items-center gap-1.5 text-[14px] font-semibold text-brand-800">
              <MapPin className="w-4 h-4" strokeWidth={2} />{muni}
            </div>
            <div className="bg-white p-3.5 space-y-4">

              {/* 物件一覧（同一市区町村内の物件を追加できる） */}
              <div>
                <div className="mb-2 pb-1 border-b border-gray-100">
                  <div className="text-[12.5px] font-semibold text-gray-700">物件一覧</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">同一市区町村内の物件は、この市区町村ブロックの物件一覧にまとめて記載してください。</div>
                </div>
                <RealEstateTable caseId={caseId} properties={properties} onRefresh={onRefresh} orderSheetMode municipalityFilter={muni} addressSuggestions={addressSuggestions} />
              </div>

              {/* ① 名寄帳 */}
              <div>
                <div className="text-[12.5px] font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-100">① 名寄帳（役所へ請求）</div>
                <MuniDocTable rows={muniDocRows(muni, '名寄帳')} muni={muni} itemType="名寄帳" years={years} onPatch={patchRow} onDelete={deleteRow} onToggleReceived={toggleReceived} onAdd={addMuniDoc} />
              </div>

              {/* ② 固定資産評価証明 */}
              <div>
                <div className="text-[12.5px] font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-100">② 固定資産評価証明</div>
                <MuniDocTable rows={muniDocRows(muni, '評価証明')} muni={muni} itemType="評価証明" years={years} onPatch={patchRow} onDelete={deleteRow} onToggleReceived={toggleReceived} onAdd={addMuniDoc} />
              </div>

              {/* ③ 登記情報/法務局（物件ごと） */}
              <div>
                <div className="text-[12.5px] font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-100">③ 登記情報で取得(JTN/民事法務協会) または法務局へ請求</div>
                {muniProps.length === 0 ? (
                  <p className="text-[12px] text-gray-400">物件一覧に物件を追加すると、物件ごとの行が出ます。</p>
                ) : (
                  <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                    <table className="w-full text-[13px] border-collapse" style={{ minWidth: 680 }}>
                      <thead>
                        <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                          <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
                          <th className="px-2.5 py-2 text-left font-semibold w-36">請求先</th>
                          <th className="px-2.5 py-2 text-left font-semibold w-52">対象物件</th>
                          <th className="px-2.5 py-2 text-left font-semibold">取得する資料（複数選択可）</th>
                        </tr>
                      </thead>
                      <tbody>
                        {muniProps.map((p, i) => {
                          const row = findPropRow(p.id)
                          const acquirer = row?.acquirer ?? '自社'
                          const requestTo = row?.request_to ?? '法務局'
                          const dim = acquirer === '依頼者' || acquirer === '不要' ? 'opacity-40 pointer-events-none' : ''
                          const items = requestTo === '国税局HP' ? KOKUZEI_ITEMS : HOUMU_ITEMS
                          return (
                            <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                              <td className="px-2.5 py-1.5">
                                <select value={acquirer} onChange={e => patchProp(p, { acquirer: e.target.value })} className={acqSelectCls}>
                                  {RE_ACQUIRERS.map(a => <option key={a} value={a}>{reAcquirerLabel(a)}</option>)}
                                </select>
                              </td>
                              <td className={`px-2.5 py-1.5 ${dim}`}>
                                <select value={requestTo} onChange={e => patchProp(p, { request_to: e.target.value })} className="w-32 px-1.5 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                                  {RE_REQUEST_TO.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </td>
                              <td className="px-2.5 py-2 text-gray-600">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10.5px] mr-1.5">{p.property_type || '—'}</span>
                                {propLabel(p)}
                              </td>
                              <td className={`px-2.5 py-2 ${dim}`}>
                                <div className="flex flex-wrap gap-1.5">
                                  {items.map(item => {
                                    const on = row ? itemsOf(row).includes(item) : false
                                    return <button key={item} type="button" onClick={() => togglePropItem(p, item)} className={chipCls(on)}>{on && '✓'}{item}</button>
                                  })}
                                </div>
                                {requestTo === '国税局HP' && <p className="text-[10.5px] text-gray-400 mt-1">路線価は請求先=国税局HPのときのみ選べます</p>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          </div>
        )
      })}

      <button type="button" onClick={addMunicipality} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-brand-700 bg-white border border-dashed border-brand-300 hover:bg-brand-50 transition-colors">
        <Plus className="w-4 h-4" strokeWidth={2} /> 市区町村（物件）を追加
      </button>
    </div>
  )
}

// 名寄帳／評価証明 の共通テーブル（市区町村単位・複数行）。トップレベル定義で再マウントを防ぐ。
const ACQ_SELECT = 'px-1.5 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500 w-24'
function MuniDocTable({ rows, muni, itemType, years, onPatch, onDelete, onToggleReceived, onAdd }: {
  rows: RealEstateAcquisitionRow[]
  muni: string
  itemType: string
  years: string[]
  onPatch: (id: string, patch: Partial<RealEstateAcquisitionRow>) => void
  onDelete: (row: RealEstateAcquisitionRow) => void
  onToggleReceived: (row: RealEstateAcquisitionRow, itemType: string, muni: string, checked: boolean) => void
  onAdd: (muni: string, itemType: string) => void
}) {
  return (
    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
      <table className="w-full text-[13px] border-collapse" style={{ minWidth: 640 }}>
        <thead>
          <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
            <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
            <th className="px-2.5 py-2 text-left font-semibold w-40">所在地</th>
            <th className="px-2.5 py-2 text-left font-semibold w-32">年度</th>
            <th className="px-2.5 py-2 text-left font-semibold w-32">面談時に受領</th>
            <th className="px-2.5 py-2 text-left font-semibold">備考</th>
            <th className="px-2.5 py-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-4 text-center text-[12px] text-gray-400">「＋ 追加」で行を作成してください</td></tr>
          ) : rows.map((row, i) => {
            const acquirer = row.acquirer ?? '自社'
            const dim = acquirer === '依頼者' || acquirer === '不要' ? 'opacity-40 pointer-events-none' : ''
            const yr = row.doc_year ?? ''
            return (
              <tr key={row.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-1.5">
                  <select value={acquirer} onChange={e => onPatch(row.id, { acquirer: e.target.value })} className={ACQ_SELECT}>
                    {RE_ACQUIRERS.map(a => <option key={a} value={a}>{reAcquirerLabel(a)}</option>)}
                  </select>
                </td>
                <td className="px-2.5 py-2 text-gray-700">{muni}</td>
                <td className={`px-2.5 py-1.5 ${dim}`}>
                  <select value={yr && !years.includes(yr) ? '__other__' : yr} onChange={e => { if (e.target.value !== '__other__') onPatch(row.id, { doc_year: e.target.value || null }) }} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                    <option value="">—</option>
                    {years.map(o => <option key={o} value={o}>{o}</option>)}
                    {yr && !years.includes(yr) && <option value="__other__">{yr}</option>}
                  </select>
                </td>
                <td className="px-2.5 py-2">
                  <label className="inline-flex items-center gap-1.5 text-[12px]">
                    <input type="checkbox" checked={row.received_at_meeting} onChange={e => onToggleReceived(row, itemType, muni, e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                    <span className={row.received_at_meeting ? 'text-emerald-700 font-semibold' : 'text-gray-500'}>受領</span>
                  </label>
                </td>
                <td className="px-2.5 py-1.5">
                  <input type="text" defaultValue={row.notes ?? ''} onBlur={e => { if (e.target.value !== (row.notes ?? '')) onPatch(row.id, { notes: e.target.value || null }) }} placeholder="写しあり 等" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  <button type="button" onClick={() => onDelete(row)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-4 h-4" strokeWidth={1.75} /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-2.5 py-2 border-t border-gray-100">
        <button type="button" onClick={() => onAdd(muni, itemType)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-gray-200 rounded-md px-2.5 py-1 bg-white">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.25} /> 追加（年度ごと）
        </button>
      </div>
    </div>
  )
}

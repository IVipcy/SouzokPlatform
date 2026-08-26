'use client'

// オーダーシート＞財産調査＞不動産 の「取得予定資料」を編集する軽量エディタ（実務タブと構造を統一）。
// 3つの表に分割:
//   ① 名寄帳（市区町村ごと）      … 取得区分 / 請求先(役所) / 対象(市区町村) / 年度(和暦) / 備考
//   ② 固定資産評価証明（物件ごと）… EvalCertTable を再利用（取得区分 / 請求先 / 物件種別 / 所在地 / 家屋番号 / 近傍宅地価格 / 年度）
//   ③ 法務局（物件ごと）          … 取得区分 / 請求先(法務局) / 対象(物件) / 取得する資料(登記情報・所有者事項・公図・地積測量図・路線価)
// 取得区分「依頼者取得」の行は 以降の請求系入力を不要にする（非活性で薄く）。

import { useState, useEffect } from 'react'
import { SectionHeading } from '@/components/ui/InlineFields'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { ACQUIRERS, acquirerLabel } from '@/lib/acquirer'
import { municipalityOf } from './RealEstateSection'
import EvalCertTable from './EvalCertTable'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow } from '@/types'

const PROP_ITEMS = ['登記情報', '所有者事項', '公図', '地積測量図', '路線価'] as const

const stripPref = (m: string) => m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'
const itemsOf = (r: RealEstateAcquisitionRow): string[] => {
  const arr = r.item_types ?? []
  if (arr.length > 0) return arr
  return r.item_type ? [r.item_type] : []
}
// 和暦の年度候補（今年度・前年度）。例: 令和8年度 / 令和7年度。
function warekiYears(): string[] {
  const y = new Date().getFullYear()
  const reiwa = (yy: number) => `令和${yy - 2018}年度`
  return [reiwa(y), reiwa(y - 1)]
}

export default function AcquisitionPlanEditor({ caseId, properties, acquisitions, onRefresh }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const years = warekiYears()
  const munis = [...new Set(properties.map(municipalityOf).filter(Boolean))]
  const [localAcq, setLocalAcq] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocalAcq(acquisitions) }, [acquisitions])

  const findMuniRow = (muni: string) => localAcq.find(a => (a.scope ?? 'municipality') === 'municipality' && (a.target_municipality ?? '') === muni)
  const findPropRow = (propId: string) => localAcq.find(a => (a.scope ?? 'property') === 'property' && a.target_property_id === propId)

  // 市区町村行（名寄帳）を必ず用意して patch する（無ければ作る）。名寄帳=item_type '名寄帳'。
  const ensureMuniRow = async (muni: string): Promise<RealEstateAcquisitionRow | null> => {
    const existing = findMuniRow(muni)
    if (existing) return existing
    const seed = { case_id: caseId, scope: 'municipality', target_municipality: muni, item_type: '名寄帳', item_types: ['名寄帳'], request_to: `${stripPref(muni)}役所`, sort_order: 0 }
    const { data, error } = await supabase.from('real_estate_acquisitions').insert(seed).select().single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return null }
    const row = data as unknown as RealEstateAcquisitionRow
    setLocalAcq(prev => [...prev, row])
    return row
  }
  const patchMuni = async (muni: string, patch: Partial<RealEstateAcquisitionRow>) => {
    const row = await ensureMuniRow(muni)
    if (!row) return
    setLocalAcq(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('real_estate_acquisitions').update(patch).eq('id', row.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  // 法務局行（物件ごと）。取得区分 patch と 資料チップ toggle。
  const ensurePropRow = async (prop: RealEstatePropertyRow): Promise<RealEstateAcquisitionRow | null> => {
    const existing = findPropRow(prop.id)
    if (existing) return existing
    const propMuni = (prop.municipality ?? '').trim() || null
    const seed = { case_id: caseId, scope: 'property', target_property_id: prop.id, target_municipality: propMuni, item_type: null, item_types: [], request_to: '法務局', sort_order: 0 }
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

  if (properties.length === 0) return null

  const chipCls = (on: boolean) =>
    `inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11.5px] font-medium border transition-colors ${
      on ? 'bg-brand-600 text-white border-brand-600'
         : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`
  const acqSelectCls = 'px-1 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500 w-24'

  return (
    <div className="mt-4 space-y-5">
      {/* ① 名寄帳（市区町村ごと） */}
      <div>
        <SectionHeading
          title="① 名寄帳（役所へ請求）"
          hint={'市区町村ごとに名寄帳を請求します。名寄帳は「請求先」と「年度（和暦）」だけ。\n所在地を入力すると市区町村が自動で入ります。取得区分「依頼者取得」なら年度入力は不要です。'}
          className="mb-2.5 pb-1.5 border-b border-gray-200"
        />
        {munis.length === 0 ? (
          <p className="text-[12px] text-gray-400">上の物件一覧に所在地を入力すると、市区町村ごとの名寄帳がここに自動で入ります。</p>
        ) : (
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-[3px]">
            <table className="w-full text-[13px] border-collapse" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
                  <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
                  <th className="px-2.5 py-2 text-left font-semibold w-40">請求先(役所)</th>
                  <th className="px-2.5 py-2 text-left font-semibold w-48">対象(市区町村)</th>
                  <th className="px-2.5 py-2 text-left font-semibold w-32">年度</th>
                  <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                </tr>
              </thead>
              <tbody>
                {munis.map((muni, i) => {
                  const row = findMuniRow(muni)
                  const acquirer = row?.acquirer ?? '自社'
                  const isClient = acquirer === '依頼者'
                  const dim = isClient ? 'opacity-40 pointer-events-none' : ''
                  const yr = row?.myna_year ?? ''
                  return (
                    <tr key={`m-${muni}`} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-2.5 py-1.5">
                        <select value={acquirer} onChange={e => patchMuni(muni, { acquirer: e.target.value })} className={acqSelectCls}>
                          {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
                        </select>
                      </td>
                      <td className={`px-2.5 py-2 text-gray-700 ${dim}`}>{stripPref(muni)}役所</td>
                      <td className="px-2.5 py-2 text-gray-600">{muni}</td>
                      <td className={`px-2.5 py-1.5 ${dim}`}>
                        <select value={yr && !years.includes(yr) ? '__other__' : yr} onChange={e => { if (e.target.value !== '__other__') patchMuni(muni, { myna_year: e.target.value || null }) }} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                          <option value="">—</option>
                          {years.map(o => <option key={o} value={o}>{o}</option>)}
                          {yr && !years.includes(yr) && <option value="__other__">{yr}</option>}
                        </select>
                      </td>
                      <td className={`px-2.5 py-1.5 ${dim}`}>
                        <input type="text" defaultValue={row?.notes ?? ''} onBlur={e => { if (e.target.value !== (row?.notes ?? '')) patchMuni(muni, { notes: e.target.value || null }) }} placeholder="写しあり 等" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ② 固定資産評価証明（物件ごと・EvalCertTable 再利用） */}
      <div>
        <SectionHeading
          title="② 固定資産評価証明（物件ごと）"
          hint="固定資産評価証明は物件ごとに、取得区分・家屋番号・近傍宅地価格の有無・年度（和暦）を記録します。請求先は市区町村役所。"
          className="mb-2.5 pb-1.5 border-b border-gray-200"
        />
        <EvalCertTable caseId={caseId} properties={properties} onRefresh={onRefresh} />
      </div>

      {/* ③ 法務局（物件ごと） */}
      <div>
        <SectionHeading
          title="③ 法務局へ請求（物件ごと）"
          hint={'物件ごとに 登記情報・所有者事項・公図・地積測量図・路線価 をチップで選びます。\n取得区分「依頼者取得」なら資料選択は不要です。'}
          className="mb-2.5 pb-1.5 border-b border-gray-200"
        />
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-[3px]">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 720 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
                <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">請求先</th>
                <th className="px-2.5 py-2 text-left font-semibold w-56">対象(物件)</th>
                <th className="px-2.5 py-2 text-left font-semibold">取得する資料（複数選択可）</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p, i) => {
                const row = findPropRow(p.id)
                const acquirer = row?.acquirer ?? '自社'
                const isClient = acquirer === '依頼者'
                const dim = isClient ? 'opacity-40 pointer-events-none' : ''
                return (
                  <tr key={`p-${p.id}`} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-2.5 py-1.5">
                      <select value={acquirer} onChange={e => patchProp(p, { acquirer: e.target.value })} className={acqSelectCls}>
                        {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
                      </select>
                    </td>
                    <td className={`px-2.5 py-2 text-gray-700 ${dim}`}>法務局</td>
                    <td className="px-2.5 py-2 text-gray-600">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10.5px] mr-1.5">{p.property_type || '—'}</span>
                      {propLabel(p)}
                    </td>
                    <td className={`px-2.5 py-2 ${dim}`}>
                      <div className="flex flex-wrap gap-1.5">
                        {PROP_ITEMS.map(item => {
                          const on = row ? itemsOf(row).includes(item) : false
                          return <button key={item} type="button" onClick={() => togglePropItem(p, item)} className={chipCls(on)}>{on && '✓'}{item}</button>
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

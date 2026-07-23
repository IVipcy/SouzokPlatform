'use client'

// オーダーシート＞財産調査＞不動産 の「取得予定資料」を編集する軽量エディタ。
// 表テイストで統一：1行＝1宛先（1請求）、資料はチップで複数選択。
// - 市区町村ごと（scope=municipality）＝名寄帳・固定資産評価証明
// - 物件ごと（scope=property）＝登記情報・公図・地積測量図・路線価

import { useState, useEffect } from 'react'
import { SectionHeading } from '@/components/ui/InlineFields'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { municipalityOf } from './RealEstateSection'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow } from '@/types'

const MUNI_ITEMS = ['名寄帳', '固定資産評価証明'] as const
const PROP_ITEMS = ['登記情報', '公図', '地積測量図', '路線価'] as const

const stripPref = (m: string) => m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'
// item_types 優先。空配列(null含む)なら旧 item_type にフォールバック（migration 直後の互換）。
const itemsOf = (r: RealEstateAcquisitionRow): string[] => {
  const arr = r.item_types ?? []
  if (arr.length > 0) return arr
  return r.item_type ? [r.item_type] : []
}

export default function AcquisitionPlanEditor({ caseId, properties, acquisitions, onRefresh, muniOnly = false }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
  /** オーダーシート（調査前）＝市区町村単位（名寄帳・評価証明）だけ表示。物件単位（公図等・法務局）は物件確定後に実務タブで扱う。 */
  muniOnly?: boolean
}) {
  const supabase = createClient()
  const munis = [...new Set(properties.map(municipalityOf).filter(Boolean))]
  // ローカル状態で楽観的更新（DBラウンドトリップ待ちのタイムラグを潰す）。propsが変わったら同期。
  const [localAcq, setLocalAcq] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  useEffect(() => { setLocalAcq(acquisitions) }, [acquisitions])

  const findMuniRow = (muni: string) => localAcq.find(a => (a.scope ?? 'municipality') === 'municipality' && (a.target_municipality ?? '') === muni)
  const findPropRow = (propId: string) => localAcq.find(a => (a.scope ?? 'property') === 'property' && a.target_property_id === propId)
  const hasMuniItem = (muni: string, item: string) => { const r = findMuniRow(muni); return !!r && itemsOf(r).includes(item) }
  const hasPropItem = (propId: string, item: string) => { const r = findPropRow(propId); return !!r && itemsOf(r).includes(item) }

  const toggleMuni = async (muni: string, item: string) => {
    const row = findMuniRow(muni)
    if (!row) {
      // 楽観的追加：先に画面に反映（IDは一時値）→ DB挿入 → 実IDで差し替え
      const tempId = `__tmp_${Date.now()}`
      const tempRow = { id: tempId, case_id: caseId, scope: 'municipality', target_municipality: muni, item_type: item, item_types: [item], request_to: `${stripPref(muni)}役所`, sort_order: 0 } as unknown as RealEstateAcquisitionRow
      setLocalAcq(prev => [...prev, tempRow])
      const { data, error } = await supabase.from('real_estate_acquisitions').insert({ case_id: caseId, scope: 'municipality', target_municipality: muni, item_type: item, item_types: [item], request_to: `${stripPref(muni)}役所`, sort_order: 0 }).select().single()
      if (error) { setLocalAcq(prev => prev.filter(r => r.id !== tempId)); showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
      if (data) setLocalAcq(prev => prev.map(r => r.id === tempId ? (data as unknown as RealEstateAcquisitionRow) : r))
    } else {
      const cur = itemsOf(row)
      const next = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item]
      if (next.length === 0) {
        // 楽観的削除
        setLocalAcq(prev => prev.filter(r => r.id !== row.id))
        const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', row.id)
        if (error) { setLocalAcq(prev => [...prev, row]); showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
      } else {
        // 楽観的更新
        setLocalAcq(prev => prev.map(r => r.id === row.id ? { ...r, item_types: next, item_type: next[0] } : r))
        const { error } = await supabase.from('real_estate_acquisitions').update({ item_types: next, item_type: next[0] }).eq('id', row.id)
        if (error) { setLocalAcq(prev => prev.map(r => r.id === row.id ? row : r)); showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
      }
    }
    onRefresh?.()
  }
  const toggleProp = async (prop: RealEstatePropertyRow, item: string) => {
    const row = findPropRow(prop.id)
    if (!row) {
      const propMuni = (prop.municipality ?? '').trim() || null
      const tempId = `__tmp_${Date.now()}`
      const tempRow = { id: tempId, case_id: caseId, scope: 'property', target_property_id: prop.id, target_municipality: propMuni, item_type: item, item_types: [item], request_to: '法務局', sort_order: 0 } as unknown as RealEstateAcquisitionRow
      setLocalAcq(prev => [...prev, tempRow])
      const { data, error } = await supabase.from('real_estate_acquisitions').insert({ case_id: caseId, scope: 'property', target_property_id: prop.id, target_municipality: propMuni, item_type: item, item_types: [item], request_to: '法務局', sort_order: 0 }).select().single()
      if (error) { setLocalAcq(prev => prev.filter(r => r.id !== tempId)); showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
      if (data) setLocalAcq(prev => prev.map(r => r.id === tempId ? (data as unknown as RealEstateAcquisitionRow) : r))
    } else {
      const cur = itemsOf(row)
      const next = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item]
      if (next.length === 0) {
        setLocalAcq(prev => prev.filter(r => r.id !== row.id))
        const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', row.id)
        if (error) { setLocalAcq(prev => [...prev, row]); showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
      } else {
        setLocalAcq(prev => prev.map(r => r.id === row.id ? { ...r, item_types: next, item_type: next[0] } : r))
        const { error } = await supabase.from('real_estate_acquisitions').update({ item_types: next, item_type: next[0] }).eq('id', row.id)
        if (error) { setLocalAcq(prev => prev.map(r => r.id === row.id ? row : r)); showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
      }
    }
    onRefresh?.()
  }

  if (properties.length === 0) return null

  const chipCls = (on: boolean) =>
    `inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11.5px] font-medium border transition-colors ${
      on ? 'bg-brand-600 text-white border-brand-600'
         : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'
    }`
  const hintText = muniOnly
    ? '所在地を入力すると、市区町村ごとに名寄帳・評価証明が自動で入ります。\nオーダーシート段階は「役所へ何を請求するか」まで。\n公図・登記など物件単位の資料は、名寄帳で物件が確定してから実務タブで扱います。'
    : '物件を登録すると、市区町村と物件ごとの取得予定資料が自動で入ります。\n実務では1宛先(役所/法務局)へまとめて請求するため、1行＝1請求としてまとめて管理します。\nチップをクリックして要不要を切り替え。'

  return (
    <div className="mt-4">
      <SectionHeading
        title={muniOnly ? '取得予定資料（役所へ請求：名寄帳・評価証明）' : '取得予定資料'}
        hint={hintText}
        className="mb-2.5 pb-1.5 border-b border-gray-200"
      />
      {muniOnly && munis.length === 0 && (
        <p className="text-[12px] text-gray-400 mb-2">上の物件一覧に所在地を入力すると、市区町村ごとの名寄帳・評価証明がここに自動で入ります。</p>
      )}
      {/* PC(sm以上)＝表。横スクロールなしで全項目。 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-40">請求先</th>
              <th className="px-2.5 py-2 text-left font-semibold w-56">対象</th>
              <th className="px-2.5 py-2 text-left font-semibold">取得する資料（複数選択可）</th>
            </tr>
          </thead>
          <tbody>
            {/* 市区町村ごと */}
            {munis.map((muni, i) => (
              <tr key={`m-${muni}`} className={`border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-2 text-gray-700">{stripPref(muni)}役所</td>
                <td className="px-2.5 py-2 text-gray-600">{muni}</td>
                <td className="px-2.5 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {MUNI_ITEMS.map(item => {
                      const on = hasMuniItem(muni, item)
                      return <button key={item} type="button" onClick={() => toggleMuni(muni, item)} className={chipCls(on)}>{on && '✓'}{item}</button>
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {/* 物件ごと（オーダーシート＝muniOnlyでは非表示。物件確定後に実務タブの②法務局で扱う） */}
            {!muniOnly && properties.map((p, i) => (
              <tr key={`p-${p.id}`} className={`border-b border-gray-100 last:border-b-0 ${(munis.length + i) % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-2 text-gray-700">法務局</td>
                <td className="px-2.5 py-2 text-gray-600">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10.5px] mr-1.5">{p.property_type || '—'}</span>
                  {propLabel(p)}
                </td>
                <td className="px-2.5 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {PROP_ITEMS.map(item => {
                      const on = hasPropItem(p.id, item)
                      return <button key={item} type="button" onClick={() => toggleProp(p, item)} className={chipCls(on)}>{on && '✓'}{item}</button>
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ(sm未満)＝カード積み。1宛先=1カード（請求先＋対象を上・資料チップを下に折返し）。横スクロールなし。 */}
      <div className="sm:hidden space-y-2">
        {munis.map(muni => (
          <div key={`mc-${muni}`} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold">役所</span>
              <span className="text-[13px] font-semibold text-gray-800">{stripPref(muni)}役所</span>
            </div>
            <div className="text-[11.5px] text-gray-500 mb-2">対象：{muni}</div>
            <div className="text-[10.5px] text-gray-400 mb-1.5">取得する資料（複数選択）</div>
            <div className="flex flex-wrap gap-2">
              {MUNI_ITEMS.map(item => {
                const on = hasMuniItem(muni, item)
                return <button key={item} type="button" onClick={() => toggleMuni(muni, item)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}>{on && '✓'}{item}</button>
              })}
            </div>
          </div>
        ))}
        {!muniOnly && properties.map(p => (
          <div key={`pc-${p.id}`} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold">法務局</span>
              <span className="text-[13px] font-semibold text-gray-800">法務局</span>
            </div>
            <div className="text-[11.5px] text-gray-500 mb-2">
              対象：<span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] mr-1">{p.property_type || '—'}</span>{propLabel(p)}
            </div>
            <div className="text-[10.5px] text-gray-400 mb-1.5">取得する資料（複数選択）</div>
            <div className="flex flex-wrap gap-2">
              {PROP_ITEMS.map(item => {
                const on = hasPropItem(p.id, item)
                return <button key={item} type="button" onClick={() => toggleProp(p, item)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}>{on && '✓'}{item}</button>
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

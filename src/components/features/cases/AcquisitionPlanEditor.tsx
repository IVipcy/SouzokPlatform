'use client'

// オーダーシート＞財産調査＞不動産 の「取得予定資料」を編集する軽量エディタ。
// 1宛先＝1請求＝1行、資料は複数選択（item_types）方式。migration 183 で導入。
// - 市区町村ごと（scope=municipality）＝名寄帳・固定資産評価証明。市区町村役場へ請求。
// - 物件ごと（scope=property）＝登記情報・公図・地積測量図・路線価。法務局へ請求。
// 物件を追加すると RealEstateTable 側で自動insertされる（is_additional=false）。

import { Files, Sparkles, Building, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { municipalityOf } from './RealEstateSection'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow } from '@/types'

const MUNI_ITEMS = ['名寄帳', '固定資産評価証明'] as const  // 市区町村役場へ請求
const PROP_ITEMS = ['登記情報', '公図', '地積測量図', '路線価'] as const  // 法務局へ請求

const stripPref = (m: string) => m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'
const itemsOf = (r: RealEstateAcquisitionRow): string[] => r.item_types ?? (r.item_type ? [r.item_type] : [])

export default function AcquisitionPlanEditor({ caseId, properties, acquisitions, onRefresh }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()

  // 市区町村一覧（物件から抽出）
  const munis = [...new Set(properties.map(municipalityOf).filter(Boolean))]

  // 該当行を探す（宛先×対象で一意）
  const findMuniRow = (muni: string) => acquisitions.find(a => (a.scope ?? 'municipality') === 'municipality' && (a.target_municipality ?? '') === muni)
  const findPropRow = (propId: string) => acquisitions.find(a => (a.scope ?? 'property') === 'property' && a.target_property_id === propId)

  const hasMuniItem = (muni: string, item: string) => {
    const r = findMuniRow(muni); return !!r && itemsOf(r).includes(item)
  }
  const hasPropItem = (propId: string, item: string) => {
    const r = findPropRow(propId); return !!r && itemsOf(r).includes(item)
  }

  // 資料の追加/削除は「行の item_types を書き換え」。行が無ければ新規作成、資料ゼロなら行を削除。
  const toggleMuni = async (muni: string, item: string) => {
    const row = findMuniRow(muni)
    if (!row) {
      const { error } = await supabase.from('real_estate_acquisitions').insert({
        case_id: caseId, scope: 'municipality', target_municipality: muni,
        item_type: item, item_types: [item],
        request_to: `${stripPref(muni)}役所`, sort_order: 0,
      })
      if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    } else {
      const cur = itemsOf(row)
      const next = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item]
      if (next.length === 0) {
        const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', row.id)
        if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
      } else {
        const { error } = await supabase.from('real_estate_acquisitions').update({ item_types: next, item_type: next[0] }).eq('id', row.id)
        if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
      }
    }
    onRefresh?.()
  }
  const toggleProp = async (prop: RealEstatePropertyRow, item: string) => {
    const row = findPropRow(prop.id)
    if (!row) {
      const propMuni = (prop.municipality ?? '').trim() || null
      const { error } = await supabase.from('real_estate_acquisitions').insert({
        case_id: caseId, scope: 'property', target_property_id: prop.id, target_municipality: propMuni,
        item_type: item, item_types: [item], request_to: '法務局', sort_order: 0,
      })
      if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    } else {
      const cur = itemsOf(row)
      const next = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item]
      if (next.length === 0) {
        const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', row.id)
        if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
      } else {
        const { error } = await supabase.from('real_estate_acquisitions').update({ item_types: next, item_type: next[0] }).eq('id', row.id)
        if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
      }
    }
    onRefresh?.()
  }

  if (properties.length === 0) return null

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Files className="w-4 h-4 text-brand-600" strokeWidth={2} />
        <span className="text-[13px] font-medium text-brand-900">取得予定資料</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Sparkles className="w-3 h-3" strokeWidth={2} />物件から自動
        </span>
      </div>
      <p className="text-[11.5px] text-gray-500 mb-3 leading-relaxed">
        物件を登録すると、市区町村と物件ごとの取得予定資料が自動で入ります。要らないものは外す、必要なら追加できます。
        <strong className="font-medium">1宛先＝1請求</strong>としてまとめて扱います（発送/到着/費用も1件で管理）。
      </p>

      {/* 市区町村ごと */}
      {munis.length > 0 && (
        <div className="mb-3">
          {munis.map(muni => (
            <div key={muni} className="mb-2 last:mb-0">
              <div className="text-[11px] text-gray-500 mb-1 inline-flex items-center gap-1">
                <Building className="w-3 h-3" strokeWidth={2} />{muni}（市区町村役場へ請求・1件にまとめて）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MUNI_ITEMS.map(item => {
                  const on = hasMuniItem(muni, item)
                  return (
                    <button key={item} type="button" onClick={() => toggleMuni(muni, item)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`}>
                      {on && '✓ '}{item}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 物件ごと */}
      <div>
        <div className="text-[11px] text-gray-500 mb-1 inline-flex items-center gap-1">
          <Landmark className="w-3 h-3" strokeWidth={2} />法務局へ請求（物件ごと・1件にまとめて）
        </div>
        <div className="flex flex-col gap-2">
          {properties.map(p => (
            <div key={p.id}>
              <div className="text-[11px] text-gray-600 mb-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] mr-1">{p.property_type || '—'}</span>
                {propLabel(p)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PROP_ITEMS.map(item => {
                  const on = hasPropItem(p.id, item)
                  return (
                    <button key={item} type="button" onClick={() => toggleProp(p, item)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`}>
                      {on && '✓ '}{item}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

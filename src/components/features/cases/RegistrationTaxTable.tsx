'use client'

// 相続登記の登録免許税 計算書【概算】。実物のエクセル「登録免許税計算書」と同じ形。
//   価格（固定資産評価額）× 持分 ＝ 課税価格 → × 0.4%（4/1000）＝ 登録免許税
// エクセルと同じく端数処理はしない概算。実際の納付額は
// 課税価格を1,000円未満切捨→税額を100円未満切捨 で決まるので、申請時は別途確認する。
//
// 計算結果は「各物件の登録免許税に反映」で real_estate_properties.registration_cost に書き戻せる。
// そこは請求タブの立替実費（登録免許税）が参照している列なので、二重入力にならない。

import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SectionHeading } from '@/components/ui/InlineFields'
import { shareRatio, shareText } from '@/lib/constants'
import type { RealEstatePropertyRow } from '@/types'

const TAX_RATE = 0.004
const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

/** 課税価格＝評価額×持分（持分未入力は全部所有） */
export const taxableValue = (p: RealEstatePropertyRow): number =>
  (p.appraisal_value ?? 0) * shareRatio(p.share_numerator, p.share_denominator)
/** 登録免許税（概算）＝課税価格×0.4% */
export const registrationTax = (p: RealEstatePropertyRow): number => taxableValue(p) * TAX_RATE

export default function RegistrationTaxTable({ properties, onRefresh }: {
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)

  // 対象は評価額が入っている物件だけ（未調査の物件を0円で並べても意味がない）
  const targets = properties.filter(p => p.appraisal_value != null)
  const land = targets.filter(p => p.property_type === '土地')
  const building = targets.filter(p => p.property_type !== '土地')
  const total = targets.reduce((s, p) => s + registrationTax(p), 0)

  const applyAll = async () => {
    setBusy(true)
    await Promise.all(targets.map(p =>
      supabase.from('real_estate_properties').update({ registration_cost: Math.round(registrationTax(p)) }).eq('id', p.id)))
    setBusy(false)
    showToast('各物件の登録免許税に反映しました', 'success')
    onRefresh?.()
  }

  const group = (title: string, rows: RealEstatePropertyRow[], numberLabel: string) => {
    if (rows.length === 0) return null
    const sub = rows.reduce((s, p) => s + registrationTax(p), 0)
    return (
      <tbody>
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-600">{title}<span className="ml-2 font-normal text-gray-400">{rows.length}件</span></td>
        </tr>
        {rows.map(p => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="px-2.5 py-1.5 text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
            <td className="px-2.5 py-1.5 text-gray-600">{(p.property_type === '土地' ? p.lot_number : p.kaoku_bango) || <span className="text-gray-300">—</span>}</td>
            <td className="px-2.5 py-1.5 text-right tabular-nums">{yen(p.appraisal_value ?? 0)}</td>
            <td className="px-2.5 py-1.5 text-center text-gray-600 tabular-nums">{shareText(p.share_numerator, p.share_denominator) || '全部'}</td>
            <td className="px-2.5 py-1.5 text-right tabular-nums">{yen(taxableValue(p))}</td>
            <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-brand-800">{yen(registrationTax(p))}</td>
            <td className="px-2.5 py-1.5 text-right text-[11px] text-gray-400 tabular-nums">
              {p.registration_cost != null ? `登録済 ${yen(p.registration_cost)}` : ''}
            </td>
          </tr>
        ))}
        <tr className="border-b border-gray-200">
          <td colSpan={5} className="px-2.5 py-1.5 text-[11.5px] text-gray-500 text-right">{numberLabel} 小計</td>
          <td className="px-2.5 py-1.5 text-right tabular-nums text-[12.5px] font-semibold text-gray-700">{yen(sub)}</td>
          <td />
        </tr>
      </tbody>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5">
      <SectionHeading
        title="登録免許税 計算書【概算】"
        hint="評価額 × 持分 × 0.4% で計算します。端数処理をしていない概算なので、申請時の納付額は別途確認してください。"
        className="mb-2.5 pb-1.5 border-b border-gray-200"
        right={targets.length > 0 ? (
          <button type="button" onClick={applyAll} disabled={busy}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded px-2 py-1 disabled:opacity-50">
            <Calculator className="w-3 h-3" />各物件の登録免許税に反映
          </button>
        ) : undefined}
      />
      {targets.length === 0 ? (
        <p className="px-1 py-4 text-center text-[12.5px] text-gray-400">評価額が入力された物件がありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 760 }}>
            <thead>
              <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <th className="px-2.5 py-2 text-left font-semibold">所在</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">地番・家屋番号</th>
                <th className="px-2.5 py-2 text-right font-semibold w-32">価格</th>
                <th className="px-2.5 py-2 text-center font-semibold w-28">持分</th>
                <th className="px-2.5 py-2 text-right font-semibold w-32">価格×持分</th>
                <th className="px-2.5 py-2 text-right font-semibold w-32">登録免許税<span className="block text-[10px] font-normal text-brand-500">×4/1000</span></th>
                <th className="px-2.5 py-2 text-right font-semibold w-32">物件に登録済</th>
              </tr>
            </thead>
            {group('土地', land, '土地')}
            {group('建物', building, '建物')}
            <tfoot>
              <tr className="border-t border-brand-200 bg-brand-50/40 font-bold text-brand-900">
                <td className="px-2.5 py-2" colSpan={5}>登録免許税 合計（概算）</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{yen(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

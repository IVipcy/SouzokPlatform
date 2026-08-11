'use client'

// 財産の合計（案件全体）。オーダーシートの「財産調査」の先頭に1つだけ置く。
//
// 以前は 不動産ブロックと金融資産ブロックがそれぞれ自分のぶんだけ合計を出していて、
// 案件全体でいくらなのかがどこにも出ていなかった。合計はここ1か所にする。
//
// 金額は「確定済」に限らず入力されている値をそのまま足す（調査中の概算を見たいため）。
// 確定額は財産目録で管理する。

import { OTHER_ASSET_KINDS } from '@/lib/constants'
import type { RealEstatePropertyRow, FinancialAssetRow, CaseOtherAssetRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

export default function AssetsTotalBand({ properties, financialAssets, otherAssets }: {
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  otherAssets: CaseOtherAssetRow[]
}) {
  const finSum = (kind: string) => financialAssets.filter(a => a.asset_type === kind).reduce((s, a) => s + (a.balance_amount ?? 0), 0)
  const items: Array<{ label: string; amount: number; negative?: boolean }> = [
    { label: '不動産', amount: properties.reduce((s, p) => s + (p.appraisal_value ?? 0), 0) },
    { label: '預金', amount: finSum('預貯金') },
    { label: '証券', amount: finSum('証券') },
    { label: '信託', amount: finSum('信託銀行') },
    ...OTHER_ASSET_KINDS.map(k => ({
      label: k.kind,
      amount: otherAssets.filter(r => r.kind === k.kind).reduce((s, r) => s + (r.amount ?? 0), 0),
      negative: k.negative,
    })),
  ].filter(x => x.amount !== 0)

  const positive = items.filter(x => !x.negative).reduce((s, x) => s + x.amount, 0)
  const negative = items.filter(x => x.negative).reduce((s, x) => s + x.amount, 0)

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/50 px-3.5 py-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="text-[11.5px] text-gray-500">財産の合計{negative > 0 ? '（正味）' : ''}</span>
        <span className="text-[22px] font-bold text-brand-800 tabular-nums leading-none">{yen(positive - negative)}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-gray-400">まだ金額が入っていません。下の各表に入力すると、ここに合計が出ます。</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
          {items.map(x => (
            <span key={x.label} className="text-gray-600">
              {x.label} <span className={`font-semibold tabular-nums ${x.negative ? 'text-red-700' : ''}`}>{x.negative ? `− ${yen(x.amount)}` : yen(x.amount)}</span>
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10.5px] text-gray-400">入力済みの金額をそのまま集計した概算です（確定前の金額も含みます）。確定額は財産目録で管理します。</p>
    </div>
  )
}

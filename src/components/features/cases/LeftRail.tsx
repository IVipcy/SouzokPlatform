'use client'

// 左レール（縦リスト）共通部品。TOP＋各項目＋追加ボタンを縦に並べる。戸籍・金融・不動産・解約で共用。
//
// 全行を同じ4列（点／名前／件数／到着）に固定する。列があるので、無い行も空欄で幅を保ち、
// 数字や「到着」が行によって左右にずれない。1行40px・1行組み。
// 色は棒ではなく点（選択の青い棒だけが棒）。角丸のチップは使わない。
import { Table2, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

export type RailItem = {
  key: string
  label: string
  /** 名前の後ろに薄く続ける補足（依頼者・死亡 など） */
  note?: string | null
  /** 名前の前の太字（続柄など）。指定すると「太字＋名前」の並びになる */
  lead?: string | null
  /** 点の色。戸籍は続柄の色、それ以外は状態の色。null なら点を出さない */
  dotColor?: string | null
  /** 件数（口座数・請求数など）。null なら空欄 */
  count?: number | null
  status?: string | null
  locked?: boolean
  /** 到着物があるか。true で右端に「到着」 */
  received?: boolean
}

export function LeftRail({ items, active, onChange, extra, onDelete, width = 'w-56' }: {
  items: RailItem[]
  active: string
  onChange: (key: string) => void
  extra?: ReactNode
  onDelete?: (key: string) => void  // 指定時、TOP以外の各項目にホバーで削除ボタンを表示
  /** 戸籍は続柄＋氏名で長くなるので広め（w-72） */
  width?: string
}) {
  return (
    <div className={`flex-none ${width} flex flex-col bg-white p-1.5 self-start`}>
      {items.map(it => {
        const isTop = it.key === 'top'
        const on = active === it.key
        return (
          <div key={it.key} className="group/rail relative flex items-center">
            <button type="button" onClick={() => onChange(it.key)}
              className={`flex-1 min-w-0 h-10 px-2.5 grid items-center gap-2 text-left text-[13.5px] ${isTop ? 'grid-cols-[16px_minmax(0,1fr)]' : 'grid-cols-[8px_minmax(0,1fr)_1.5rem_2.25rem]'} ${
                on ? 'bg-brand-50 text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-600)]' : 'text-gray-700 hover:bg-gray-50'}`}>
              {isTop ? (
                <>
                  <Table2 className="w-4 h-4 text-gray-500" />
                  <span className="truncate">{it.label}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: it.dotColor ?? 'transparent' }} />
                  <span className="truncate">
                    {it.lead && <span className={`font-semibold ${on ? 'text-brand-800' : 'text-gray-800'}`}>{it.lead}</span>}
                    <span className={it.lead ? 'ml-1.5' : `font-medium ${on ? 'text-brand-800' : 'text-gray-800'}`}>{it.label}</span>
                    {it.note && <span className="ml-1.5 text-[12px] text-gray-400">{it.note}</span>}
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-gray-500">{it.count != null ? it.count : ''}</span>
                  <span className="text-right text-[11.5px] font-semibold text-emerald-700">{it.received ? '到着' : ''}</span>
                </>
              )}
            </button>
            {onDelete && !isTop && (
              <button type="button" onClick={() => onDelete(it.key)} title="この項目を一括削除"
                className="flex-none ml-0.5 p-1 text-gray-300 opacity-0 group-hover/rail:opacity-100 hover:text-red-500 transition-opacity">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      })}
      {extra}
    </div>
  )
}

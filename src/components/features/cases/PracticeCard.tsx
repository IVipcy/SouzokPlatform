'use client'

// 実務タブ共通の「項目名が左・入力欄が右」のカード。
// 戸籍請求タブ（KosekiGroup / KosekiFieldRow）と同じ見た目。金融・不動産もこれで揃える。
//   PracticeGroup … 見出し（Step番号＋タイトル）＋ 4列グリッド（ラベル・値・ラベル・値）
//   PracticeRow   … 1項目。full で1行を使い切る。disabled で薄くして触れなくする

import HintTip from '@/components/ui/HintTip'
import type { ReactNode } from 'react'

export function PracticeGroup({ no, title, sub, right, children, tone = 'normal' }: {
  no?: string
  title: string
  /** タイトルの右に出す小さな補足 */
  sub?: string
  /** 見出しの右端（要否のチェック・状態チップなど） */
  right?: ReactNode
  children: ReactNode
  /** muted＝要らないと決めた工程（薄くする） */
  tone?: 'normal' | 'muted'
}) {
  return (
    <div className={`rounded-lg border border-gray-200 overflow-hidden ${tone === 'muted' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="inline-block w-[3px] h-3 bg-brand-500 rounded-[1px]" />
        {no && <span className="text-[10.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded px-1.5">{no}</span>}
        <span className="text-[12px] font-semibold text-gray-600">{title}</span>
        {sub && <span className="text-[10.5px] text-gray-400">{sub}</span>}
        {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
      </div>
      {children != null && children !== false && (
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)] gap-px bg-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

export function PracticeRow({ label, hint, sub, children, full = false, disabled = false, disabledNote }: {
  label: string
  hint?: string
  sub?: string
  children: ReactNode
  full?: boolean
  disabled?: boolean
  disabledNote?: string
}) {
  // full のときはラベル1列＋値3列＝4列で1行を使い切る。
  // 外側は display:contents なので col-span は中の2つに掛ける。ラベルに col-start-1 が要る
  // （前の行が2列で終わっていると full の行が3列目から始まって崩れる）。
  const dim = disabled ? 'opacity-45' : ''
  return (
    <div className="contents">
      <div className={`bg-gray-50/80 border-r border-gray-100 px-3 py-2 flex flex-col justify-center text-[11.5px] font-semibold text-gray-600 leading-snug ${dim} ${full ? 'sm:col-start-1' : ''}`}>
        <span className="inline-flex items-center gap-1">{label}{hint && !disabled && <HintTip text={hint} />}</span>
        {sub && <span className="text-[10px] font-normal text-brand-700">{sub}</span>}
      </div>
      <div className={`bg-white px-3 py-2 flex items-center gap-2 flex-wrap min-h-[42px] ${dim} ${disabled ? 'pointer-events-none select-none' : ''} ${full ? 'sm:col-span-3' : ''}`}>
        {children}
        {disabled && disabledNote && <span className="text-[10.5px] text-gray-500">{disabledNote}</span>}
      </div>
    </div>
  )
}

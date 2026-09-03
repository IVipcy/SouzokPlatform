'use client'

// 実務タブ共通の「項目名が左・入力欄が右」のカード。戸籍・金融・不動産で共用。
//
// 寸法と色は他事業者紹介（InlineFields の FieldRow / FieldGrid）に揃える：
//   項目名 12.5px・slate-100 の面・右に slate-300 の線／内容 13px・行の高さ 44px／区切りはセルの下線。
// 入力欄そのものは PracticeTableCells の .input-flat（文字＋破線の下線）で、箱に見せない。
// 以前は「カードの枠＋見出し帯＋灰色のマス目＋箱の入力欄」で額縁が3段になり、読む前に目が疲れていた。
//
//   PracticeGroup … 見出し（Step番号＋タイトル）＋ 4列（ラベル・値・ラベル・値）
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
    <div className={`rounded-md border border-slate-300 overflow-hidden bg-white ${tone === 'muted' ? 'opacity-60' : ''}`}>
      {/* 見出しは薄い区切り行。帯にせず、項目名の面と同じ色で1段に見せる */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border-b border-slate-300">
        {no && <span className="text-[11px] font-semibold text-brand-700">{no}</span>}
        <span className="text-[12.5px] font-semibold text-gray-700">{title}</span>
        {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
        {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
      </div>
      {children != null && children !== false && (
        // 区切りはセルの下線（FieldGrid と同じ）。最後の行の下線はカードの枠と重なるので消す
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)] [&>div>div]:border-b [&>div>div]:border-slate-200 [&>div:last-child>div]:border-b-0 [&>div:nth-last-child(2)>div]:sm:border-b-0">
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
      <div className={`bg-slate-100 border-r border-slate-300 px-3 py-2 flex flex-col justify-center text-[12.5px] font-semibold text-gray-600 tracking-wide leading-snug ${dim} ${full ? 'sm:col-start-1' : ''}`}>
        <span className="inline-flex items-center gap-1">{label.trim()}{hint && !disabled && <HintTip text={hint} />}</span>
        {sub && <span className="text-[10.5px] font-normal text-gray-400 leading-tight">{sub}</span>}
      </div>
      <div className={`bg-white px-3 py-2 flex items-center gap-2 flex-wrap min-h-[44px] text-[13px] ${dim} ${disabled ? 'pointer-events-none select-none' : ''} ${full ? 'sm:col-span-3' : ''}`}>
        {children}
        {disabled && disabledNote && <span className="text-[11px] text-gray-500">{disabledNote}</span>}
      </div>
    </div>
  )
}

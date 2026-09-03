'use client'

// 実務タブ共通の「項目名が左・入力欄が右」の表。戸籍・金融・不動産で共用。
//
// 引き算の型：枠線も角丸も持たない。白い面（親）の上に、見出しと表があるだけ。
//   文字は業務システムの標準（値14px／項目名13px／注記12px）。
//   項目名の列は 9.5rem（152px）固定で折り返さない。長い名前は「短い名前（注記）」と書けば、
//   カッコの中身を自動で2行目の小さな注記に落とす（InlineFields の FieldRow と同じ）。
//   区切りはセルの下線と、項目名と値の間の細い縦線だけ。項目名の面も塗らない（太字と位置で分かる）。
//   Step は白地に太字＋下線の見出し。
//   入力欄そのものは PracticeTableCells の .input-flat（文字＋破線の下線）で、箱に見せない。
//
//   PracticeGroup … Step の区切り行 ＋ 4列（ラベル・値・ラベル・値）
//   PracticeRow   … 1項目。full で1行を使い切る。disabled で薄くして触れなくする

import HintTip from '@/components/ui/HintTip'
import type { ReactNode } from 'react'

const splitParen = (label: string): { main: string; note?: string } => {
  const m = label.match(/^(.+?)（(.+)）$/)
  return m ? { main: m[1], note: m[2] } : { main: label }
}

export function PracticeGroup({ no, title, sub, right, children, tone = 'normal' }: {
  no?: string
  title: string
  /** タイトルの右に出す短い説明 */
  sub?: string
  /** 区切り行の右端（要否のチェック・状態ラベルなど） */
  right?: ReactNode
  children: ReactNode
  /** muted＝要らないと決めた工程（薄くする） */
  tone?: 'normal' | 'muted'
}) {
  return (
    <div className={tone === 'muted' ? 'opacity-55' : ''}>
      {/* Step の見出し。白地に太字＋下線（A案）。塗るのは項目名の面だけにして、見出しと項目名の境目をはっきりさせる。
          上の余白（pt-3.5）で前の表と区切る。帯にも枠にもしない */}
      <div className="flex items-center gap-2.5 px-3 pt-3.5 pb-1.5 bg-white border-b border-slate-300 min-h-[44px]">
        {no && <span className="text-[14px] font-bold text-brand-700">{no}</span>}
        <span className="text-[14px] font-bold text-gray-900">{title}</span>
        {sub && <span className="text-[12px] text-gray-500 ml-1">{sub}</span>}
        {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
      </div>
      {children != null && children !== false && (
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)_9.5rem_minmax(0,1fr)]">
          {children}
        </div>
      )}
    </div>
  )
}

export function PracticeRow({ label, hint, sub, children, full = false, disabled = false, disabledNote }: {
  label: string
  hint?: string
  /** 項目名の下の注記。「短い名前（注記）」と書いても同じ */
  sub?: string
  children: ReactNode
  full?: boolean
  disabled?: boolean
  disabledNote?: string
}) {
  // full のときはラベル1列＋値3列＝4列で1行を使い切る。
  // 外側は display:contents なので col-span は中の2つに掛ける。ラベルに col-start-1 が要る
  // （前の行が2列で終わっていると full の行が3列目から始まって崩れる）。
  const { main, note } = splitParen(label.trim())
  const dim = disabled ? 'opacity-45' : ''
  return (
    <div className="contents">
      <div className={`bg-white border-b border-r border-slate-200 px-3 py-2 flex flex-col justify-center text-[13px] font-semibold text-gray-600 leading-snug whitespace-nowrap overflow-hidden ${dim} ${full ? 'sm:col-start-1' : ''}`}>
        <span className="inline-flex items-center gap-1 truncate">{main}{hint && !disabled && <HintTip text={hint} />}</span>
        {(sub ?? note) && <span className="text-[12px] font-normal text-gray-500 leading-tight truncate">{sub ?? note}</span>}
      </div>
      <div className={`bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 flex-wrap min-h-[44px] text-[14px] text-gray-800 ${dim} ${disabled ? 'pointer-events-none select-none' : ''} ${full ? 'sm:col-span-3' : ''}`}>
        {children}
        {disabled && disabledNote && <span className="text-[12px] text-gray-500">{disabledNote}</span>}
      </div>
    </div>
  )
}

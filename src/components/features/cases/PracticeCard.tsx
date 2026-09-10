'use client'

// 実務タブ共通の「項目名が左・入力欄が右」の表。戸籍・金融・不動産で共用。
//
// 引き算の型：枠線も角丸も持たない。白い面（親）の上に、見出しと表があるだけ。
//   文字は業務システムの標準（値14px／項目名13px／注記12px）。項目名は薄い灰色（gray-500・medium）で、値より引っ込める。
//   項目名の列は 9.5rem（152px）固定で折り返さない。長い名前は「短い名前（注記）」と書けば、
//   カッコの中身を自動で2行目の小さな注記に落とす（InlineFields の FieldRow と同じ）。
//   塗るのは項目名の面（ブルーグレー #e6edf5・文字slate-700。表の見出し thead th と同じ色）だけ。見出しも値の面も白。
//   項目名どうしは白い2pxの線で切る（面と同じ色の線だとくっついて見える）。値の側は薄い下線。
//   Step は白地に太字＋下線の見出し。
//   入力欄は PracticeTableCells の .input-flat（オーダーシートと同じ薄い灰色の面）。
//
//   PracticeGroup … Step の区切り行 ＋ 4列（ラベル・値・ラベル・値）
//   PracticeRow   … 1項目。full で1行を使い切る。disabled で薄くして触れなくする

import HintTip from '@/components/ui/HintTip'
import { useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

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

/**
 * 畳める Step。閉じているときは薄い見出しだけ（何を入れる欄かの一言つき）。
 * autoOpen＝進み具合から開くべきか（請求日・到着日が入った等）。手で開閉したらそちらを優先。
 * カードは請求ごとに key で作り直すので、開閉の状態も請求ごとに戻る。戸籍・不動産で共用。
 */
export function PracticeFoldGroup({ no, title, sub, autoOpen, closedNote, children }: {
  no: string
  title: string
  sub?: string
  autoOpen: boolean
  closedNote: string
  children: ReactNode
}) {
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? autoOpen
  if (!open) {
    return (
      <button type="button" onClick={() => setManual(true)}
        className="w-full flex items-center gap-2.5 px-3 pt-3.5 pb-1.5 min-h-[44px] bg-white border-b border-slate-200 text-left hover:bg-slate-50">
        <span className="text-[14px] font-bold text-gray-400">{no}</span>
        <span className="text-[14px] font-bold text-gray-400">{title}</span>
        {sub && <span className="text-[12px] text-gray-400 ml-1 truncate">{sub}</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-gray-500 flex-none">{closedNote}<ChevronRight className="w-3.5 h-3.5" /></span>
      </button>
    )
  }
  return (
    <PracticeGroup no={no} title={title} sub={sub}
      right={
        <button type="button" onClick={() => setManual(false)} className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800">
          閉じる<ChevronDown className="w-3.5 h-3.5" />
        </button>
      }>
      {children}
    </PracticeGroup>
  )
}

/** 操作バー。「ここまでで請求できます」と、この請求への操作を1か所に集める（戸籍・不動産・金融で同じ型） */
export function PracticeActionBar({ title, note, children }: { title: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 border border-slate-200">
      <span className="text-[13px] font-bold text-brand-700">{title}</span>
      {note && <span className="text-[12px] text-gray-500">{note}</span>}
      {children && <span className="ml-auto flex items-center gap-2">{children}</span>}
    </div>
  )
}

/** 「ここから下は、請求したあと・届いたあとに入力します」の区切り */
export function PracticeAfterDivider({ text = 'ここから下は、請求したあと・届いたあとに入力します' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 text-[12px] text-gray-500">
      <span className="flex-1 border-t border-dashed border-slate-300" />
      {text}
      <span className="flex-1 border-t border-dashed border-slate-300" />
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
      <div className={`bg-[#e6edf5] border-b-2 border-r-2 border-white px-3 py-2 flex flex-col justify-center text-[13px] font-medium text-slate-700 leading-snug whitespace-nowrap overflow-hidden ${dim} ${full ? 'sm:col-start-1' : ''}`}>
        <span className="inline-flex items-center gap-1 truncate">{main}{hint && !disabled && <HintTip text={hint} />}</span>
        {(sub ?? note) && <span className="text-[12px] font-normal text-slate-500 leading-tight truncate">{sub ?? note}</span>}
      </div>
      <div className={`bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 flex-wrap min-h-[44px] text-[14px] text-gray-800 ${dim} ${disabled ? 'pointer-events-none select-none' : ''} ${full ? 'sm:col-span-3' : ''}`}>
        {children}
        {disabled && disabledNote && <span className="text-[12px] text-gray-500">{disabledNote}</span>}
      </div>
    </div>
  )
}

'use client'

// 実務タブの「1行=1明細」表で使う共通インライン編集セル。
// 戸籍・相続登記など、詳細をカードでなく表にマージした画面で共有する。

import { useState, useEffect, useRef } from 'react'
import { UserCheck, X, ChevronDown } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import HankoStamp from '@/components/ui/HankoStamp'

// 箱に見せない（文字＋破線の下線。触ると下線が青くなる）。見た目は globals.css の .input-flat が持つ。
// 他事業者紹介の「文字に見えて、触ると編集」に寄せるため。文字は他事業者紹介と同じ13px。
const cellInp = 'input-flat w-full px-1 py-1 text-[14px] text-gray-800 outline-none'
// 全角→半角、数字以外を除去した「生の数字文字列」を返す。
const toDigits = (s: string) => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[^\d]/g, '')
const cellSel = 'input-flat w-full px-1 py-1 text-[14px] text-gray-800 outline-none cursor-pointer'

export function TxtCell({ value, onCommit, placeholder, list }: { value: string | null; onCommit: (v: string) => void; placeholder?: string; list?: string }) {
  return <input type="text" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }} placeholder={placeholder} list={list} className={cellInp} />
}

export function SelCell({ value, options, onChange }: { value: string | null; options: readonly string[]; onChange: (v: string) => void }) {
  // font-family を継承（ネイティブselectはシステムフォントで描画され、入力欄より大きく見えるため）
  return <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ fontFamily: 'inherit' }} className={cellSel}><option value="">—</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
}

// 複数選択のセル。「戸籍・除籍・原戸籍」のように「・」でつないだ1つの文字列で持つ。
// 依頼書1枚で何を頼むか（種別①）など、同時に複数あり得るものに使う。
export function MultiCell({ value, options, onChange, disabled = false }: {
  value: string | null
  options: readonly string[]
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  const picked = (value ?? '').split('・').map(x => x.trim()).filter(Boolean)
  const toggle = (o: string) => {
    const next = picked.includes(o) ? picked.filter(x => x !== o) : [...picked, o]
    // 選択肢の並び順を保つ（押した順にならないように）
    const sorted = options.filter(x => next.includes(x))
    onChange(sorted.length > 0 ? sorted.join('・') : null)
  }
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const on = picked.includes(o)
        return (
          <button key={o} type="button" disabled={disabled} onClick={() => toggle(o)}
            className={`px-2 py-0.5 text-[13px] border transition-colors disabled:opacity-40 ${
              on ? 'bg-brand-50 text-brand-700 border-brand-400 font-semibold' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}>
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return <input type="date" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }} className={cellInp} />
}

export function MoneyCell({ value, onCommit }: { value: number | null; onCommit: (v: string) => void }) {
  const [raw, setRaw] = useState(value != null ? String(value) : '')
  const display = raw ? Number(raw).toLocaleString('en-US') : ''
  return <input type="text" inputMode="numeric" value={display} onChange={e => setRaw(toDigits(e.target.value))} onBlur={() => onCommit(raw)} placeholder="0" className={`${cellInp} text-right tabular-nums`} />
}

// ダブルチェック（自分以外）。押すと現在ユーザー名＋日時を記録、×で取消。
// meId/workerId/isManager を渡すと「作業者＝自分」の自己チェックを弾く（管理担当は例外）。
// onSet の第3引数でチェック者の member_id を返す（*_check_by 記録用）。
export function DcCell({ name, at, me, onSet, meId, workerId, isManager, disabled, disabledLabel = '到着待ち', disabledTitle }: {
  name: string | null
  at: string | null
  me: string
  onSet: (n: string | null, a: string | null, byId?: string | null) => void
  meId?: string | null
  workerId?: string | null
  isManager?: boolean
  disabled?: boolean          // 前提未達（例: 到着日が未入力）でチェック不可
  disabledLabel?: string      // 未達時のボタン表記
  disabledTitle?: string      // 未達時のツールチップ
}) {
  const selfBlocked = !!workerId && !!meId && workerId === meId && !isManager
  const press = () => {
    if (disabled) { showToast(disabledTitle || 'まだW-Checkできません。', 'error'); return }
    if (selfBlocked) { showToast('自分の作業は自分でW-Checkできません。別の担当者が確認してください。', 'error'); return }
    onSet(me, new Date().toISOString(), meId ?? null)
  }
  // 確認済みなら朱印スタンプ＋右上に取消ボタン（前提未達でも取消は可）
  if (name) return (
    <span className="inline-flex items-center gap-1 relative">
      <HankoStamp name={name} at={at} size="sm" />
      <button type="button" onClick={() => onSet(null, null, null)} title="確認を取消"
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
    </span>
  )
  if (disabled) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-300 bg-gray-50 border border-gray-200 cursor-not-allowed" title={disabledTitle || disabledLabel}><UserCheck className="w-3 h-3" />{disabledLabel}</span>
  )
  if (selfBlocked) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-300 bg-gray-50 border border-gray-200 cursor-not-allowed" title="自分の作業は自分でW-Checkできません（別の担当者が確認）"><UserCheck className="w-3 h-3" />別者確認待ち</span>
  )
  return (
    <button type="button" onClick={press} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700"><UserCheck className="w-3 h-3" />未確認</button>
  )
}

/**
 * 定型文つきの入力欄（1つの欄＋右端の ⌄）。
 *
 * 前は「定型文を選ぶ箱」と「書く箱」が上下に2つ並んでいて、どちらに書けばいいのか
 * 分からなかった。欄は1つにして、⌄ を押したときだけ候補を出す。
 * 選ぶとその文がこの欄に入り、そのまま続けて直せる（日付を打ち替える等）。
 *
 * 候補は position:fixed で出す。カード（KosekiGroup）が overflow-hidden なので、
 * 通常の absolute だと下にはみ出したぶんが切られるため。
 */
export function TemplateTextField({ value, options, onSave, placeholder, rows = 2 }: {
  value: string | null
  options: readonly string[]
  onSave: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // 開いている間だけ位置を持つ。null＝閉じている。
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)

  const open = () => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    // 下に入らなければ上に出す（カードの最終行でも候補が読める）
    setPos(below >= 120
      ? { left: r.left, width: r.width, top: r.bottom + 4, maxH: Math.min(220, below) }
      : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxH: Math.min(220, r.top - 12) })
  }

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  const pick = (v: string) => {
    setPos(null)
    if (taRef.current) taRef.current.value = v
    onSave(v)
    taRef.current?.focus()
  }

  return (
    <div ref={boxRef} className="relative w-full min-w-0">
      <div className="flex items-stretch border border-gray-200 rounded bg-white focus-within:border-brand-500">
        {/* key を値にすると、候補を選んだり外から値が変わったときに中身が入れ替わる
            （defaultValue は最初の描画でしか効かないため） */}
        <textarea
          ref={taRef}
          key={value ?? ''}
          defaultValue={value ?? ''}
          rows={rows}
          onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-1.5 py-1 text-[12.5px] bg-transparent outline-none resize-y leading-snug"
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => (pos ? setPos(null) : open())}
            title="定型文から選ぶ"
            className="flex-none px-1.5 text-gray-400 hover:text-brand-600 border-l border-gray-200"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${pos ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {pos && (
        <div
          className="fixed z-50 bg-white border border-brand-200 rounded-md shadow-lg overflow-y-auto"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          {options.map(o => (
            <button
              key={o}
              type="button"
              // mousedown を止めて、入力欄からフォーカスが外れる（＝onBlurで古い値が保存される）のを防ぐ
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(o)}
              className="block w-full text-left px-2.5 py-1.5 text-[11.5px] leading-snug text-gray-600 hover:bg-brand-50 hover:text-brand-800 border-b border-gray-100 last:border-b-0"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 行ごとの優先度（通常/急ぎ/超急ぎ）。オーダーシートの各表の一番左に置く。
 *
 * 受注担当が「どれから手を付けてほしいか」の見立てを書いておく欄で、
 * ここを見て事務管理担当がタスクの優先度を決める。
 * タスクの優先度を自動で書き換えることはしない（決めるのは作る人）。
 */
export function PriorityCell({ value, onChange }: { value: string | null | undefined; onChange: (v: string) => void }) {
  const v = value ?? ''
  // 塗らない。急ぎは文字の色だけで言う（赤＝超急ぎ、琥珀＝急ぎ）。見た目は他のセルと同じ .input-flat
  const tone = v === '超急ぎ' ? { color: '#b91c1c', fontWeight: 700 }
    : v === '急ぎ' ? { color: '#b45309', fontWeight: 600 }
    : { color: '#6b7280' }
  return (
    <select
      value={v}
      onChange={e => onChange(e.target.value)}
      title="優先度（タスクを作るときの目安）"
      style={{ fontFamily: 'inherit', ...tone }}
      className={cellSel}
    >
      <option value="">通常</option>
      <option value="急ぎ">急ぎ</option>
      <option value="超急ぎ">超急ぎ</option>
    </select>
  )
}

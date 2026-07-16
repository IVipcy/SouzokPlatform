'use client'

import { useState, useRef } from 'react'
import { ERA_NAMES, toWarekiParts, fromWarekiParts, toWareki } from '@/lib/wareki'

// 生年月日・死亡日は役所申請で和暦が基準のため、和暦（元号＋年＋月＋日）で入力する。
// DB には従来どおり西暦 ISO(YYYY-MM-DD) で保存する。
// 入力方式：元号は選択、年月日は「数字を直接入力」。桁が埋まったら次の欄へ自動フォーカス。

type Parts = { era: string; year: string; mo: string; d: string }

function parse(v: string | null | undefined): Parts {
  const w = toWarekiParts(v)
  if (w) return { era: w.era, year: String(w.year), mo: String(w.month), d: String(w.day) }
  return { era: '', year: '', mo: '', d: '' }
}

type Props = {
  value: string | null | undefined
  /** 完成時は YYYY-MM-DD、未完成時は '' を返す */
  onChange: (v: string) => void
  className?: string
}

export default function BirthdayPicker({ value, onChange, className }: Props) {
  // ローカルを正とする（途中入力を保持するため親値とは同期しない）
  const [s, setS] = useState<Parts>(() => parse(value))
  const moRef = useRef<HTMLInputElement>(null)
  const dRef = useRef<HTMLInputElement>(null)

  const emit = (next: Parts) => {
    setS(next)
    const iso = fromWarekiParts(next.era, Number(next.year), Number(next.mo), Number(next.d))
    onChange(iso)
  }

  const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 2)

  // 年：2桁入力で月へ。月：2桁 or 先頭2〜9（=1桁月確定）で日へ。
  const onYear = (v: string) => { const y = digits(v); emit({ ...s, year: y }); if (y.length === 2) moRef.current?.focus() }
  const onMo = (v: string) => { const m = digits(v); emit({ ...s, mo: m }); if (m.length === 2 || (m.length === 1 && Number(m) >= 2)) dRef.current?.focus() }
  const onD = (v: string) => emit({ ...s, d: digits(v) })

  const iso = fromWarekiParts(s.era, Number(s.year), Number(s.mo), Number(s.d))

  const sel = 'px-0.5 py-1.5 text-[13px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'
  const num = 'px-1 py-1.5 text-[13px] text-center border border-gray-200 rounded bg-white outline-none focus:border-brand-500'
  const unit = 'text-[11px] text-gray-500 flex-shrink-0'
  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 flex-nowrap">
        <select value={s.era} onChange={e => emit({ ...s, era: e.target.value })} className={`${sel} flex-shrink-0`} style={{ minWidth: 52 }} aria-label="元号">
          <option value="">元号</option>
          {ERA_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input type="text" inputMode="numeric" value={s.year} onChange={e => onYear(e.target.value)} className={`${num} flex-shrink-0`} style={{ width: 38 }} aria-label="年" placeholder="年" />
        <span className={unit}>年</span>
        <input ref={moRef} type="text" inputMode="numeric" value={s.mo} onChange={e => onMo(e.target.value)} className={`${num} flex-shrink-0`} style={{ width: 34 }} aria-label="月" placeholder="月" />
        <span className={unit}>月</span>
        <input ref={dRef} type="text" inputMode="numeric" value={s.d} onChange={e => onD(e.target.value)} className={`${num} flex-shrink-0`} style={{ width: 34 }} aria-label="日" placeholder="日" />
        <span className={unit}>日</span>
      </div>
      {iso && (
        <div className="mt-0.5 text-[11px] text-gray-500">→ {toWareki(iso)}（{iso}）</div>
      )}
    </div>
  )
}

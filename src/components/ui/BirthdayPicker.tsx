'use client'

import { useState } from 'react'

// 生年月日は年を遡るのがカレンダーだと面倒なので、年・月・日のドロップダウンで入力する。
const NOW_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 121 }, (_, i) => NOW_YEAR - i) // 当年から120年前まで
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function parse(v: string | null | undefined) {
  const m = (v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? { y: m[1], mo: String(Number(m[2])), d: String(Number(m[3])) } : { y: '', mo: '', d: '' }
}

type Props = {
  value: string | null | undefined
  /** 完成時は YYYY-MM-DD、未完成時は '' を返す */
  onChange: (v: string) => void
  className?: string
}

export default function BirthdayPicker({ value, onChange, className }: Props) {
  // ローカルを正とする（途中入力を保持するため親値とは同期しない）
  const [s, setS] = useState(() => parse(value))

  const emit = (next: { y: string; mo: string; d: string }) => {
    setS(next)
    if (next.y && next.mo && next.d) {
      onChange(`${next.y}-${next.mo.padStart(2, '0')}-${next.d.padStart(2, '0')}`)
    } else {
      onChange('')
    }
  }

  const sel = 'px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <select value={s.y} onChange={e => emit({ ...s, y: e.target.value })} className={sel} aria-label="年">
        <option value="">年</option>
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={s.mo} onChange={e => emit({ ...s, mo: e.target.value })} className={sel} aria-label="月">
        <option value="">月</option>
        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={s.d} onChange={e => emit({ ...s, d: e.target.value })} className={sel} aria-label="日">
        <option value="">日</option>
        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  )
}

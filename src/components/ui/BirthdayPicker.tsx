'use client'

import { useState } from 'react'
import { ERA_NAMES, toWarekiParts, fromWarekiParts, toWareki } from '@/lib/wareki'

// 生年月日・死亡日は役所申請で和暦が基準のため、和暦（元号＋年＋月＋日）で入力する。
// DB には従来どおり西暦 ISO(YYYY-MM-DD) で保存する。
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

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

  const emit = (next: Parts) => {
    setS(next)
    const iso = fromWarekiParts(next.era, Number(next.year), Number(next.mo), Number(next.d))
    onChange(iso)
  }

  const sel = 'px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'
  const iso = fromWarekiParts(s.era, Number(s.year), Number(s.mo), Number(s.d))
  return (
    <div className={className}>
      <div className="flex items-center gap-1 flex-wrap">
        <select value={s.era} onChange={e => emit({ ...s, era: e.target.value })} className={sel} aria-label="元号">
          <option value="">元号</option>
          {ERA_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input
          type="number"
          min={1}
          value={s.year}
          onChange={e => emit({ ...s, year: e.target.value })}
          className={`${sel} w-14`}
          aria-label="年"
          placeholder="年"
        />
        <span className="text-[12px] text-gray-500">年</span>
        <select value={s.mo} onChange={e => emit({ ...s, mo: e.target.value })} className={sel} aria-label="月">
          <option value="">月</option>
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-[12px] text-gray-500">月</span>
        <select value={s.d} onChange={e => emit({ ...s, d: e.target.value })} className={sel} aria-label="日">
          <option value="">日</option>
          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-[12px] text-gray-500">日</span>
      </div>
      {iso && <div className="mt-0.5 text-[11px] text-gray-500">{toWareki(iso)}（西暦{iso}）</div>}
    </div>
  )
}

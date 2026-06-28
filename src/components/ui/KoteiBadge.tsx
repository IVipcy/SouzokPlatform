import { koteiOf, koteiLabel, KOTEI_COLOR } from '@/lib/kotei'

// 工程バッジ（固定幅・番号・色）。業務区分(task.phase)から工程を導出して表示する。
export function KoteiBadge({ phase, width = 104 }: { phase: string | null | undefined; width?: number }) {
  const k = koteiOf(phase)
  const c = KOTEI_COLOR[k] ?? { bg: '#F1EFE8', text: '#444441' }
  return (
    <span
      className="inline-block text-center text-[11px] font-semibold py-0.5 rounded-md flex-shrink-0 truncate align-middle"
      style={{ background: c.bg, color: c.text, width }}
      title={koteiLabel(k)}
    >
      {koteiLabel(k)}
    </span>
  )
}

// 業務区分バッジ（薄グレー）。最小幅で見た目を揃えつつ、長い名前は折り返さず伸ばす（見切れ防止）。
export function GyomuBadge({ phase, width = 56 }: { phase: string | null | undefined; width?: number }) {
  const g = (phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()
  if (!g) return <span className="text-gray-300 text-[12px]">—</span>
  return (
    <span
      className="inline-block text-center text-[11px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap align-middle text-gray-600 bg-gray-100/80 border border-gray-200"
      style={{ minWidth: width }}
      title={g}
    >
      {g}
    </span>
  )
}

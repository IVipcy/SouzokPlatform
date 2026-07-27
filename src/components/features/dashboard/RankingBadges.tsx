import { Crown, Trophy } from 'lucide-react'

// マイページの名前の右に出す月間ランキングのバッジ。
// mvp＝綜合1位（月間MVP・金）、sales/manager＝各ランキング1位（受注=青／業完=琥珀）。
export type RankBadge = { label: string; tone: 'mvp' | 'sales' | 'manager' }

const TONE: Record<RankBadge['tone'], string> = {
  mvp: 'bg-[#F6C744] text-[#6b4e00] border-transparent',
  sales: 'bg-blue-50 text-blue-700 border-blue-200',
  manager: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function RankingBadges({ badges }: { badges: RankBadge[] }) {
  if (!badges || badges.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap align-middle">
      {badges.map((b, i) => (
        <span key={i} className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border ${TONE[b.tone]}`}>
          {b.tone === 'mvp' ? <Crown className="w-3.5 h-3.5" strokeWidth={2} /> : <Trophy className="w-3 h-3" strokeWidth={2} />}{b.label}
        </span>
      ))}
    </span>
  )
}

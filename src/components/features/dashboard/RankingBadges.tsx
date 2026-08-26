import { Crown, Trophy } from 'lucide-react'

// マイページの名前の「上」に出す月間ランキングの称号。
// 文字は出さずアイコンだけを並べ、ホバーでランキング名を出す（名前の行を押し広げないため）。
// mvp＝綜合1位（月間MVP・金）、sales/manager＝各ランキング1位（受注=青／業完=琥珀）。
export type RankBadge = { label: string; tone: 'mvp' | 'sales' | 'manager' }

const TONE: Record<RankBadge['tone'], string> = {
  mvp: 'bg-[#FDF3D3] text-[#8a6400] border-[#EBCF7A]',
  sales: 'bg-blue-50 text-blue-700 border-blue-200',
  manager: 'bg-amber-50 text-amber-700 border-amber-200',
}

type Props = {
  badges: RankBadge[]
  /** 今月の個人目標を達成していると、アイコンの周りにレインボーリングが出る（アバターと同じ絵） */
  achieved?: boolean
  /** 達成リングのホバー説明（例: 8月の目標 6/6件 達成） */
  achievedTitle?: string
}

export default function RankingBadges({ badges, achieved = false, achievedTitle = '今月の目標を達成！' }: Props) {
  const list = badges ?? []
  // 称号が無い月でも、達成していれば的アイコンひとつを出してそこを光らせる
  const items: Array<{ key: string; title: string; cls: string; icon: React.ReactNode }> = list.map((b, i) => ({
    key: `b${i}`,
    title: b.label,
    cls: TONE[b.tone],
    icon: b.tone === 'mvp'
      ? <Crown className="w-3.5 h-3.5" strokeWidth={2} />
      : <Trophy className="w-3 h-3" strokeWidth={2} />,
  }))
  // 称号が無い月は何も出さない（達成は目標チップ側で分かる。単独アイコンは「謎の画像」に見えるため廃止）
  if (items.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1.5">
      {items.map(it => (
        <span key={it.key} className="relative inline-flex group">
          {/* ホバーで出る称号名 */}
          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded-[5px] bg-gray-800 text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {achieved ? `${it.title}・${achievedTitle}` : it.title}
          </span>
          <span
            className={`relative inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border ${it.cls}`}
            style={achieved ? { overflow: 'visible' } : undefined}
          >
            {/* 虹リング画像は「謎の画像」に見えるためやめ、達成はアイコン色とホバー文言で伝える */}
            <span className="relative inline-flex">{it.icon}</span>
          </span>
        </span>
      ))}
    </span>
  )
}

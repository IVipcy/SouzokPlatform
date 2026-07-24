'use client'

import { useState } from 'react'
import { UserCog, Megaphone, Users, Trophy, ListChecks, Banknote, Timer } from 'lucide-react'
import type { AxisKey, AxisRankings, Ranking, RankUnit, RankingResult } from '@/lib/rankingMetrics'

const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`
const fmt = (v: number, u: RankUnit) =>
  u === 'yen' ? yen(v) : u === 'ken' ? `${v}件` : u === 'days' ? `${v}日` : `平均${v}位`

const MEDAL = ['#F6C744', '#CBD0D6', '#D8A46B'] // 金・銀・銅
const CARD_ICON: Record<string, typeof Trophy> = {
  gyokan_count: ListChecks, gyokan_amount: Banknote, gyokan_cycle: Timer,
  juchu_count: ListChecks, juchu_amount: Banknote,
  team_count: ListChecks, team_amount: Banknote, team_cycle: Timer,
  composite: Trophy,
}
const AXIS_ICON: Record<AxisKey, typeof Trophy> = { manager: UserCog, sales: Megaphone, team: Users }

function Avatar({ name, color, url, isTeam }: { name: string; color: string | null; url: string | null; isTeam?: boolean }) {
  if (isTeam) return <span className="w-6 h-6 rounded-md flex-none flex items-center justify-center bg-gray-100 text-gray-500"><Users className="w-3.5 h-3.5" /></span>
  if (url) return <img src={url} alt={name} className="w-6 h-6 rounded-full flex-none object-cover" />
  return <span className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-white text-[10px] font-semibold" style={{ backgroundColor: color ?? '#6B7280' }}>{name.slice(0, 1)}</span>
}

function RankCard({ r }: { r: Ranking }) {
  const [all, setAll] = useState(false)
  const Icon = CARD_ICON[r.key] ?? Trophy
  const isComp = r.key === 'composite'
  const shown = all ? r.entries : r.entries.slice(0, 5)
  return (
    <div className={`bg-white rounded-xl p-3 ${isComp ? 'border-2 border-brand-300' : 'border border-gray-200'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-4 h-4 ${isComp ? 'text-amber-500' : 'text-brand-500'}`} strokeWidth={2} />
        <span className="text-[13px] font-semibold text-gray-800">{r.title}</span>
      </div>
      {r.note && <div className="text-[10.5px] text-gray-400 mb-1.5">{r.note}</div>}
      {r.entries.length === 0 ? (
        <div className="py-3 text-center text-[12px] text-gray-300">今月の実績なし</div>
      ) : (
        <div>
          {shown.map(e => (
            <div key={e.id} className="flex items-center gap-2 py-1">
              <span className="w-5 h-5 rounded-full flex-none flex items-center justify-center text-[11px] font-semibold" style={{ backgroundColor: e.rank <= 3 ? MEDAL[e.rank - 1] : '#F1EFE8', color: '#3d3d3a' }}>{e.rank}</span>
              <Avatar name={e.name} color={e.avatarColor} url={e.avatarUrl} isTeam={e.isTeam} />
              <span className="flex-1 text-[12.5px] text-gray-800 truncate">{e.name}</span>
              <span className="text-[12.5px] font-semibold text-gray-900 tabular-nums">{fmt(e.value, r.unit)}</span>
            </div>
          ))}
          {r.entries.length > 5 && (
            <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-[11px] text-brand-600 hover:text-brand-700">
              {all ? '上位5名だけ表示' : `全${r.entries.length}名を表示`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function RankingClient({ monthLabel, axes }: { monthLabel: string; axes: RankingResult }) {
  const [axis, setAxis] = useState<AxisKey>('manager')
  const list: AxisRankings = axes[axis]

  return (
    <div>
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1.5 mb-4 w-fit">
        {(['manager', 'sales', 'team'] as AxisKey[]).map(a => {
          const Icon = AXIS_ICON[a]
          const on = axis === a
          return (
            <button key={a} type="button" onClick={() => setAxis(a)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${on ? 'bg-white text-brand-700 border border-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" strokeWidth={2} />{axes[a].label}
            </button>
          )
        })}
        <span className="ml-2 text-[11px] text-gray-400">{monthLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {list.rankings.map(r => <RankCard key={r.key} r={r} />)}
      </div>
    </div>
  )
}

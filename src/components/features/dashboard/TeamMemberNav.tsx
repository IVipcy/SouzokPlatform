import Link from 'next/link'
import { Building2 } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'

export type TeamNavMember = {
  id: string
  name: string
  avatarColor: string  // 互換用、未使用
  avatarUrl?: string | null
  primaryRole: 'sales' | 'manager'
  // 個人目標を達成しているとアバターにレインボーリングが表示される
  achieved?: boolean
}

type Props = {
  teamId: string
  teamName: string
  members: TeamNavMember[]
  currentMemberId?: string  // 個人ボード表示中のメンバーID（ハイライト用）
  // URL ビルダー（未指定なら進捗ボードへリンク）
  buildTeamHref?: (teamId: string) => string
  buildMemberHref?: (memberId: string, teamId: string) => string
}

export default function TeamMemberNav({
  teamId,
  teamName,
  members,
  currentMemberId,
  buildTeamHref = (tid) => `/dashboard/team/${tid}/progress`,
  buildMemberHref = (mid) => `/dashboard/member/${mid}/progress`,
}: Props) {
  if (members.length === 0) return null

  // 受注 → 管理 → 名前順
  const sorted = [...members].sort((a, b) => {
    if (a.primaryRole !== b.primaryRole) return a.primaryRole === 'sales' ? -1 : 1
    return a.name.localeCompare(b.name, 'ja')
  })

  return (
    <nav className="mb-5 bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 mr-1">メンバー切替：</span>

        {/* チーム全体へのリンク */}
        <Link
          href={buildTeamHref(teamId)}
          className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition ${
            !currentMemberId
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:bg-brand-50/40'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" strokeWidth={2} />
          <span>{teamName} 全体</span>
        </Link>

        {/* 各メンバー（ロールはアバターの色で表現、テキストチップは廃止） */}
        {sorted.map(m => {
          const active = m.id === currentMemberId
          return (
            <Link
              key={m.id}
              href={buildMemberHref(m.id, teamId)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md border transition ${
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:bg-brand-50/40'
              }`}
              title={m.primaryRole === 'sales' ? `${m.name}（受注担当）` : `${m.name}（管理担当）`}
            >
              <UserAvatar
                name={m.name}
                role={m.primaryRole}
                url={m.avatarUrl}
                size="sm"
                achievedFrame={m.achieved}
              />
              <span>{m.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

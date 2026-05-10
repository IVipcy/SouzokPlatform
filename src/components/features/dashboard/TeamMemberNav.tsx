import Link from 'next/link'
import { Building2 } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'

export type TeamNavMember = {
  id: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
  primaryRole: 'sales' | 'manager'
}

type Props = {
  teamId: string
  teamName: string
  members: TeamNavMember[]
  currentMemberId?: string  // 個人ボード表示中のメンバーID（ハイライト用）
}

const ROLE_BADGE: Record<'sales' | 'manager', { label: string; cls: string }> = {
  sales:   { label: '受注', cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  manager: { label: '管理', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}

export default function TeamMemberNav({ teamId, teamName, members, currentMemberId }: Props) {
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
          href={`/dashboard/team/${teamId}/progress`}
          className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition ${
            !currentMemberId
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:bg-brand-50/40'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" strokeWidth={2} />
          <span>{teamName} 全体</span>
        </Link>

        {/* 各メンバー */}
        {sorted.map(m => {
          const active = m.id === currentMemberId
          const role = ROLE_BADGE[m.primaryRole]
          return (
            <Link
              key={m.id}
              href={`/dashboard/member/${m.id}/progress`}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md border transition ${
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:bg-brand-50/40'
              }`}
            >
              <UserAvatar name={m.name} color={m.avatarColor} url={m.avatarUrl} size="sm" />
              <span>{m.name}</span>
              <span
                className={`text-[14px] font-mono px-1.5 py-0 rounded border ${active ? 'bg-white/20 text-white border-white/30' : role.cls}`}
              >
                {role.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

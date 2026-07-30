import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import TouKiTeamDashboardClient from '@/components/features/dashboard/TouKiTeamDashboardClient'
import type { TaskRow } from '@/types'

// 相続登記チーム 専用ダッシュボード。
//   task_kind='touki_team' のタスク一覧を全案件横断で表示。
//   相続登記チーム メンバー（members.is_touki_team=true）は全員が着手可能。
//   閲覧権限: 相続登記チーム メンバー + システム管理者。

export default async function TouKiTeamDashboardPage() {
  const user = await getCurrentUser()
  if (!user?.memberId) redirect('/login')

  const supabase = await createClient()
  // メンバー情報 (相続登記チーム所属チェック用)
  const { data: me } = await supabase.from('members').select('is_touki_team, primary_role').eq('id', user.memberId).maybeSingle()
  const isTouki = !!me?.is_touki_team
  const isSystemManager = me?.primary_role === 'system_manager'
  if (!isTouki && !isSystemManager) {
    return (
      <div>
        <PageHeader eyebrow="Touki Team" title="相続登記チーム" icon={Package} description="相続登記チーム メンバーのみ閲覧可能です" />
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-[13px] text-gray-400">
          プロフィール画面で「相続登記チームメンバー」を ON にしてください。
          <div className="mt-3"><Link href="/profile" className="text-brand-600 hover:underline">プロフィールへ</Link></div>
        </div>
      </div>
    )
  }

  // 相続登記チームタスク（task_kind='touki_team'）を全案件横断で取得
  const { data: tasksRaw } = await supabase
    .from('tasks')
    .select('*, cases(id, case_number, deal_name, status), started_by_member:members!tasks_started_by_fkey(id, name, avatar_color, avatar_url)')
    .eq('task_kind', 'touki_team')
    .order('due_date', { ascending: true, nullsFirst: false })
  const tasks = (tasksRaw ?? []) as TaskRow[]

  return (
    <div>
      <PageHeader
        eyebrow="Touki Team"
        title="相続登記チーム 進捗ダッシュボード"
        icon={Package}
        description="task_kind=touki_team のタスク（権利書の製本 等）を全案件横断で表示。相続登記チーム メンバー全員が着手可"
      />
      <TouKiTeamDashboardClient tasks={tasks} currentMemberId={user.memberId} />
    </div>
  )
}

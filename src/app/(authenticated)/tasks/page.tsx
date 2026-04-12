import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import TaskListClient from '@/components/features/tasks/TaskListClient'
import type { TaskRow, MemberRow } from '@/types'

export default async function TasksPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const [tasksResult, casesResult, membersResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*)), started_by_member:members!tasks_started_by_fkey(*)')
      .order('sort_order'),
    supabase
      .from('cases')
      .select('id, case_number, deal_name, case_members(role, members(*))'),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ])

  // Build caseMap with case_number, deal_name, and case member info (sales, manager)
  const caseMap: Record<string, {
    case_number: string
    deal_name: string
    sales?: { id: string; name: string; avatar_color: string }
    manager?: { id: string; name: string; avatar_color: string }
  }> = {}
  casesResult.data?.forEach(c => {
    const salesMember = (c as any).case_members?.find((cm: any) => cm.role === 'sales')?.members
    const managerMember = (c as any).case_members?.find((cm: any) => cm.role === 'manager')?.members
    caseMap[c.id] = {
      case_number: c.case_number,
      deal_name: c.deal_name,
      sales: salesMember ? { id: salesMember.id, name: salesMember.name, avatar_color: salesMember.avatar_color } : undefined,
      manager: managerMember ? { id: managerMember.id, name: managerMember.name, avatar_color: managerMember.avatar_color } : undefined,
    }
  })

  return (
    <TaskListClient
      tasks={(tasksResult.data ?? []) as TaskRow[]}
      caseMap={caseMap}
      allMembers={(membersResult.data ?? []) as MemberRow[]}
      currentMemberId={currentUser?.memberId ?? null}
    />
  )
}

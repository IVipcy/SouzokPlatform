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
      .select('id, case_number, deal_name, status, service_category, service_category_2, expected_completion_date, case_members(role, members(*))'),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ])

  // Build caseMap with case info and member info (sales, manager)
  type RawMember = { id: string; name: string; avatar_color: string; avatar_url: string | null }
  type RawCaseRow = {
    id: string
    case_number: string
    deal_name: string
    status: string
    service_category: string | null
    service_category_2: string | null
    expected_completion_date: string | null
    case_members?: { role: string; members: RawMember | null }[] | null
  }
  type CaseMemberInfo = RawMember
  const caseMap: Record<string, {
    case_number: string
    deal_name: string
    status: string
    service_category: string | null
    service_category_2: string | null
    expected_completion_date: string | null
    sales?: CaseMemberInfo
    manager?: CaseMemberInfo
  }> = {}
  const toMemberInfo = (m: RawMember | null | undefined): CaseMemberInfo | undefined =>
    m ? { id: m.id, name: m.name, avatar_color: m.avatar_color, avatar_url: m.avatar_url ?? null } : undefined
  ;((casesResult.data ?? []) as unknown as RawCaseRow[]).forEach(c => {
    const salesMember = c.case_members?.find(cm => cm.role === 'sales')?.members
    const managerMember = c.case_members?.find(cm => cm.role === 'manager')?.members
    caseMap[c.id] = {
      case_number: c.case_number,
      deal_name: c.deal_name,
      status: c.status,
      service_category: c.service_category ?? null,
      service_category_2: c.service_category_2 ?? null,
      expected_completion_date: c.expected_completion_date ?? null,
      sales: toMemberInfo(salesMember),
      manager: toMemberInfo(managerMember),
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

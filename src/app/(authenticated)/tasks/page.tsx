import { createClient } from '@/lib/supabase/server'
import TaskListClient from '@/components/features/tasks/TaskListClient'
import type { TaskRow, MemberRow } from '@/types'

export default async function TasksPage() {
  const supabase = await createClient()

  const [tasksResult, casesResult, membersResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*))')
      .order('sort_order'),
    supabase
      .from('cases')
      .select('id, case_number, deal_name'),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ])

  const caseMap: Record<string, { case_number: string; deal_name: string }> = {}
  casesResult.data?.forEach(c => { caseMap[c.id] = c })

  return (
    <TaskListClient
      tasks={(tasksResult.data ?? []) as TaskRow[]}
      caseMap={caseMap}
      allMembers={(membersResult.data ?? []) as MemberRow[]}
    />
  )
}

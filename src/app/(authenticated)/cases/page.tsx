import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import CaseListClient from '@/components/features/cases/CaseListClient'
import type { CaseRow, MemberRow } from '@/types'

export default async function CasesPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const [casesResult, membersResult, tasksResult, taskAssigneesResult] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(*), case_members(*, members(*))')
      .order('created_at', { ascending: false }),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true),
    // タスク一覧：case_id・status・due_dateだけ（task_assigneesのJOINを避ける）
    supabase
      .from('tasks')
      .select('id, case_id, status, due_date'),
    // 担当者は別クエリで並列取得（JOINせずIDで紐付ける）
    supabase
      .from('task_assignees')
      .select('task_id, member_id'),
  ])

  // task_id → member_ids の辞書を先に作る（O(1)ルックアップ）
  const assigneesByTaskId: Record<string, string[]> = {}
  taskAssigneesResult.data?.forEach(ta => {
    if (!assigneesByTaskId[ta.task_id]) assigneesByTaskId[ta.task_id] = []
    assigneesByTaskId[ta.task_id].push(ta.member_id)
  })

  const tasksData = tasksResult.data?.map(t => ({
    case_id: t.case_id,
    status: t.status,
    due_date: t.due_date,
    task_assignees: (assigneesByTaskId[t.id] ?? []).map(member_id => ({ member_id })),
  })) ?? []

  const taskCountMap: Record<string, { total: number; completed: number }> = {}
  // Map: case_id -> Set of assigned member_ids
  const caseTaskAssignees: Record<string, Set<string>> = {}
  // Map: case_id -> array of { due_date, status }
  const caseTaskDueDates: Record<string, Array<{ due_date: string | null; status: string }>> = {}

  tasksData?.forEach(t => {
    if (!taskCountMap[t.case_id]) taskCountMap[t.case_id] = { total: 0, completed: 0 }
    taskCountMap[t.case_id].total++
    if (t.status === '完了') taskCountMap[t.case_id].completed++

    // Collect assignees per case
    if (!caseTaskAssignees[t.case_id]) caseTaskAssignees[t.case_id] = new Set()
    if (t.task_assignees && Array.isArray(t.task_assignees)) {
      t.task_assignees.forEach((ta: { member_id: string }) => {
        caseTaskAssignees[t.case_id].add(ta.member_id)
      })
    }

    // Collect due dates per case
    if (!caseTaskDueDates[t.case_id]) caseTaskDueDates[t.case_id] = []
    caseTaskDueDates[t.case_id].push({ due_date: t.due_date, status: t.status })
  })

  // Serialize Sets to arrays for client component
  const taskAssigneesMap: Record<string, string[]> = {}
  for (const [caseId, memberSet] of Object.entries(caseTaskAssignees)) {
    taskAssigneesMap[caseId] = Array.from(memberSet)
  }

  return (
    <CaseListClient
      cases={(casesResult.data ?? []) as (CaseRow & { case_members: Array<{ role: string; members: MemberRow }> })[]}
      taskCounts={taskCountMap}
      currentMemberId={currentUser?.memberId ?? null}
      taskAssigneesMap={taskAssigneesMap}
      taskDueDatesMap={caseTaskDueDates}
    />
  )
}

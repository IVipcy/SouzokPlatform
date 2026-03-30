import { createClient } from '@/lib/supabase/server'
import CaseListClient from '@/components/features/cases/CaseListClient'
import type { CaseRow, MemberRow } from '@/types'

export default async function CasesPage() {
  const supabase = await createClient()

  const [casesResult, membersResult] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(*), case_members(*, members(*))')
      .order('created_at', { ascending: false }),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true),
  ])

  // Count tasks per case
  const { data: taskCounts } = await supabase
    .from('tasks')
    .select('case_id, status')

  const taskCountMap: Record<string, { total: number; completed: number }> = {}
  taskCounts?.forEach(t => {
    if (!taskCountMap[t.case_id]) taskCountMap[t.case_id] = { total: 0, completed: 0 }
    taskCountMap[t.case_id].total++
    if (t.status === '完了') taskCountMap[t.case_id].completed++
  })

  return (
    <CaseListClient
      cases={(casesResult.data ?? []) as (CaseRow & { case_members: Array<{ role: string; members: MemberRow }> })[]}
      taskCounts={taskCountMap}
    />
  )
}

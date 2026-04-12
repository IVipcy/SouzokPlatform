import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import TaskDetailClient from '@/components/features/tasks/TaskDetailClient'
import type { TaskRow, MemberRow, DocumentRow, CaseActivityRow } from '@/types'

type Props = {
  params: Promise<{ id: string }>
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const [taskResult, allMembersResult, documentsResult, activitiesResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*)), started_by_member:members!tasks_started_by_fkey(*), cases(*, clients(*))')
      .eq('id', id)
      .single(),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('documents')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('case_activities')
      .select('*, members(*)')
      .eq('task_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (taskResult.error || !taskResult.data) {
    notFound()
  }

  return (
    <TaskDetailClient
      task={taskResult.data as TaskRow}
      allMembers={(allMembersResult.data ?? []) as MemberRow[]}
      documents={(documentsResult.data ?? []) as DocumentRow[]}
      activities={(activitiesResult.data ?? []) as CaseActivityRow[]}
      currentMemberId={currentUser?.memberId ?? null}
    />
  )
}

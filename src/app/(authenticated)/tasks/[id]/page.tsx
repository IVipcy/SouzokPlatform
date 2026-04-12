import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TaskDetailClient from '@/components/features/tasks/TaskDetailClient'
import type { TaskRow, MemberRow, DocumentRow } from '@/types'

type Props = {
  params: Promise<{ id: string }>
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [taskResult, allMembersResult, documentsResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*)), cases(*, clients(*))')
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
  ])

  if (taskResult.error || !taskResult.data) {
    notFound()
  }

  return (
    <TaskDetailClient
      task={taskResult.data as TaskRow}
      allMembers={(allMembersResult.data ?? []) as MemberRow[]}
      documents={(documentsResult.data ?? []) as DocumentRow[]}
    />
  )
}

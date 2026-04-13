import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import TaskDetailClient from '@/components/features/tasks/TaskDetailClient'
import type { TaskRow, MemberRow, DocumentRow, CaseActivityRow, TaskDependencyRow } from '@/types'

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

  const task = taskResult.data as TaskRow
  const caseId = task.case_id

  // 依存関係と関連タスク情報を取得
  const [depsResult, relatedTasksResult] = await Promise.all([
    supabase
      .from('task_dependencies')
      .select('*')
      .or(`from_task_id.eq.${id},to_task_id.eq.${id}`),
    supabase
      .from('tasks')
      .select('id, title, status, ext_data, template_key')
      .eq('case_id', caseId),
  ])

  // 依存関係に関連タスク情報を付与
  const relatedTasks = (relatedTasksResult.data ?? []) as TaskRow[]
  const taskMap = new Map(relatedTasks.map(t => [t.id, t]))
  const dependencies = ((depsResult.data ?? []) as TaskDependencyRow[]).map(dep => ({
    ...dep,
    from_task: taskMap.get(dep.from_task_id),
    to_task: taskMap.get(dep.to_task_id),
  }))

  return (
    <TaskDetailClient
      task={task}
      allMembers={(allMembersResult.data ?? []) as MemberRow[]}
      documents={(documentsResult.data ?? []) as DocumentRow[]}
      activities={(activitiesResult.data ?? []) as CaseActivityRow[]}
      currentMemberId={currentUser?.memberId ?? null}
      dependencies={dependencies}
      caseTasks={relatedTasks}
    />
  )
}

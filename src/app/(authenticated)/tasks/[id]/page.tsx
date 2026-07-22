import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import TaskDetailClient from '@/components/features/tasks/TaskDetailClient'
import { isTaskFreezeBlocked } from '@/lib/financeFreeze'
import type { TaskRow, MemberRow, CaseDocumentRow, CaseActivityRow, TaskDependencyRow, TaskTemplateRow, DocumentRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow } from '@/types'

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
      .from('case_documents')
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
  // 関連タスクには 前段作業の確認セクションで使う started_by/completed_at/started_by_member などを含める
  const [depsResult, relatedTasksResult, createdDocsResult, taskTemplatesResult, heirsResult, propertiesResult, contractDocsResult, financeResult] = await Promise.all([
    supabase
      .from('task_dependencies')
      .select('*')
      .or(`from_task_id.eq.${id},to_task_id.eq.${id}`),
    supabase
      .from('tasks')
      .select('id, title, status, phase, category, priority, due_date, ext_data, template_key, task_kind, started_by, started_at, completed_at, updated_at, started_by_member:members!tasks_started_by_fkey(id, name, avatar_color, avatar_url, primary_role)')
      .eq('case_id', caseId),
    // 案件全体の作成書類（documents テーブル。作成物セクションで全タスク横断表示）
    supabase
      .from('documents')
      .select('*, tasks(id, title)')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false }),
    // タスクテンプレ（次タスク新規作成時の候補）
    supabase
      .from('task_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    // AI書類作成モーダル用の案件付随データ
    supabase.from('heirs').select('*').eq('case_id', caseId).order('sort_order'),
    supabase.from('real_estate_properties').select('*').eq('case_id', caseId),
    supabase.from('contract_documents').select('*').eq('case_id', caseId).order('sort_order', { ascending: true }),
    supabase.from('financial_assets').select('institution_name, freeze_confirmed').eq('case_id', caseId),
  ])

  // 解約タスクの着手ハード制限：機関単位で判定（cancel:{機関名}はその機関の口座だけを見る）。
  // 案件全体で判定すると、別口座（禁止期間中で未凍結 等）が原因で凍結済の機関の解約まで止まってしまう。
  const financeAssets = (financeResult.data ?? []) as Array<{ institution_name: string | null; freeze_confirmed: boolean | null }>
  const financeFreezeBlocked = isTaskFreezeBlocked(task, financeAssets)

  // 依存関係に関連タスク情報を付与
  // Supabase の埋め込みリレーション (members!tasks_started_by_fkey) は配列で返るので
  // 単一オブジェクトに正規化してから TaskRow として扱う
  type RelatedRaw = {
    started_by_member?: Array<unknown> | unknown
    [k: string]: unknown
  }
  const relatedTasks = ((relatedTasksResult.data ?? []) as RelatedRaw[]).map(t => ({
    ...t,
    started_by_member: Array.isArray(t.started_by_member)
      ? t.started_by_member[0] ?? null
      : t.started_by_member ?? null,
  })) as unknown as TaskRow[]
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
      documents={(documentsResult.data ?? []) as CaseDocumentRow[]}
      createdDocuments={(createdDocsResult.data ?? []) as unknown as DocumentRow[]}
      activities={(activitiesResult.data ?? []) as CaseActivityRow[]}
      currentMemberId={currentUser?.memberId ?? null}
      dependencies={dependencies}
      caseTasks={relatedTasks}
      taskTemplates={(taskTemplatesResult.data ?? []) as TaskTemplateRow[]}
      heirs={(heirsResult.data ?? []) as HeirRow[]}
      properties={(propertiesResult.data ?? []) as RealEstatePropertyRow[]}
      contractDocuments={(contractDocsResult.data ?? []) as ContractDocumentRow[]}
      financeFreezeBlocked={financeFreezeBlocked}
    />
  )
}

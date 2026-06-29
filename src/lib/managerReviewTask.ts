import { createClient } from '@/lib/supabase/client'

// 「管理担当確認」タスクを作成する。
// 事務管理担当がタスク完了時に「次のアクションが分からない」場合、確認内容を添えて
// 受注/管理担当タスク(task_kind='system', assign_role='manager')として起票し、案件の管理担当へ
// アサイン＋通知する。案件詳細の受注/管理担当タブにも表示される。
export async function createManagerReviewTask(opts: {
  caseId: string
  content: string
  fromTaskTitle?: string
  requestedBy?: string | null
}): Promise<void> {
  const supabase = createClient()
  const { data: nt, error } = await supabase
    .from('tasks')
    .insert({
      case_id: opts.caseId,
      title: '管理担当確認',
      task_kind: 'system',
      assign_role: 'manager',
      status: '未着手',
      priority: '通常',
      ext_data: {
        manager_review: true,
        content: opts.content,
        from_task: opts.fromTaskTitle ?? null,
        requested_by: opts.requestedBy ?? null,
      },
      sort_order: 99,
    })
    .select('id')
    .single()
  if (error || !nt) { console.error('createManagerReviewTask failed', error); return }
  const taskId = (nt as { id: string }).id

  // 案件の管理担当へアサイン＋通知
  const { data: cm } = await supabase
    .from('case_members')
    .select('member_id')
    .eq('case_id', opts.caseId)
    .eq('role', 'manager')
    .limit(1)
  const mgr = ((cm ?? []) as Array<{ member_id: string }>)[0]?.member_id
  if (mgr) {
    await supabase.from('task_assignees').insert({ task_id: taskId, member_id: mgr, role: 'primary' })
    await supabase.from('notifications').insert({
      member_id: mgr,
      type: 'manager_review_request',
      case_id: opts.caseId,
      title: '管理担当確認の依頼',
      body: opts.content || '次のアクションの確認依頼があります',
    })
  }
}

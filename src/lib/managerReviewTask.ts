import { createClient } from '@/lib/supabase/client'

// 事務管理担当が管理担当へ出す「ヘルプ」の状況。
//   next_unknown … 次にやるべきタスクが分からない（→ 次を教えてほしい）
//   too_hard     … 次は分かるが難しくてできない（→ 巻き取ってほしい）
//   how_to       … 今の作業の進め方が分からない（→ 相談したい）
export type HelpType = 'next_unknown' | 'too_hard' | 'how_to'
export const HELP_TYPE_LABEL: Record<HelpType, string> = {
  next_unknown: '次を教えて',
  too_hard: '巻き取り',
  how_to: '進め方相談',
}

// 「管理担当ヘルプ（確認）」タスクを作成する。
// 事務管理担当がタスク完了時／作業中に、確認内容を添えて 受注/管理担当タスク(task_kind='system',
// assign_role='manager') として起票し、案件の管理担当へアサイン＋通知する。管理担当タスク一覧にも表示される。
export async function createManagerReviewTask(opts: {
  caseId: string
  content: string
  helpType?: HelpType
  fromTaskTitle?: string
  fromTaskId?: string | null
  requestedBy?: string | null
}): Promise<void> {
  const supabase = createClient()
  const label = opts.helpType ? HELP_TYPE_LABEL[opts.helpType] : '確認'
  const { data: nt, error } = await supabase
    .from('tasks')
    .insert({
      case_id: opts.caseId,
      title: `【ヘルプ】${label}${opts.fromTaskTitle ? `：${opts.fromTaskTitle}` : ''}`,
      task_kind: 'system',
      assign_role: 'manager',
      status: '未着手',
      priority: opts.helpType === 'too_hard' ? '急ぎ' : '通常',
      ext_data: {
        manager_review: true,
        help_type: opts.helpType ?? null,
        content: opts.content,
        from_task: opts.fromTaskTitle ?? null,
        from_task_id: opts.fromTaskId ?? null,
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
      title: `管理担当ヘルプ（${label}）`,
      body: opts.content || '事務管理担当からヘルプ依頼があります',
    })
  }
}

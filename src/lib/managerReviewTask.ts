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
}): Promise<{ notified: number; error?: string }> {
  const supabase = createClient()
  const label = opts.helpType ? HELP_TYPE_LABEL[opts.helpType] : '確認'

  // 通知先＝この案件の管理担当。未アサイン等で見つからなければ全管理担当にフォールバック（確実に届かせる）。
  const { data: cm } = await supabase
    .from('case_members')
    .select('member_id')
    .eq('case_id', opts.caseId)
    .eq('role', 'manager')
  let recipients = [...new Set(((cm ?? []) as Array<{ member_id: string }>).map(x => x.member_id).filter(Boolean))]
  if (recipients.length === 0) {
    const { data: mgrs } = await supabase.from('members').select('id').eq('is_active', true).in('primary_role', ['manager', 'sub_manager'])
    recipients = ((mgrs ?? []) as Array<{ id: string }>).map(m => m.id)
  }

  // ヘルプタスク（管理担当のレビュータスク）を作成。失敗しても通知は必ず送る。
  const { data: nt, error } = await supabase
    .from('tasks')
    .insert({
      case_id: opts.caseId,
      title: `【ヘルプ】${label}${opts.fromTaskTitle ? `：${opts.fromTaskTitle}` : ''}`,
      task_kind: 'system',
      assign_role: 'manager',
      status: '着手前',
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
  if (error) console.error('createManagerReviewTask: task insert failed', error)
  const taskId = nt ? (nt as { id: string }).id : null

  if (taskId && recipients[0]) {
    await supabase.from('task_assignees').insert({ task_id: taskId, member_id: recipients[0], role: 'primary' })
  }
  if (recipients.length === 0) return { notified: 0, error: '通知先の管理担当が見つかりませんでした' }
  const { error: nerr } = await supabase.from('notifications').insert(
    recipients.map(id => ({
      member_id: id,
      type: 'manager_review_request',
      case_id: opts.caseId,
      task_id: taskId,
      title: `管理担当ヘルプ（${label}）`,
      body: opts.content || '事務管理担当からヘルプ依頼があります',
    })),
  )
  if (nerr) { console.error('createManagerReviewTask: notification insert failed', nerr); return { notified: 0, error: nerr.message } }
  return { notified: recipients.length }
}

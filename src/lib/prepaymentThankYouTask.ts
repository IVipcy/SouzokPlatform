import { createClient } from '@/lib/supabase/client'

// 前受金が「入金済」になったら、受注担当＋管理担当に共有の「前受金入金御礼連絡」タスクを自動生成する。
// ・1タスクを両者にアサイン（どちらかが御礼連絡すれば完了）。
// ・優先度＝超急ぎ、期限＝入金確定日（本日）。生成と同時に両者へ通知（アラート＆タスク通知）。
// ・重複生成は ext_data.invoice_id + doc='prepay_thanks' で防止。
// ・前受金以外・入金済でない請求は何もしない（全入金経路から安全に呼べる）。
export async function ensurePrepaymentThankYouTask(invoiceId: string): Promise<void> {
  const supabase = createClient()
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, case_id, invoice_type, status')
    .eq('id', invoiceId)
    .single()
  if (!inv || inv.invoice_type !== '前受金' || inv.status !== '入金済') return

  // 重複防止：この請求の御礼タスクが既にあれば作らない
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('case_id', inv.case_id)
    .contains('ext_data', { invoice_id: invoiceId, doc: 'prepay_thanks' })
    .limit(1)
  if (existing && existing.length > 0) return

  // 期限＝入金確定日（本日）
  const today = new Date().toISOString().slice(0, 10)
  const { data: c } = await supabase.from('cases').select('case_number, deal_name').eq('id', inv.case_id).single()

  const { data: nt, error } = await supabase
    .from('tasks')
    .insert({
      case_id: inv.case_id,
      title: '前受金入金御礼連絡',
      task_kind: 'system',       // 受注担当/管理担当タスク
      phase: '受注',
      category: '連絡',
      status: '未着手',
      priority: '超急ぎ',
      assign_role: 'sales',
      due_date: today,
      ext_data: { invoice_id: invoiceId, doc: 'prepay_thanks' },
      sort_order: 1,
    })
    .select('id')
    .single()
  if (error || !nt) { console.error('ensurePrepaymentThankYouTask failed', error); return }
  const taskId = (nt as { id: string }).id

  // 受注担当＋管理担当を1タスクに共有アサイン
  const { data: cm } = await supabase
    .from('case_members')
    .select('member_id, role')
    .eq('case_id', inv.case_id)
    .in('role', ['sales', 'manager'])
  const ids = [...new Set(((cm ?? []) as { member_id: string | null }[]).map(m => m.member_id).filter((v): v is string => !!v))]
  if (ids.length === 0) return

  await supabase.from('task_assignees').insert(ids.map(member_id => ({ task_id: taskId, member_id, role: 'primary' })))

  // アラート＆タスク通知（両者へ）
  const label = `${c?.case_number ?? ''} ${c?.deal_name ?? ''}`.trim()
  await supabase.from('notifications').insert(ids.map(member_id => ({
    member_id, type: 'task_assigned', case_id: inv.case_id,
    title: '【超急ぎ】前受金入金御礼連絡',
    body: `${label}：前受金の入金を確認しました。お客様へ入金御礼のご連絡をお願いします（本日中）。`,
  })))
}

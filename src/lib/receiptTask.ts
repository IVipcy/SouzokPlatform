import { createClient } from '@/lib/supabase/client'

// 確定請求が入金済になったら「領収書の作成・送付」タスクを管理担当へ自動生成する。
// 前受金の領収書は基本発行しない運用のため、確定請求のみ対象。重複生成は ext_data.invoice_id で防止。
export async function ensureReceiptTask(invoiceId: string): Promise<void> {
  const supabase = createClient()
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, case_id, invoice_type, status')
    .eq('id', invoiceId)
    .single()
  if (!inv || inv.invoice_type !== '確定請求' || inv.status !== '入金済') return

  // 重複防止：この請求の領収書タスクが既にあれば作らない
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('case_id', inv.case_id)
    .contains('ext_data', { invoice_id: invoiceId, doc: 'receipt' })
    .limit(1)
  if (existing && existing.length > 0) return

  // 期日＝入金確定日（本日）＋7日
  const due = new Date()
  due.setDate(due.getDate() + 7)
  const dueStr = due.toISOString().slice(0, 10)

  const { data: nt, error } = await supabase
    .from('tasks')
    .insert({
      case_id: inv.case_id,
      title: '領収書の作成・送付',
      task_kind: 'case',
      // 業務区分は GYOMU_ALL の範囲で持つ。領収書送付は案件を進める工程ではないので「その他」。
      phase: 'その他',
      category: '経理',
      status: '未着手',
      priority: '通常',
      assign_role: 'manager',  // 管理担当がメイン
      due_date: dueStr,
      ext_data: { invoice_id: invoiceId, doc: 'receipt' },
      sort_order: 99,
    })
    .select('id')
    .single()
  if (error || !nt) { console.error('ensureReceiptTask failed', error); return }

  // 案件の管理担当へアサイン
  const { data: cm } = await supabase
    .from('case_members')
    .select('member_id')
    .eq('case_id', inv.case_id)
    .eq('role', 'manager')
  // 管理担当は2名まで置ける（引継ぎ・サブ担当）。いる人全員にアサインする。
  const mgrs = [...new Set(((cm ?? []) as Array<{ member_id: string }>).map(x => x.member_id).filter(Boolean))]
  if (mgrs.length > 0) {
    await supabase.from('task_assignees').insert(mgrs.map(member_id => ({ task_id: (nt as { id: string }).id, member_id, role: 'primary' })))
  }
}

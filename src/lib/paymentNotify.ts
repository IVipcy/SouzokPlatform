import { createClient } from '@/lib/supabase/client'

// 請求が「入金済」になったら、その案件の受注担当・管理担当の両方に通知する。
// CSV突合・手動ステータス変更・手動入金記録のどの経路でも同じ通知を出すための共通処理。
export async function notifyPaymentConfirmed(caseId: string, amount: number) {
  const supabase = createClient()
  const [{ data: members }, { data: c }] = await Promise.all([
    supabase.from('case_members').select('member_id, role').eq('case_id', caseId).in('role', ['sales', 'manager']),
    supabase.from('cases').select('case_number, deal_name').eq('id', caseId).single(),
  ])
  const ids = [...new Set(((members ?? []) as { member_id: string | null }[]).map(m => m.member_id).filter((v): v is string => !!v))]
  if (ids.length === 0) return
  const label = `${c?.case_number ?? ''} ${c?.deal_name ?? ''}`.trim()
  const yen = `¥${Math.round(amount).toLocaleString('ja-JP')}`
  await supabase.from('notifications').insert(ids.map(member_id => ({
    member_id, type: 'payment_confirmed', case_id: caseId, title: '入金確定',
    body: `${label} の入金（${yen}）が入金済になりました。請求タブで確認してください。`,
  })))
}

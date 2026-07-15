import { createClient } from '@/lib/supabase/client'

// 入金が確定したら、その請求に紐づく「依頼中」の入金状況確認依頼を自動で確認済にする。
// 二重催促・ゴミ依頼を防ぐ。依頼者（経理/管理担当）へは自動クローズの通知を返す。
export async function autoClosePaymentChecks(invoiceId: string): Promise<void> {
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)
  // 入金確定で、その請求の未完了の「確認依頼」を完了に（受注/管理の回答=result_note は残す）
  const { data, error } = await supabase
    .from('payment_check_requests')
    .update({ status: '完了', confirmed_date: today, auto_closed: true })
    .eq('invoice_id', invoiceId)
    .eq('kind', 'confirm')
    .in('status', ['依頼中', '回答済'])
    .select('requester_id, case_id')
  if (error) { console.error('autoClosePaymentChecks failed', error); return }
  for (const r of (data ?? []) as Array<{ requester_id: string; case_id: string }>) {
    await supabase.from('notifications').insert({
      member_id: r.requester_id,
      type: 'payment_check_confirmed',
      case_id: r.case_id,
      title: '入金が確定しました',
      body: '入金が確定したため、依頼していた入金状況確認を自動でクローズしました。',
    })
  }
}

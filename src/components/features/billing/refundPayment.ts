// 返金確定の共通処理（返金依頼一覧・依頼パネルの両方から呼ぶ）。
//   1. 返金額が「その請求書の入金合計（返金を差し引いた純額）」を超えていれば弾く
//   2. payments に is_refund のマイナス行を記録（返金日＝日本時間の今日）
//   3. 請求書のステータスを入金合計から付け直す（純額 ≧ 請求額なら入金済、足りなければ入金待ち）
// 返金しても「入金済」のままだと、請求・入金一覧で回収できたように見えてしまう。

import { createClient } from '@/lib/supabase/client'
import { todayJstYmd } from '@/lib/today'

type Result = { ok: true; status: '入金済' | '入金待ち' } | { ok: false; message: string }

export async function recordRefund(invoiceId: string, amount: number, note: string): Promise<Result> {
  if (!amount || amount <= 0) return { ok: false, message: '返金額が不正です' }
  const supabase = createClient()
  const { data, error: invErr } = await supabase
    .from('invoices')
    .select('amount, status, payments(amount)')
    .eq('id', invoiceId)
    .single()
  if (invErr || !data) return { ok: false, message: '請求書の読み込みに失敗しました' }
  const inv = data as { amount: number; status: string; payments: Array<{ amount: number }> | null }
  // payments.amount は返金行がマイナスなので、そのまま足せば純額
  const netPaid = (inv.payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
  if (amount > netPaid) {
    return { ok: false, message: `返金額 ¥${Math.round(amount).toLocaleString()} が入金額（純額 ¥${Math.round(netPaid).toLocaleString()}）を超えています` }
  }
  const { error } = await supabase.from('payments').insert({
    invoice_id: invoiceId, amount: -amount, payment_date: todayJstYmd(), payment_method: '振込',
    is_refund: true, matched_by: 'human', match_note: note,
  })
  if (error) return { ok: false, message: `返金記録に失敗: ${error.message}` }
  // 返金後の純額で入金済／入金待ちを付け直す（未請求・作成済の請求に返金は起きないので、この2値だけ扱う）
  const status: '入金済' | '入金待ち' = netPaid - amount >= inv.amount ? '入金済' : '入金待ち'
  if (inv.status !== status) {
    await supabase.from('invoices').update({ status }).eq('id', invoiceId)
  }
  return { ok: true, status }
}

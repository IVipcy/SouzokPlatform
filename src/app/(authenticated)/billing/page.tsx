import { createClient } from '@/lib/supabase/server'
import BillingClient from '@/components/features/billing/BillingClient'
import { getCurrentUser, canReconcilePayments } from '@/lib/auth'

export default async function BillingPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const [invoicesResult, casesResult, depositsResult, requestsResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, cases(id, case_number, deal_name, deceased_name, status, contract_type, billing_pattern, order_route, order_route_detail, clients(*), case_members(*, members(*))), payments(*), payment_check_requests(id, status, result_note, requested_date, confirmed_date, confirmer_id, auto_closed)')
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id, case_number, deal_name')
      .order('case_number'),
    // CSVのみ（システムに該当なし）の未処理入金
    supabase
      .from('unmatched_deposits')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false }),
    // 確認依頼／返金依頼（未完了）
    supabase
      .from('payment_check_requests')
      .select('id, invoice_id, case_id, kind, status, requester_id, request_note, result_note, resolution, reason_category, fee_bearer, refund_amount, invoices(amount, cases(case_number, deal_name))')
      .in('kind', ['confirm', 'refund'])
      .neq('status', '完了')
      .order('requested_date', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesResult.data ?? []) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests = ((requestsResult.data ?? []) as any[]).map(r => ({
    id: r.id, invoice_id: r.invoice_id, case_id: r.case_id, kind: r.kind, status: r.status,
    requester_id: r.requester_id, request_note: r.request_note, result_note: r.result_note, resolution: r.resolution,
    reason_category: r.reason_category, fee_bearer: r.fee_bearer, refund_amount: r.refund_amount,
    caseNumber: r.invoices?.cases?.case_number ?? '', dealName: r.invoices?.cases?.deal_name ?? '',
  }))

  return (
    <BillingClient
      invoices={invoices}
      cases={casesResult.data ?? []}
      deposits={depositsResult.data ?? []}
      requests={requests}
      currentMemberId={user?.memberId ?? null}
      canReconcile={canReconcilePayments(user)}
    />
  )
}

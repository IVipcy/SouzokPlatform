import { createClient } from '@/lib/supabase/server'
import BillingClient from '@/components/features/billing/BillingClient'
import { getCurrentUser, canReconcilePayments } from '@/lib/auth'

export default async function BillingPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const [invoicesResult, casesResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, cases(id, case_number, deal_name, deceased_name, status, contract_type, order_route, order_route_detail, clients(*), case_members(*, members(*))), payments(*), payment_check_requests(id, status, result_note, requested_date, confirmed_date, confirmer_id, auto_closed)')
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id, case_number, deal_name')
      .order('case_number'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesResult.data ?? []) as any

  return (
    <BillingClient
      invoices={invoices}
      cases={casesResult.data ?? []}
      canReconcile={canReconcilePayments(user)}
    />
  )
}

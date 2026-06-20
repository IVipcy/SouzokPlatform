import { createClient } from '@/lib/supabase/server'
import BillingClient from '@/components/features/billing/BillingClient'

export default async function BillingPage() {
  const supabase = await createClient()

  const [invoicesResult, casesResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, cases(id, case_number, deal_name, deceased_name, status, contract_type, clients(*), case_members(*, members(*))), payments(*), payment_check_requests(id, status, result_note, requested_date, confirmed_date, confirmer_id, auto_closed)')
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id, case_number, deal_name')
      .order('case_number'),
  ])

  return (
    <BillingClient
      invoices={(invoicesResult.data ?? []) as any}
      cases={casesResult.data ?? []}
    />
  )
}

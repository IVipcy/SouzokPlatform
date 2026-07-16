import { createClient } from '@/lib/supabase/server'
import PaymentDetailClient from '@/components/features/billing/PaymentDetailClient'

export default async function PaymentDetailPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('payments')
    .select('amount, payment_date, bank, is_refund, notes, invoices(invoice_type, firm_type, fee_amount, expenses_amount, amount, invoice_number, cases(case_number, deceased_name, order_route, order_route_detail, clients(name), case_members(role, members(name))))')
    .order('payment_date', { ascending: false })

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <PaymentDetailClient payments={(data ?? []) as any} />
  )
}

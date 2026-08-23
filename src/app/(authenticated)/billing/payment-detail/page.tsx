import { createClient } from '@/lib/supabase/server'
import PaymentDetailClient from '@/components/features/billing/PaymentDetailClient'
import { isIkiikiContract } from '@/lib/constants'

export default async function PaymentDetailPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('payments')
    .select('id, amount, payment_date, bank, is_refund, notes, invoices(id, invoice_type, firm_type, fee_amount, expenses_amount, amount, invoice_number, notes, generated_file_path, cases(id, case_number, deceased_name, contract_type, order_route, order_route_detail, clients(name), case_members(role, members(name))))')
    .order('payment_date', { ascending: false })

  return (
    // いきいきライフ協会は別法人なので入金明細にも載せない
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    <PaymentDetailClient payments={((data ?? []) as any[]).filter((p: any) => !isIkiikiContract(p?.invoices?.cases?.contract_type)) as any} />
  )
}

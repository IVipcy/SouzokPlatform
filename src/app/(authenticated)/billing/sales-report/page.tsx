import { createClient } from '@/lib/supabase/server'
import SalesReportClient from '@/components/features/billing/SalesReportClient'

export default async function SalesReportPage() {
  const supabase = await createClient()

  const [invoicesResult, expensesResult, teamsResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, case_id, invoice_type, firm_type, fee_amount, expenses_amount, amount, deduct_expense_nontax, deduct_expense_tax, posted_date, issued_date, notes, status, payments(amount, payment_date, is_refund), cases(case_number, deceased_name, bank, clients(name), case_members(role, members(name, team_id)))')
      .in('invoice_type', ['確定請求', '前受金'])
      .order('posted_date', { ascending: false }),
    supabase
      .from('billing_expense_items')
      .select('case_id, shigyo, taxable, amount'),
    supabase
      .from('teams')
      .select('id, name, division, bank, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  return (
    <SalesReportClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={(invoicesResult.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expenses={(expensesResult.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teams={(teamsResult.data ?? []) as any}
    />
  )
}

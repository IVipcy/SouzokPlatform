import { createClient } from '@/lib/supabase/server'
import SalesReportClient from '@/components/features/billing/SalesReportClient'
import { isIkiikiContract } from '@/lib/constants'
import { fetchAllRows } from '@/lib/supabaseFetchAll'

export default async function SalesReportPage() {
  const supabase = await createClient()

  // 請求書・立替・報酬内訳は件数が増え続ける（1回の select は1000行で切れ、報酬が0円に見える案件が出る）ので、
  // ページを送って全件そろえる。並び順が不定だと境目で行が重複・欠落するので id で末尾をそろえる。
  const [invoicesResult, expensesResult, rewardsResult, teamsResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllRows<any>((from, to) => supabase
      .from('invoices')
      .select('id, case_id, invoice_type, firm_type, fee_amount, expenses_amount, amount, deduct_expense_nontax, deduct_expense_tax, bank_override, posted_date, issued_date, notes, status, payments(amount, payment_date, is_refund, bank), cases(case_number, deceased_name, billing_pattern, contract_type, clients(name), case_members(role, members(name, team_id, division)))')
      .in('invoice_type', ['確定請求', '前受金'])
      // 計上日 = posted_date ?? issued_date（発行日基準）で並べる。片方が空でも新しい順が崩れないよう2段ソート。
      .order('posted_date', { ascending: false, nullsFirst: false })
      .order('issued_date', { ascending: false, nullsFirst: false })
      .order('id')
      .range(from, to)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllRows<any>((from, to) => supabase
      .from('billing_expense_items')
      .select('case_id, shigyo, taxable, amount, billed_invoice_id')  // billed_invoice_id は migration 298
      .order('id')
      .range(from, to)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllRows<any>((from, to) => supabase
      .from('reward_items')
      .select('case_id, shigyo, amount, discount')
      .order('id')
      .range(from, to)),
    supabase
      .from('teams')
      .select('id, name, division, bank, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order').order('created_at'),
  ])

  return (
    <SalesReportClient
      // いきいきライフ協会は別法人なので売上には載せない
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={((invoicesResult.data ?? []) as any[]).filter(inv => !isIkiikiContract(inv?.cases?.contract_type)) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expenses={(expensesResult.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rewards={(rewardsResult.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teams={(teamsResult.data ?? []) as any}
    />
  )
}

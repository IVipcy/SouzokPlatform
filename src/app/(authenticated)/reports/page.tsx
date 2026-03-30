import { createClient } from '@/lib/supabase/server'
import ReportsClient from '@/components/features/reports/ReportsClient'

export default async function ReportsPage() {
  const supabase = await createClient()

  const [casesResult, membersResult, invoicesResult] = await Promise.all([
    supabase
      .from('cases')
      .select('id, case_number, deal_name, status, deceased_name, difficulty, total_asset_estimate, order_date, completion_date, case_members(*, members(*))')
      .order('created_at', { ascending: false }),
    supabase
      .from('members')
      .select('id, name, avatar_color, is_active')
      .eq('is_active', true),
    supabase
      .from('invoices')
      .select('id, case_id, amount, status, invoice_type, issued_date, payments(amount)')
      .order('created_at', { ascending: false }),
  ])

  return (
    <ReportsClient
      cases={(casesResult.data ?? []) as any}
      members={(membersResult.data ?? []) as any}
      invoices={(invoicesResult.data ?? []) as any}
    />
  )
}

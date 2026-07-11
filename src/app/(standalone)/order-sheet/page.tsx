import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import OrderSheetAppClient, { type OsCaseRow } from './OrderSheetAppClient'

// オーダーシート入力アプリ TOP（独立ルート）。
// 自分が担当（case_members）で、登録済み・対応中前（検討中/依頼確定待ち/受注/戻り受注）の案件を一覧。
const ACTIVE_STATUSES = ['検討中', '検討中（契約書待ち）', '受注', '戻り受注']

type CaseSelectRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  order_route: string | null
  meeting_executed_date: string | null
  order_sheet_completed_at: string | null
  clients: { name: string | null } | null
}

export default async function OrderSheetAppPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const memberId = currentUser?.memberId ?? null

  let rows: OsCaseRow[] = []
  if (memberId) {
    const { data: memberCases } = await supabase
      .from('case_members')
      .select('case_id')
      .eq('member_id', memberId)
    const ids = [...new Set((memberCases ?? []).map(m => (m as { case_id: string }).case_id))]
    if (ids.length > 0) {
      const { data } = await supabase
        .from('cases')
        .select('id, case_number, deal_name, status, order_route, meeting_executed_date, order_sheet_completed_at, clients(name)')
        .in('id', ids)
        .in('status', ACTIVE_STATUSES)
        .order('meeting_executed_date', { ascending: false, nullsFirst: false })
      rows = ((data ?? []) as unknown as CaseSelectRow[]).map(c => ({
        id: c.id,
        case_number: c.case_number,
        deal_name: c.deal_name,
        status: c.status,
        order_route: c.order_route,
        meeting_executed_date: c.meeting_executed_date,
        order_sheet_completed_at: c.order_sheet_completed_at,
        clientName: c.clients?.name ?? null,
      }))
    }
  }

  return <OrderSheetAppClient cases={rows} />
}

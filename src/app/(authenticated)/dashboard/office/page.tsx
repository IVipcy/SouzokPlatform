import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { loadTaskListData } from '@/lib/loadTaskListData'
import OfficeDashboardTabs, { type MailRow, type HourenSouRow } from '@/components/features/dashboard/OfficeDashboardTabs'
import type { OfficeRow } from '@/components/features/dashboard/OfficeManagerDashboard'

// 事務管理担当ダッシュボード。
//   ① 作業着手待ち … status=作業着手準備 の案件（前受金入金＋ファイル化で着手OK）
//   ② 郵便       … 前営業日と本日に届いて、まだ対応していない到着物
//   ③ タスク     … 事務管理タスク一覧（既定タブ）
//   ④ 報連相     … 自分が出した報告・連絡・相談
export default async function OfficeDashboardPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const today = new Date().toLocaleDateString('sv-SE')
  // 郵便は「まだ対応していないもの」を全部出す（放置されたぶんを消さない）。
  // 30日より前のものは受信簿で探す想定。
  const mailFrom = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - 30)
    return d.toLocaleDateString('sv-SE')
  })()

  const { data: casesData } = await supabase
    .from('cases')
    .select('id, case_number, deal_name, status, filing_status, order_sheet_completed_at, order_sheet_finalized_at, updated_at, order_received_date, case_members(role, members(name, team_id))')
    .eq('status', '作業着手準備')
    .order('order_received_date', { ascending: true })

  const cases = (casesData ?? []) as unknown as Array<{
    id: string; case_number: string; deal_name: string; filing_status: string | null
    order_sheet_completed_at: string | null; order_sheet_finalized_at: string | null; updated_at: string | null; order_received_date: string | null
    case_members?: { role: string; members: { name: string; team_id: string | null } | null }[] | null
  }>
  const caseIds = cases.map(c => c.id)

  // 作業着手準備→作業進行中 の着手ゲート：前受金入金（前受金invoiceが入金済）＋ファイル化。
  //   ※オーダーシート最終化・タスク出しは受注→作業着手準備 の前段で済ませる想定に変更（着手条件から除外）。
  const [invRes, teamsRes, mailRes, reportRes, memberRes, taskData] = await Promise.all([
    caseIds.length ? supabase.from('invoices').select('case_id, invoice_type, status').in('case_id', caseIds) : Promise.resolve({ data: [] }),
    supabase.from('teams').select('id, name'),
    // 郵便：直近30日に届いた到着物のうち、対応（started_at）が付いていないもの。
    // タブの色は「いちばん古い未対応」で決める（当日=青／翌営業日=緑／2営業日以上=オレンジ）。
    supabase
      .from('document_receipts')
      .select('id, case_id, received_date, sequence_no, location, postal_type, is_parcel, opened_at, started_at, items:document_receipt_items(item_name, quantity, received_from, sort_order), case:cases(case_number, deal_name)')
      .gte('received_date', mailFrom)
      .lte('received_date', today)
      .is('started_at', null)
      .order('received_date')
      .order('sequence_no'),
    // 報連相：自分が出したもの（新しい順）
    currentUser?.memberId
      ? supabase
          .from('case_reports')
          .select('id, case_id, kind, message, requested_date, status, recipient_ids, confirmed_date, confirmer:members!case_reports_confirmer_id_fkey(name), case:cases(case_number, deal_name)')
          .eq('requester_id', currentUser.memberId)
          .order('requested_date', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    supabase.from('members').select('id, name'),
    loadTaskListData(),
  ])

  const invs = (invRes.data ?? []) as Array<{ case_id: string; invoice_type: string; status: string }>
  const teamName = new Map(((teamsRes.data ?? []) as Array<{ id: string; name: string }>).map(t => [t.id, t.name]))

  const startRows: OfficeRow[] = cases.map(c => {
    const sales = c.case_members?.find(m => m.role === 'sales')?.members ?? null
    const manager = c.case_members?.find(m => m.role === 'manager')?.members ?? null
    const advancePaid = invs.some(i => i.case_id === c.id && i.invoice_type === '前受金' && i.status === '入金済')
    return {
      caseId: c.id,
      caseNumber: c.case_number,
      dealName: c.deal_name,
      osUpdatedAt: (c.order_sheet_completed_at ?? c.updated_at ?? '')?.slice(0, 10) || null,
      teamName: sales?.team_id ? teamName.get(sales.team_id) ?? null : null,
      salesName: sales?.name ?? null,
      managerName: manager?.name ?? null,
      advancePaid,
      filingStatus: c.filing_status === '済' ? '済' : '未',
    }
  })

  // 受信簿と同じ「0513/001」形式
  const receiptNumber = (ymd: string, seq: number) => `${ymd.slice(5, 7)}${ymd.slice(8, 10)}/${String(seq).padStart(3, '0')}`

  const mails: MailRow[] = ((mailRes.data ?? []) as unknown as Array<{
    id: string; case_id: string; received_date: string; sequence_no: number
    location: string | null; postal_type: string | null; is_parcel: boolean | null; opened_at: string | null
    items?: Array<{ item_name: string; quantity: number | null; received_from: string | null; sort_order: number | null }> | null
    case?: { case_number: string; deal_name: string } | null
  }>).map(r => {
    const items = [...(r.items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return {
      id: r.id,
      caseId: r.case_id,
      caseNumber: r.case?.case_number ?? '—',
      dealName: r.case?.deal_name ?? '—',
      receivedDate: r.received_date,
      numberText: receiptNumber(r.received_date, r.sequence_no),
      location: r.location ?? null,
      postalType: r.postal_type ?? null,
      sender: [...new Set(items.map(i => (i.received_from ?? '').trim()).filter(Boolean))].join(' / ') || null,
      isParcel: !!r.is_parcel,
      opened: !!r.opened_at,
      items: items.map(i => ({ name: i.item_name, quantity: i.quantity ?? null })),
    }
  })

  const memberName = new Map(((memberRes.data ?? []) as Array<{ id: string; name: string }>).map(m => [m.id, m.name]))
  const hourenSou: HourenSouRow[] = ((reportRes.data ?? []) as unknown as Array<{
    id: string; case_id: string; kind: string; message: string | null; requested_date: string
    status: '依頼中' | '確認済'; recipient_ids: string[] | null; confirmed_date: string | null
    confirmer?: { name: string } | null
    case?: { case_number: string; deal_name: string } | null
  }>).map(r => ({
    id: r.id,
    caseId: r.case_id,
    caseNumber: r.case?.case_number ?? '—',
    dealName: r.case?.deal_name ?? '—',
    kind: r.kind,
    message: r.message ?? null,
    requestedDate: r.requested_date,
    status: r.status,
    recipientNames: (r.recipient_ids ?? []).map(id => memberName.get(id) ?? '').filter(Boolean),
    confirmerName: r.confirmer?.name ?? null,
    confirmedDate: r.confirmed_date ?? null,
  }))

  return (
    <OfficeDashboardTabs
      startRows={startRows}
      currentMemberId={currentUser?.memberId ?? null}
      currentMemberName={currentUser?.memberName ?? null}
      mails={mails}
      hourenSou={hourenSou}
      tasks={taskData.tasks}
      caseMap={taskData.caseMap}
      allMembers={taskData.allMembers}
      receipts={taskData.receipts}
      financeBlockedCaseIds={taskData.financeBlockedCaseIds}
      freezeAssetsByCase={taskData.freezeAssetsByCase}
      today={today}
    />
  )
}

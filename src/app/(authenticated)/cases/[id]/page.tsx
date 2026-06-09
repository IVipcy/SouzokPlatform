import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import CaseDetailClient from '@/components/features/cases/CaseDetailClient'
import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'
import { computeCaseAlerts } from '@/lib/alerts'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow, CaseDocumentRow, ClientCommunicationRow, CaseReferralRow } from '@/types'

type Props = {
  params: Promise<{ id: string }>
}

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const [caseResult, membersResult, tasksResult, allMembersResult, templatesResult, heirsResult, propertiesResult, financialAssetsResult, divisionDetailsResult, expensesResult, documentsResult, clientCommsResult, invoicesResult, reportsResult, receiptsResult, statusHistoryResult, referralsResult] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', id)
      .single(),
    supabase
      .from('case_members')
      .select('*, members(*)')
      .eq('case_id', id),
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*)), started_by_member:members!tasks_started_by_fkey(*)')
      .eq('case_id', id)
      .order('sort_order'),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('task_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('heirs')
      .select('*')
      .eq('case_id', id)
      .order('sort_order'),
    supabase
      .from('real_estate_properties')
      .select('*')
      .eq('case_id', id),
    supabase
      .from('financial_assets')
      .select('*')
      .eq('case_id', id),
    supabase
      .from('division_details')
      .select('*')
      .eq('case_id', id),
    supabase
      .from('expenses')
      .select('*')
      .eq('case_id', id)
      .order('expense_date'),
    supabase
      .from('case_documents')
      .select('*, tasks(id,title)')
      .eq('case_id', id)
      .order('sent_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('client_communications')
      .select('*')
      .eq('case_id', id)
      .order('communicated_at', { ascending: false }),
    supabase.from('invoices').select('status,invoice_type').eq('case_id', id).eq('invoice_type', '前受金'),
    supabase.from('progress_reports').select('status,confirmed_date').eq('case_id', id),
    supabase.from('document_receipts')
      .select('id, received_date, dual_checked_at, started_by_member_id, started_by_member:members!document_receipts_started_by_member_id_fkey(name), items:document_receipt_items(item_name, sort_order)')
      .eq('case_id', id)
      .order('received_date', { ascending: true }),
    // 案件のステータス遷移履歴（マイルストーンを実績ベースで描くために使用）
    supabase.from('activity_log')
      .select('new_value, created_at')
      .eq('entity_type', 'case').eq('action', 'status_change').eq('entity_id', id)
      .order('created_at', { ascending: true }),
    // 他事業者紹介（業者別）。migration 062 未適用環境では error → 空配列で degrade。
    supabase.from('case_referrals').select('*').eq('case_id', id).order('created_at', { ascending: true }),
  ])

  if (caseResult.error || !caseResult.data) {
    notFound()
  }

  // 最終接触日（鮮度フラグ用）を更新。1日1回だけ書き込む。
  try {
    const lastOpened = (caseResult.data as { last_opened_at?: string | null }).last_opened_at
    const todayStr = new Date().toISOString().slice(0, 10)
    if (!lastOpened || lastOpened.slice(0, 10) < todayStr) {
      await supabase.from('cases').update({ last_opened_at: new Date().toISOString() }).eq('id', id)
    }
  } catch { /* migration 未適用環境では無視 */ }

  // 案件ヘッダー用のアラート算出
  const cmRows = (membersResult.data ?? []) as CaseMemberRow[]
  const advInvRows = (invoicesResult.data ?? []) as Array<{ status: string }>
  const repRows = (reportsResult.data ?? []) as Array<{ status: string; confirmed_date: string | null }>
  const tasksForAlert = (tasksResult.data ?? []) as TaskRow[]
  const receiptRows = (receiptsResult.data ?? []) as Array<{ dual_checked_at: string | null; started_by_member_id: string | null }>
  const now = new Date()
  const nowStr = now.toISOString().slice(0, 10)
  const weekAgoStr = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  const caseAlerts = computeCaseAlerts(
    caseResult.data as CaseRow,
    {
      managerExists: cmRows.some(m => m.role === 'manager'),
      advanceInvoiceStatus: advInvRows[0]?.status ?? null,
      recentWeeklyConfirmed: repRows.some(r => r.status === '確認済' && (r.confirmed_date ?? '') >= weekAgoStr),
      overdueTaskCount: tasksForAlert.filter(t => t.due_date && t.due_date < nowStr && t.status !== '完了' && t.status !== 'キャンセル').length,
      docArrivedUnstarted: receiptRows.some(r => r.dual_checked_at && !r.started_by_member_id),
      docUncheckedUnstarted: receiptRows.some(r => !r.dual_checked_at && !r.started_by_member_id),
    },
    now,
  )

  return (
    <CaseDetailClient
      caseAlerts={caseAlerts}
      caseData={caseResult.data as CaseRow}
      caseMembers={(membersResult.data ?? []) as CaseMemberRow[]}
      tasks={(tasksResult.data ?? []) as TaskRow[]}
      allMembers={(allMembersResult.data ?? []) as MemberRow[]}
      taskTemplates={(templatesResult.data ?? []) as TaskTemplateRow[]}
      heirs={(heirsResult.data ?? []) as HeirRow[]}
      properties={(propertiesResult.data ?? []) as RealEstatePropertyRow[]}
      financialAssets={(financialAssetsResult.data ?? []) as FinancialAssetRow[]}
      divisionDetails={(divisionDetailsResult.data ?? []) as DivisionDetailRow[]}
      expenses={(expensesResult.data ?? []) as ExpenseRow[]}
      documents={(documentsResult.data ?? []) as CaseDocumentRow[]}
      clientCommunications={(clientCommsResult.data ?? []) as ClientCommunicationRow[]}
      currentMemberId={currentUser?.memberId ?? null}
      statusHistory={(statusHistoryResult.data ?? []) as Array<{ new_value: string | null; created_at: string }>}
      documentReceipts={(receiptsResult.data ?? []) as unknown as TimelineReceipt[]}
      caseReferrals={(referralsResult.data ?? []) as CaseReferralRow[]}
    />
  )
}

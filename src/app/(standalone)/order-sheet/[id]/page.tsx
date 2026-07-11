import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import OrderSheetCaseClient from './OrderSheetCaseClient'
import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'
import type {
  CaseRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, CaseReferralRow,
  CaseClientRow, ContractDocumentRow, SagyoDocumentRow,
} from '@/types'

type Props = { params: Promise<{ id: string }> }

// オーダーシート入力アプリの案件画面（独立ルート）。既存 OrderSheet に必要なデータを読み込んで再利用。
export default async function OrderSheetCasePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [caseR, heirsR, kosekiR, propsR, acqR, finR, divR, agrR, expR, tasksR, commsR, refR, clientsR, contractR, sagyoR, receiptsR] = await Promise.all([
    supabase.from('cases').select('*, clients(*)').eq('id', id).single(),
    supabase.from('heirs').select('*').eq('case_id', id).order('sort_order'),
    supabase.from('koseki_requests').select('*').eq('case_id', id).order('sort_order'),
    supabase.from('real_estate_properties').select('*').eq('case_id', id),
    supabase.from('real_estate_acquisitions').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
    supabase.from('financial_assets').select('*').eq('case_id', id),
    supabase.from('division_details').select('*').eq('case_id', id),
    supabase.from('agreement_dispatches').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
    supabase.from('expenses').select('*').eq('case_id', id).order('expense_date'),
    supabase.from('tasks').select('*, task_assignees(*, members(*)), started_by_member:members!tasks_started_by_fkey(*)').eq('case_id', id).order('sort_order'),
    supabase.from('client_communications').select('*').eq('case_id', id).order('communicated_at', { ascending: false }),
    supabase.from('case_referrals').select('*').eq('case_id', id).order('created_at', { ascending: true }),
    supabase.from('case_clients').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
    supabase.from('contract_documents').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
    supabase.from('sagyo_documents').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
    supabase.from('document_receipts')
      .select('id, received_date, dual_checked_at, started_by_member_id, started_task_id, started_by_member:members!document_receipts_started_by_member_id_fkey(name), items:document_receipt_items(id, item_name, sort_order, uploaded_at, link_not_required, settlement_reflect, settlement_amount, linked_id, linked_kind, linked_field, case_document_id, case_document:case_documents!case_document_id(received_file_path, received_file_bucket, received_file_name), item_tasks:document_receipt_item_tasks(task:tasks(id, title)))')
      .eq('case_id', id)
      .order('received_date', { ascending: true }),
  ])

  if (caseR.error || !caseR.data) notFound()

  return (
    <OrderSheetCaseClient
      caseData={caseR.data as CaseRow}
      heirs={(heirsR.data ?? []) as HeirRow[]}
      kosekiRequests={(kosekiR.data ?? []) as KosekiRequestRow[]}
      properties={(propsR.data ?? []) as RealEstatePropertyRow[]}
      acquisitions={(acqR.data ?? []) as unknown as RealEstateAcquisitionRow[]}
      financialAssets={(finR.data ?? []) as FinancialAssetRow[]}
      divisionDetails={(divR.data ?? []) as DivisionDetailRow[]}
      agreementDispatches={(agrR.data ?? []) as AgreementDispatchRow[]}
      expenses={(expR.data ?? []) as ExpenseRow[]}
      tasks={(tasksR.data ?? []) as TaskRow[]}
      clientCommunications={(commsR.data ?? []) as ClientCommunicationRow[]}
      referrals={(refR.data ?? []) as CaseReferralRow[]}
      caseClients={(clientsR.data ?? []) as CaseClientRow[]}
      contractDocuments={(contractR.data ?? []) as ContractDocumentRow[]}
      sagyoDocuments={(sagyoR.data ?? []) as SagyoDocumentRow[]}
      receipts={(receiptsR.data ?? []) as unknown as TimelineReceipt[]}
    />
  )
}

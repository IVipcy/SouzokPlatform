import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import IntakeCaseClient from './IntakeCaseClient'
import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'
import type {
  CaseRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, CaseReferralRow,
  CaseClientRow, ContractDocumentRow, SagyoDocumentRow, MemberRow, CaseOtherAssetRow } from '@/types'
import type { MeetingMemoRow } from './IntakeCaseClient'

type Props = { params: Promise<{ id: string }> }

// 統合入力アプリ 案件画面（独立ルート）。①面談シート ②面談結果登録 ③オーダーシート の3タブ。
// オーダーシートに必要な関連データと、面談シートの手書きメモ(meeting_memos)を読み込む。
export default async function IntakeCasePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  // 割振り依頼ポップ（受注系/依頼確定待ちで②保存時）で使う全メンバー
  const { data: members } = await supabase.from('members').select('*').eq('is_active', true).order('name')
  const allMembers = (members ?? []) as MemberRow[]

  // 新規（下書き未作成）モード：案件をまだDBに作らず、面談シートで最初の入力があった時点で
  // 遅延作成する（IntakeCaseClient の ensureCase）。ここでは空の合成 caseData を渡す。
  if (id === 'new') {
    const draft = {
      id: '', case_number: '（未作成）', deal_name: '無題', status: '検討中',
      client_id: null, clients: null, work_content: {}, intake_draft: true,
    } as unknown as CaseRow
    return (
      <IntakeCaseClient
        caseData={draft}
        currentMemberId={currentUser?.memberId ?? null}
        allMembers={allMembers}
        memos={[]} heirs={[]} kosekiRequests={[]} properties={[]} acquisitions={[]}
        financialAssets={[]} divisionDetails={[]} agreementDispatches={[]} expenses={[]}
        tasks={[]} clientCommunications={[]} referrals={[]} caseClients={[]}
        contractDocuments={[]} sagyoDocuments={[]} receipts={[]}
      />
    )
  }

  const [caseR, heirsR, kosekiR, propsR, acqR, finR, divR, agrR, expR, tasksR, commsR, refR, clientsR, contractR, sagyoR, receiptsR, memosR, otherR] = await Promise.all([
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
      .eq('case_id', id).order('received_date', { ascending: true }),
    supabase.from('meeting_memos').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
    // その他財産／相続債務／その他費用。migration 224 未適用環境では error → 空配列で degrade。
    supabase.from('case_other_assets').select('*').eq('case_id', id).order('sort_order', { ascending: true }),
  ])

  if (caseR.error || !caseR.data) notFound()

  return (
    <IntakeCaseClient
      caseData={caseR.data as CaseRow}
      currentMemberId={currentUser?.memberId ?? null}
      allMembers={allMembers}
      memos={(memosR.data ?? []) as MeetingMemoRow[]}
      otherAssets={(otherR.data ?? []) as CaseOtherAssetRow[]}
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

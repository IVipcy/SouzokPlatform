import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { isMinimalMode } from '@/lib/featureMode'
import DocumentsClient from '@/components/features/documents/DocumentsClient'
import type { CaseDocumentRow, DocumentReceiptRow, DocumentReceiptItemRow, MemberRow } from '@/types'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
}

export default async function DocumentsPage() {
  if (isMinimalMode()) redirect('/my')
  const supabase = await createClient()
  const currentUser = await getCurrentUser()
  const currentMemberId = currentUser?.memberId ?? null

  const [
    { data: documentsRaw },
    { data: casesRaw },
    { data: receiptsRaw },
    { data: receiptItemsRaw },
    { data: currentMemberRaw },
  ] = await Promise.all([
    supabase
      .from('case_documents')
      .select('*, tasks(id,title)')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id,case_number,deal_name,status')
      .order('case_number'),
    supabase
      .from('document_receipts')
      .select(`
        *,
        cases(id, case_number, deal_name),
        dual_check_member:members!document_receipts_dual_check_member_id_fkey(id, name, avatar_color, avatar_url, primary_role),
        started_by_member:members!document_receipts_started_by_member_id_fkey(id, name, avatar_color, avatar_url, primary_role)
      `)
      .order('received_date', { ascending: false })
      .order('sequence_no', { ascending: false }),
    supabase
      .from('document_receipt_items')
      .select('*')
      .order('sort_order'),
    currentMemberId
      ? supabase.from('members').select('*').eq('id', currentMemberId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const documents = (documentsRaw ?? []) as CaseDocumentRow[]
  const cases = (casesRaw ?? []) as CaseLite[]
  const receiptsBase = (receiptsRaw ?? []) as DocumentReceiptRow[]
  const items = (receiptItemsRaw ?? []) as DocumentReceiptItemRow[]
  // 子テーブル items を親 receipt に紐付け
  const itemsByReceipt = new Map<string, DocumentReceiptItemRow[]>()
  for (const it of items) {
    if (!itemsByReceipt.has(it.receipt_id)) itemsByReceipt.set(it.receipt_id, [])
    itemsByReceipt.get(it.receipt_id)!.push(it)
  }
  const receipts: DocumentReceiptRow[] = receiptsBase.map(r => ({
    ...r,
    items: itemsByReceipt.get(r.id) ?? [],
  }))

  const currentMember = (currentMemberRaw ?? null) as MemberRow | null

  return (
    <DocumentsClient
      documents={documents}
      receipts={receipts}
      cases={cases}
      currentMemberId={currentMemberId}
      currentMember={currentMember}
    />
  )
}

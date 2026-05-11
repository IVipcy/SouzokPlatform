import { createClient } from '@/lib/supabase/server'
import DocumentsClient from '@/components/features/documents/DocumentsClient'
import type { CaseDocumentRow } from '@/types'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
}

export default async function DocumentsPage() {
  const supabase = await createClient()

  const [{ data: documentsRaw }, { data: casesRaw }] = await Promise.all([
    supabase
      .from('case_documents')
      .select('*, tasks(id,title)')
      .order('sent_date', { ascending: false, nullsFirst: false })
      .order('received_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id,case_number,deal_name,status')
      .order('case_number'),
  ])

  const documents = (documentsRaw ?? []) as CaseDocumentRow[]
  const cases = (casesRaw ?? []) as CaseLite[]

  return <DocumentsClient documents={documents} cases={cases} />
}

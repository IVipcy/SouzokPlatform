import { createClient } from '@/lib/supabase/server'
import DocumentsClient from '@/components/features/documents/DocumentsClient'
import type { DocumentRow, MemberRow } from '@/types'

export default async function DocumentsPage() {
  const supabase = await createClient()

  const [docsResult, membersResult, casesResult] = await Promise.all([
    supabase
      .from('documents')
      .select('*, cases(id, case_number, deal_name, case_members(*, members(*))), tasks(id, title)')
      .order('created_at', { ascending: false }),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true),
    supabase
      .from('cases')
      .select('id, case_number, deal_name')
      .order('case_number'),
  ])

  return (
    <DocumentsClient
      documents={(docsResult.data ?? []) as DocumentRow[]}
      members={(membersResult.data ?? []) as MemberRow[]}
      cases={casesResult.data ?? []}
    />
  )
}

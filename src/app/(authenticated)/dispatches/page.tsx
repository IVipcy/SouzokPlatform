import { createClient } from '@/lib/supabase/server'
import DispatchesClient from '@/components/features/dispatches/DispatchesClient'
import type { DocumentDispatchRow } from '@/types'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
}

export default async function DispatchesPage() {
  const supabase = await createClient()

  const [{ data: dispatchesRaw }, { data: casesRaw }] = await Promise.all([
    supabase
      .from('document_dispatches')
      .select('*')
      .order('sent_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id,case_number,deal_name,status')
      .order('case_number'),
  ])

  const dispatches = (dispatchesRaw ?? []) as DocumentDispatchRow[]
  const cases = (casesRaw ?? []) as CaseLite[]

  return <DispatchesClient dispatches={dispatches} cases={cases} />
}

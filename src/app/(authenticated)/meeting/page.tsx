import { createClient } from '@/lib/supabase/server'
import MeetingPageClient from './MeetingPageClient'

export default async function MeetingPage() {
  const supabase = await createClient()

  const { data: cases } = await supabase
    .from('cases')
    .select('*, clients(*)')
    .in('status', ['面談設定済', '検討中', '受注'])
    .order('created_at', { ascending: false })

  return <MeetingPageClient cases={(cases ?? []) as any} />
}

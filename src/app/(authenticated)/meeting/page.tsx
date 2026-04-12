import { createClient } from '@/lib/supabase/server'
import MeetingPageClient from './MeetingPageClient'

export default async function MeetingPage() {
  const supabase = await createClient()

  const { data: cases } = await supabase
    .from('cases')
    .select('*, clients(*)')
    .eq('status', '面談設定済')
    .order('created_at', { ascending: false })

  return <MeetingPageClient cases={(cases ?? []) as any} />
}

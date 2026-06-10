import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import MeetingPageClient, { type CaseData } from './MeetingPageClient'

export default async function MeetingPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const { data: cases } = await supabase
    .from('cases')
    .select('*, clients(*)')
    .eq('status', '面談設定済')
    .order('created_at', { ascending: false })

  return <MeetingPageClient cases={(cases ?? []) as unknown as CaseData[]} currentMemberId={currentUser?.memberId ?? null} />
}

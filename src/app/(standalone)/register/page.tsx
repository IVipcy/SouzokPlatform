import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import MeetingPageClient, { type CaseData } from '@/app/(authenticated)/meeting/MeetingPageClient'

// 相談案件登録（独立ルート）。/meeting と同じ中身を、サイドバー無しのモバイル最適レイアウトで表示。
export default async function RegisterPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const { data: cases } = await supabase
    .from('cases')
    .select('*, clients(*)')
    .eq('status', '面談設定済')
    .order('created_at', { ascending: false })

  return <MeetingPageClient cases={(cases ?? []) as unknown as CaseData[]} currentMemberId={currentUser?.memberId ?? null} />
}

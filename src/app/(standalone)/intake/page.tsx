import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import IntakeEntryClient from './IntakeEntryClient'
import type { CaseData } from '@/app/(authenticated)/meeting/MeetingPageClient'

// 統合入力アプリ 入口（独立ルート）。
// ルート選択（LP直案件／OC直・HP経由）→ LP=面談設定済案件を検索・選択／OC=新規作成 → /intake/[id] へ。
export default async function IntakePage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const { data: cases } = await supabase
    .from('cases')
    .select('*, clients(*)')
    .eq('status', '面談設定済')
    .order('created_at', { ascending: false })

  return <IntakeEntryClient cases={(cases ?? []) as unknown as CaseData[]} currentMemberId={currentUser?.memberId ?? null} />
}

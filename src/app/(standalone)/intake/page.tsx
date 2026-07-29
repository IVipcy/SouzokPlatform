import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import IntakeEntryClient, { type IntakeDraft } from './IntakeEntryClient'
import type { CaseData } from '@/app/(authenticated)/meeting/MeetingPageClient'

// 統合入力アプリ 入口（独立ルート）。
// ルート選択（LP直案件／OC直・HP経由）→ LP=面談設定済案件を検索・選択／OC=新規作成 → /intake/[id] へ。
export default async function IntakePage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const memberId = currentUser?.memberId ?? null
  const [{ data: cases }, draftsR] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('status', '面談設定済')
      .order('created_at', { ascending: false }),
    // 入力途中の下書き（自分が作成したもの）。再開の入口。
    memberId
      ? supabase
          .from('cases')
          .select('id, case_number, deal_name, updated_at, created_at, clients(name)')
          .eq('intake_draft', true)
          .eq('meeting_owner_id', memberId)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <IntakeEntryClient
      cases={(cases ?? []) as unknown as CaseData[]}
      drafts={(draftsR.data ?? []) as unknown as IntakeDraft[]}
      currentMemberId={memberId}
    />
  )
}

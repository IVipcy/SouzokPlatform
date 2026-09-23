// 案件を削除できるか（migration 294 の can_delete_case と同じルール）。
//   ・システム管理者 … いつでも
//   ・下書き（intake_draft） … 誰でも（面談シートの「破棄」）
//   ・受注前（面談設定済・検討中・失注など）で自分が案件メンバー … 可
//   ・受注以降（受注〜納品完了） … システム管理者だけ（請求・入金が乗っているため）
// DB 側のポリシーが本当の門番。ここは「子テーブルを消し始める前に止める」ためと、ボタンの出し分け用。

import type { createClient } from '@/lib/supabase/client'
import type { UserWithRoles } from '@/lib/auth'
import { AFTER_ORDER_STATUSES } from '@/lib/constants'

type SB = ReturnType<typeof createClient>

export const CASE_DELETE_DENIED_MESSAGE = '受注以降の案件はシステム管理者だけが削除できます'

/** 画面側の出し分け用（DBに聞かずに判定）。自分がメンバーかは case_members から渡す */
export function canDeleteCaseLocally(
  user: UserWithRoles | null,
  c: { status: string; intake_draft?: boolean | null; memberIds?: string[] | null },
): boolean {
  if (!user) return false
  if (user.primaryRole === 'system_manager' || user.roles.includes('system_manager')) return true
  if (c.intake_draft) return true
  if ((AFTER_ORDER_STATUSES as readonly string[]).includes(c.status)) return false
  return !!user.memberId && !!c.memberIds?.includes(user.memberId)
}

/**
 * 削除の直前に DB の判定関数で確認する。子テーブルを消した後で本体だけ拒否されると
 * 「関連だけ消えて案件が残る」最悪の形になるので、必ず先に呼ぶ。
 * migration 294 未適用（関数が無い）ときは止めない（従来どおり）。
 */
export async function assertCanDeleteCase(supabase: SB, caseId: string): Promise<void> {
  const { data, error } = await supabase.rpc('can_delete_case', { p_case_id: caseId })
  if (error) {
    // 関数が無い＝マイグレ未適用。従来の挙動を保つ
    if (/could not find|does not exist|42883|PGRST202/i.test(`${error.code} ${error.message}`)) return
    throw new Error(`削除の権限を確認できませんでした: ${error.message}`)
  }
  if (data === false) throw new Error(CASE_DELETE_DENIED_MESSAGE)
}

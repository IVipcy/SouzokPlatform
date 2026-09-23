// 「面談結果を案件に反映する」処理の置き場。
// 面談結果登録・案件詳細の面談情報タブ・新規作成モーダルのどこから受注にしても同じ結果になるようにここに集める。
//   ・ステータス（面談結果 → cases.status）
//   ・受注の獲得区分（即受注／面談なし受注 → order_win_type、互換の instant_order）
//   ・受注なら提案金額を報酬内訳の初期行に（seedRewardItemsFromProposal）
//   ・受注前なら案件番号の経路コードを受注ルートに合わせる（applyRouteToCaseNumber）
//
// 守ること（2026-09-23 監査 A55/A56）：
//   ・受注以降（受注〜納品完了）の案件は、面談結果から検討中・失注などへ戻さない。作業中の案件が巻き戻る事故を防ぐ。
//     ステータスを戻すときは案件ヘッダーの遷移（ゲート付き）から行う。
//   ・検討中／依頼確定待ち から受注にしたときは「戻り受注」にする（面談当日に決まったものだけが「受注」）。

import type { SupabaseClient } from '@supabase/supabase-js'
import { seedRewardItemsFromProposal } from '@/lib/rewardFromProposal'
import { applyRouteToCaseNumber } from '@/lib/caseNumber'
import { isOrderRouteLocked, AFTER_ORDER_STATUSES, type MeetingResultOption } from '@/lib/constants'

export const ORDER_LIKE_STATUSES = new Set(['受注', '戻り受注', '作業着手準備', '対応中'])
const RETURNING_FROM = new Set(['検討中', '検討中（契約書待ち）'])

export const MEETING_RESULT_LOCKED_MESSAGE = '受注以降の案件は面談結果から戻せません。ステータスは案件ヘッダーから変更してください'

/** 現在のステータスと面談結果から、実際に書くステータスを決める。書けないときは null */
export function resolveMeetingResultStatus(currentStatus: string | null | undefined, option: MeetingResultOption): string | null {
  const cur = currentStatus ?? ''
  const afterOrder = (AFTER_ORDER_STATUSES as readonly string[]).includes(cur)
  if (afterOrder && !ORDER_LIKE_STATUSES.has(option.status)) return null
  if (afterOrder && ORDER_LIKE_STATUSES.has(option.status)) return cur   // 受注済みに「受注」を重ねても進めない・戻さない
  if (option.status === '受注' && RETURNING_FROM.has(cur)) return '戻り受注'
  return option.status
}

export async function applyMeetingResult(
  supabase: SupabaseClient,
  caseId: string,
  option: MeetingResultOption,
  opts: { orderRoute?: string | null; caseNumber?: string | null; currentStatus?: string | null } = {},
): Promise<{ error: string | null }> {
  let current = opts.currentStatus ?? null
  if (current == null) {
    const { data } = await supabase.from('cases').select('status').eq('id', caseId).single()
    current = (data as { status: string } | null)?.status ?? null
  }
  const status = resolveMeetingResultStatus(current, option)
  if (status == null) return { error: MEETING_RESULT_LOCKED_MESSAGE }
  const { error } = await supabase.from('cases').update({
    status,
    order_win_type: option.winType,
    instant_order: option.winType === '即受注',
  }).eq('id', caseId)
  if (error) return { error: error.message }
  if (ORDER_LIKE_STATUSES.has(status)) await seedRewardItemsFromProposal(supabase, caseId)
  const r = await applyRouteToCaseNumber(supabase, caseId, opts.orderRoute ?? null, opts.caseNumber ?? null, !isOrderRouteLocked(status))
  return { error: r.error }
}

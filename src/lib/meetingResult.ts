// 「面談結果を案件に反映する」処理の置き場。
// 面談結果登録・案件詳細の面談情報タブ・新規作成モーダルのどこから受注にしても同じ結果になるようにここに集める。
//   ・ステータス（面談結果 → cases.status）
//   ・受注の獲得区分（即受注／面談なし受注 → order_win_type、互換の instant_order）
//   ・受注なら提案金額を報酬内訳の初期行に（seedRewardItemsFromProposal）
//   ・受注前なら案件番号の経路コードを受注ルートに合わせる（applyRouteToCaseNumber）

import type { SupabaseClient } from '@supabase/supabase-js'
import { seedRewardItemsFromProposal } from '@/lib/rewardFromProposal'
import { applyRouteToCaseNumber } from '@/lib/caseNumber'
import { isOrderRouteLocked, type MeetingResultOption } from '@/lib/constants'

export const ORDER_LIKE_STATUSES = new Set(['受注', '戻り受注', '作業着手準備', '対応中'])

export async function applyMeetingResult(
  supabase: SupabaseClient,
  caseId: string,
  option: MeetingResultOption,
  opts: { orderRoute?: string | null; caseNumber?: string | null } = {},
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('cases').update({
    status: option.status,
    order_win_type: option.winType,
    instant_order: option.winType === '即受注',
  }).eq('id', caseId)
  if (error) return { error: error.message }
  if (ORDER_LIKE_STATUSES.has(option.status)) await seedRewardItemsFromProposal(supabase, caseId)
  const r = await applyRouteToCaseNumber(supabase, caseId, opts.orderRoute ?? null, opts.caseNumber ?? null, !isOrderRouteLocked(option.status))
  return { error: r.error }
}

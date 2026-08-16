// 面談の提案金額 → 報酬内訳（reward_items）の初期行。
//
// 面談で金額を出しているのに、受注後に請求タブでまた同じ数字を打っていたので、
// 受注した時点で1行ずつ作っておく。項目は受注区分から決め、金額は提案額（税抜）をそのまま入れる。
// どちらも請求タブで直せる（項目はプルダウン、金額は入力欄）。
//
// 触らない条件：
//   ・その士業の提案が「提案せず」または空 … 行を作らない
//   ・すでに報酬内訳が1行でもある案件      … 手で入れたものを上書きしない

import type { SupabaseClient } from '@supabase/supabase-js'

/** 「330,000」「¥330,000」等 → 330000。「提案せず」・空は null。 */
export function parseProposalAmount(v: string | null | undefined): number | null {
  const s = (v ?? '').trim()
  if (!s || s === '提案せず') return null
  const d = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')
  if (!d) return null
  const n = Number(d)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 受注区分（service_category/2）から報酬内訳の項目名を決める。REWARD_ITEM_OPTIONS の範囲で返す。 */
function itemNameFor(shigyo: '司法' | '行政', categories: (string | null | undefined)[]): string {
  const cats = categories.filter(Boolean) as string[]
  if (shigyo === '司法') return cats.includes('登記') ? '相続登記' : '手続き一式'
  if (cats.includes('遺産承継')) return '遺産承継'
  if (cats.includes('手続き一式')) return '手続き一式'
  return '手続き一式'
}

/**
 * 受注した案件に、提案金額から報酬内訳の初期行を作る。
 * 既に報酬内訳がある・提案金額が無い場合は何もしない（戻り値は作った行数）。
 */
export async function seedRewardItemsFromProposal(supabase: SupabaseClient, caseId: string): Promise<number> {
  const { data: existing } = await supabase.from('reward_items').select('id').eq('case_id', caseId).limit(1)
  if (existing && existing.length > 0) return 0

  const { data: c } = await supabase
    .from('cases')
    .select('proposal_judicial, proposal_administrative, service_category, service_category_2')
    .eq('id', caseId)
    .maybeSingle()
  if (!c) return 0
  const row = c as {
    proposal_judicial: string | null
    proposal_administrative: string | null
    service_category: string | null
    service_category_2: string | null
  }
  const cats = [row.service_category, row.service_category_2]

  const inserts: Array<{ case_id: string; shigyo: string; label: string; amount: number; sort_order: number }> = []
  const gyosei = parseProposalAmount(row.proposal_administrative)
  if (gyosei) inserts.push({ case_id: caseId, shigyo: '行政', label: itemNameFor('行政', cats), amount: gyosei, sort_order: 0 })
  const shiho = parseProposalAmount(row.proposal_judicial)
  if (shiho) inserts.push({ case_id: caseId, shigyo: '司法', label: itemNameFor('司法', cats), amount: shiho, sort_order: 0 })
  if (inserts.length === 0) return 0

  const { error } = await supabase.from('reward_items').insert(inserts)
  if (error) { console.error('seedRewardItemsFromProposal failed', error); return 0 }

  // 確定報酬（cases.fee_*）にも同じ額を入れておく。請求タブを開けば内訳から再計算されるが、
  // 開く前でも案件一覧・売上の見込みに乗るようにする。
  const patch: Record<string, number> = {}
  if (gyosei) patch.fee_administrative = gyosei
  if (shiho) patch.fee_judicial = shiho
  if (Object.keys(patch).length > 0) await supabase.from('cases').update(patch).eq('id', caseId)
  return inserts.length
}

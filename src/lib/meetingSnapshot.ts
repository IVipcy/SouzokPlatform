// 面談シートの「面談時点の記録」を作る／読む。
//
// 面談シートとオーダーシートは同じ列を直接読み書きしているので、受注後にオーダーシートで直すと
// 面談シートの表示まで変わっていた。面談結果登録を保存した時点の内容をここで丸ごと写し取り、
// 面談シートはそれを表示する（＝あとから変わらない）。取り直しは面談結果登録の再保存。

import type { SupabaseClient } from '@supabase/supabase-js'

export type MeetingSnapshot = {
  at: string                                   // 撮った日時（ISO）
  case: Record<string, unknown>                // 案件（面談で埋める項目だけ）
  client: Record<string, unknown> | null       // 依頼者マスタ（住所・振込名義など）
  caseClients: Record<string, unknown>[]       // 依頼者・同行者
  heirs: Record<string, unknown>[]             // 相続人
  properties: Record<string, unknown>[]        // 不動産
  financialAssets: Record<string, unknown>[]   // 金融資産
  otherAssets: Record<string, unknown>[]       // その他財産・債務・費用
  referrals: Record<string, unknown>[]         // 他事業者紹介
}

// 面談シートで触る案件の項目だけを写す（オーダーシート専用の項目まで持つと意味がぼやけるため）
const CASE_FIELDS = [
  'deal_name', 'status', 'meeting_type', 'meeting_executed_date', 'meeting_place',
  'order_route', 'order_route_detail', 'service_category', 'service_category_2', 'service_parts',
  'procedure_type', 'intake_roles', 'proposal_judicial', 'proposal_administrative', 'proposal_note',
  'contract_type', 'difficulty', 'client_response_due_date', 'consideration_period', 'prospect_level',
  'deceased_name', 'deceased_furigana', 'deceased_birth_date', 'date_of_death',
  'deceased_address', 'deceased_registered_address',
  'meeting_hearing_memo', 'meeting_other_notes', 'work_content', 'tax_filing_required',
] as const

const pick = (row: Record<string, unknown> | null, fields: readonly string[]) => {
  const out: Record<string, unknown> = {}
  if (!row) return out
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f]
  return out
}

/** 面談結果登録の保存後に呼ぶ。いまの案件の内容を面談時点の記録として保存する。 */
export async function saveMeetingSnapshot(supabase: SupabaseClient, caseId: string): Promise<void> {
  const [{ data: c }, { data: caseClients }, { data: heirs }, { data: props }, { data: fin }, { data: other }, { data: refs }] = await Promise.all([
    supabase.from('cases').select('*, clients(*)').eq('id', caseId).maybeSingle(),
    supabase.from('case_clients').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
    supabase.from('heirs').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
    supabase.from('real_estate_properties').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
    supabase.from('financial_assets').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
    supabase.from('case_other_assets').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
    supabase.from('case_referrals').select('*').eq('case_id', caseId),
  ])
  if (!c) return
  const row = c as Record<string, unknown> & { clients?: Record<string, unknown> | null }
  const snapshot: MeetingSnapshot = {
    at: new Date().toISOString(),
    case: pick(row, CASE_FIELDS),
    client: (row.clients ?? null) as Record<string, unknown> | null,
    caseClients: (caseClients ?? []) as Record<string, unknown>[],
    heirs: (heirs ?? []) as Record<string, unknown>[],
    properties: (props ?? []) as Record<string, unknown>[],
    financialAssets: (fin ?? []) as Record<string, unknown>[],
    otherAssets: (other ?? []) as Record<string, unknown>[],
    referrals: (refs ?? []) as Record<string, unknown>[],
  }
  const { error } = await supabase.from('cases')
    .update({ meeting_snapshot: snapshot, meeting_snapshot_at: snapshot.at })
    .eq('id', caseId)
  if (error) console.error('saveMeetingSnapshot failed', error)
}

/** 案件行から面談時点の記録を取り出す（無ければ null） */
export function readMeetingSnapshot(caseRow: { meeting_snapshot?: unknown } | null | undefined): MeetingSnapshot | null {
  const v = caseRow?.meeting_snapshot
  if (!v || typeof v !== 'object') return null
  const s = v as Partial<MeetingSnapshot>
  return s.case ? (s as MeetingSnapshot) : null
}

// 関連案件（case_relations。migration 287）
// 1行＝案件どうしの結び。向きは無いので、どちらの案件から見ても「相手の案件」として出す。

import type { SupabaseClient } from '@supabase/supabase-js'

export type RelatedCase = {
  /** case_relations.id */
  relationId: string
  note: string | null
  /** 相手の案件 */
  other: { id: string; case_number: string; deal_name: string; status: string; client_name: string | null }
}

type CaseLite = { id: string; case_number: string; deal_name: string; status: string; clients: { name: string | null } | null }
type RelRow = { id: string; case_id: string; related_case_id: string; note: string | null; created_at: string }

/** この案件の関連案件（両方向）。古い順 */
export async function fetchCaseRelations(supabase: SupabaseClient, caseId: string): Promise<RelatedCase[]> {
  const { data, error } = await supabase.from('case_relations').select('id, case_id, related_case_id, note, created_at')
    .or(`case_id.eq.${caseId},related_case_id.eq.${caseId}`).order('created_at')
  if (error || !data || data.length === 0) return []
  const rows = data as RelRow[]
  const otherIds = [...new Set(rows.map(r => (r.case_id === caseId ? r.related_case_id : r.case_id)))]
  const { data: cs } = await supabase.from('cases').select('id, case_number, deal_name, status, clients(name)').in('id', otherIds)
  const byId = new Map(((cs ?? []) as unknown as CaseLite[]).map(c => [c.id, c]))
  return rows.flatMap(r => {
    const oid = r.case_id === caseId ? r.related_case_id : r.case_id
    const c = byId.get(oid)
    if (!c) return []
    return [{ relationId: r.id, note: r.note, other: { id: c.id, case_number: c.case_number, deal_name: c.deal_name, status: c.status, client_name: c.clients?.name ?? null } }]
  })
}

/** 案件ごとの関連案件の数（一覧の「関連あり」用） */
export async function fetchRelatedCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from('case_relations').select('case_id, related_case_id')
  const m = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ case_id: string; related_case_id: string }>) {
    m.set(r.case_id, (m.get(r.case_id) ?? 0) + 1)
    m.set(r.related_case_id, (m.get(r.related_case_id) ?? 0) + 1)
  }
  return m
}

/** 関連案件の候補を探す（案件番号・案件名・依頼者名。下書きと自分は除く） */
export async function searchCasesForRelation(supabase: SupabaseClient, q: string, selfId: string, excludeIds: string[]): Promise<RelatedCase['other'][]> {
  const t = q.trim()
  if (!t) return []
  const like = `%${t.replace(/[%_,]/g, '')}%`
  const [byCase, byClient] = await Promise.all([
    supabase.from('cases').select('id, case_number, deal_name, status, clients(name)').eq('intake_draft', false)
      .or(`case_number.ilike.${like},deal_name.ilike.${like}`).order('created_at', { ascending: false }).limit(12),
    supabase.from('clients').select('id').ilike('name', like).limit(12),
  ])
  const clientIds = ((byClient.data ?? []) as Array<{ id: string }>).map(c => c.id)
  let byClientCases: CaseLite[] = []
  if (clientIds.length > 0) {
    const { data } = await supabase.from('cases').select('id, case_number, deal_name, status, clients(name)').eq('intake_draft', false).in('client_id', clientIds).limit(12)
    byClientCases = (data ?? []) as unknown as CaseLite[]
  }
  const seen = new Set<string>([selfId, ...excludeIds])
  const out: RelatedCase['other'][] = []
  for (const c of [...((byCase.data ?? []) as unknown as CaseLite[]), ...byClientCases]) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    out.push({ id: c.id, case_number: c.case_number, deal_name: c.deal_name, status: c.status, client_name: c.clients?.name ?? null })
  }
  return out.slice(0, 12)
}

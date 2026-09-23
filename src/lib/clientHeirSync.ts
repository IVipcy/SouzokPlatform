// 「メイン依頼者＝相続人一覧の依頼者チェック」を正にするための同期。
// 面談結果登録・依頼者一覧（case_clients）でメイン依頼者を決めたとき、同じ名前の相続人に is_client を付ける。
// 相続人にいなければ相続人として足す（続柄が分かれば入れる）。戸籍タスクの起点・郵送先情報一覧はこのチェックを見る。

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePersonName } from '@/lib/personName'

const key = (v: string | null | undefined) => normalizePersonName(v).replace(/[\s　]/g, '')

export async function syncMainClientHeir(supabase: SupabaseClient, caseId: string, name: string | null | undefined, relationship?: string | null): Promise<void> {
  const n = key(name)
  if (!n) return
  const { data } = await supabase.from('heirs').select('id, name, is_client').eq('case_id', caseId)
  const heirs = (data ?? []) as Array<{ id: string; name: string | null; is_client: boolean }>
  const match = heirs.find(h => key(h.name) === n)
  if (match) {
    const others = heirs.filter(h => h.is_client && h.id !== match.id).map(h => h.id)
    if (others.length > 0) await supabase.from('heirs').update({ is_client: false }).in('id', others)
    if (!match.is_client) await supabase.from('heirs').update({ is_client: true }).eq('id', match.id)
    return
  }
  const others = heirs.filter(h => h.is_client).map(h => h.id)
  if (others.length > 0) await supabase.from('heirs').update({ is_client: false }).in('id', others)
  await supabase.from('heirs').insert({
    case_id: caseId, name: (name ?? '').trim(), is_client: true, sort_order: heirs.length,
    ...(relationship ? { relationship_type: relationship, relationship } : {}),
  })
}

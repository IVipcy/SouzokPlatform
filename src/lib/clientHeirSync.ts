// 「メイン依頼者＝相続人一覧の依頼者チェック」を正にするための同期。
// 面談結果登録・依頼者一覧（case_clients）でメイン依頼者を決めたとき、同じ名前の相続人に is_client を付ける。
// 相続人にいなければ相続人として足す（続柄が分かれば入れる）。戸籍タスクの起点・郵送先情報一覧はこのチェックを見る。
// 他の相続人の「依頼者」チェックは触らない。共同依頼（兄弟2人が依頼者）があるため、メインを決めたからといって外さない。
// 失敗はエラーとして返す（黙って通すと同期漏れに気づけない）。

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePersonName } from '@/lib/personName'

const key = (v: string | null | undefined) => normalizePersonName(v).replace(/[\s　]/g, '')

export async function syncMainClientHeir(supabase: SupabaseClient, caseId: string, name: string | null | undefined, relationship?: string | null): Promise<void> {
  const n = key(name)
  if (!n) return
  const { data, error } = await supabase.from('heirs').select('id, name, is_client').eq('case_id', caseId)
  if (error) throw new Error(`相続人一覧を読めませんでした: ${error.message}`)
  const heirs = (data ?? []) as Array<{ id: string; name: string | null; is_client: boolean }>
  const match = heirs.find(h => key(h.name) === n)
  if (match) {
    if (!match.is_client) {
      const { error: e } = await supabase.from('heirs').update({ is_client: true }).eq('id', match.id)
      if (e) throw new Error(`相続人の依頼者チェックを付けられませんでした: ${e.message}`)
    }
    return
  }
  const { error: e } = await supabase.from('heirs').insert({
    case_id: caseId, name: (name ?? '').trim(), is_client: true, sort_order: heirs.length,
    ...(relationship ? { relationship_type: relationship, relationship } : {}),
  })
  if (e) throw new Error(`依頼者を相続人一覧に足せませんでした: ${e.message}`)
}

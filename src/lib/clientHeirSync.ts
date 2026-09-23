// 「メイン依頼者＝相続人一覧の依頼者チェック」を正にするための同期。
// 面談結果登録・依頼者一覧（case_clients）でメイン依頼者を決めたとき、同じ名前の相続人に is_client を付ける。
// 相続人にいなければ相続人として足す。戸籍タスクの起点・郵送先情報一覧はこのチェックを見る。
//
// 続柄・住所1・住所2 も一緒に写す（メイン依頼者の行は同じ人なので、依頼者側で入れた値がそのまま相続人側の値）。
//   ・渡された値が入っているときだけ書く（空で消さない）
//   ・氏名だけ決まった時点では続柄・住所は空のことが多いので、続柄・住所を保存したときにも呼ぶ（呼び出し側）
// 他の相続人の「依頼者」チェックは触らない。共同依頼（兄弟2人が依頼者）があるため、メインを決めたからといって外さない。
// 失敗はエラーとして返す（黙って通すと同期漏れに気づけない）。

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePersonName } from '@/lib/personName'

const key = (v: string | null | undefined) => normalizePersonName(v).replace(/[\s　]/g, '')

export type ClientHeirExtra = {
  /** 住所1（都道府県〜番地まで） */
  address?: string | null
  /** 住所2（建物名・部屋番号） */
  address2?: string | null
}

export async function syncMainClientHeir(
  supabase: SupabaseClient,
  caseId: string,
  name: string | null | undefined,
  relationship?: string | null,
  extra: ClientHeirExtra = {},
): Promise<void> {
  const n = key(name)
  if (!n) return
  const { data, error } = await supabase.from('heirs').select('id, name, is_client, relationship_type, address, address2').eq('case_id', caseId)
  if (error) throw new Error(`相続人一覧を読めませんでした: ${error.message}`)
  const heirs = (data ?? []) as Array<{ id: string; name: string | null; is_client: boolean; relationship_type: string | null; address: string | null; address2: string | null }>
  const match = heirs.find(h => key(h.name) === n)

  // 写す値（入っているものだけ）
  const rel = (relationship ?? '').trim() || null
  const a1 = (extra.address ?? '').trim() || null
  const a2 = (extra.address2 ?? '').trim() || null

  if (match) {
    const patch: Record<string, unknown> = {}
    if (!match.is_client) patch.is_client = true
    if (rel && rel !== match.relationship_type) { patch.relationship_type = rel; patch.relationship = rel }
    if (a1 && a1 !== match.address) patch.address = a1
    if (a2 && a2 !== match.address2) patch.address2 = a2
    if (Object.keys(patch).length === 0) return
    const { error: e } = await supabase.from('heirs').update(patch).eq('id', match.id)
    if (e) throw new Error(`相続人一覧への反映に失敗しました: ${e.message}`)
    return
  }
  const { error: e } = await supabase.from('heirs').insert({
    case_id: caseId, name: (name ?? '').trim(), is_client: true, sort_order: heirs.length,
    ...(rel ? { relationship_type: rel, relationship: rel } : {}),
    ...(a1 ? { address: a1 } : {}),
    ...(a2 ? { address2: a2 } : {}),
  })
  if (e) throw new Error(`依頼者を相続人一覧に足せませんでした: ${e.message}`)
}

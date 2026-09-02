import { createClient } from '@/lib/supabase/client'

// 「被相続人との関係戸籍 取得完了」にチェックが入ったことを、案件の管理担当へ届ける。
//
// これが立つと名寄せ請求・金融の資料請求・凍結依頼へ進める（＝案件が次の段に上がる）。
// チェックを入れるのは戸籍を読んだ事務なので、そのままだと管理担当が気づけない。
// 外したときは通知しない（取り消しは進行を止めるだけで、誰かの手が空くわけではないため）。

export async function notifyKosekiRelationDone(caseId: string, targetPerson: string): Promise<void> {
  const supabase = createClient()
  const [{ data: c }, { data: cms }] = await Promise.all([
    supabase.from('cases').select('case_number, deal_name').eq('id', caseId).maybeSingle(),
    supabase.from('case_members').select('member_id').eq('case_id', caseId).in('role', ['manager', 'sub_manager']),
  ])
  const ids = [...new Set(((cms ?? []) as Array<{ member_id: string | null }>).map(m => m.member_id).filter((v): v is string => !!v))]
  if (ids.length === 0) return
  const cc = c as { case_number: string | null; deal_name: string | null } | null
  const label = `${cc?.case_number ?? ''} ${cc?.deal_name ?? ''}`.trim()
  const who = targetPerson.trim() || '対象者未設定'
  await supabase.from('notifications').insert(ids.map(member_id => ({
    member_id,
    type: 'koseki_relation_done',
    case_id: caseId,
    title: `関係戸籍が揃いました：${who}`,
    body: `${label}：${who}の「被相続人との関係戸籍 取得完了」にチェックが入りました。名寄せ請求・金融機関への資料請求へ進められます。`,
  })))
}

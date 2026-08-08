import { createClient } from '@/lib/supabase/client'

// 管理担当が割り振られたら、受注担当に「割振り完了」を知らせる。
//
// 受注担当は割振り依頼（AssignRequestModal）を出したあと、割り振られたかどうかを
// 案件を開いて確かめるしかなかった。依頼→完了 が片道になっていたので、折り返しを通知にする。
//
// 割り振りは複数の入口（割り振り画面・担当者タブ・案件基本情報）から行われるため、
// どこから割り振っても同じ通知が出るよう1か所にまとめている。
export async function notifyManagerAssigned(caseId: string, managerMemberId: string): Promise<void> {
  const supabase = createClient()
  const [caseRes, memberRes, mgrRes] = await Promise.all([
    supabase.from('cases').select('case_number, deal_name').eq('id', caseId).single(),
    supabase.from('case_members').select('member_id, role').eq('case_id', caseId),
    supabase.from('members').select('name').eq('id', managerMemberId).single(),
  ])
  const c = caseRes.data as { case_number: string; deal_name: string } | null
  const members = (memberRes.data ?? []) as Array<{ member_id: string; role: string }>
  const mgrName = (mgrRes.data as { name: string } | null)?.name ?? '管理担当'

  // 宛先＝受注担当。割り振られた本人が受注担当を兼ねている場合は送らない（自分の操作なので）。
  const salesIds = [...new Set(
    members.filter(m => m.role === 'sales').map(m => m.member_id).filter(id => id && id !== managerMemberId),
  )]
  if (salesIds.length === 0) return

  const label = c ? `${c.case_number} ${c.deal_name}` : 'この案件'
  await supabase.from('notifications').insert(
    salesIds.map(id => ({
      member_id: id,
      type: 'manager_assigned',
      case_id: caseId,
      title: '管理担当の割振りが完了しました',
      body: `${label}：管理担当は ${mgrName} さんです`,
    })),
  )
}

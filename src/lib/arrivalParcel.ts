import { createClient } from '@/lib/supabase/client'

// 受注/管理宛の郵送物一式を「到着連絡」したとき（新規作成モーダルで一式登録＆保存した瞬間）：
// ・受信簿レコードに arrival_notified_at を刻む
// ・受注担当＋管理担当へ通知（到着物あり）。※タスクは作らない。要確認バナー(computeParcelArrivalAlerts)で拾う。
// 通知の重複は arrival_notified_at 済みならスキップ。
export async function notifyParcelArrival(receiptId: string): Promise<void> {
  const supabase = createClient()
  const { data: r } = await supabase
    .from('document_receipts')
    .select('id, case_id, arrival_notified_at, cases(case_number, deal_name)')
    .eq('id', receiptId)
    .single()
  if (!r) return
  if ((r as { arrival_notified_at?: string | null }).arrival_notified_at) return  // 既に到着連絡済み

  await supabase.from('document_receipts').update({ arrival_notified_at: new Date().toISOString() }).eq('id', receiptId)

  const caseId = (r as { case_id: string }).case_id
  const cx = (r as { cases?: { case_number?: string; deal_name?: string } | null }).cases
  const label = `${cx?.case_number ?? ''} ${cx?.deal_name ?? ''}`.trim()

  // 受注担当＋管理担当へ通知（クリックで到着受信簿の該当レコードへ）
  const { data: cm } = await supabase.from('case_members').select('member_id, role').eq('case_id', caseId).in('role', ['sales', 'manager'])
  const ids = [...new Set(((cm ?? []) as { member_id: string | null }[]).map(m => m.member_id).filter((v): v is string => !!v))]
  if (ids.length === 0) return

  await supabase.from('notifications').insert(ids.map(member_id => ({
    member_id, type: 'arrival_notice', case_id: caseId,
    title: '到着物あり',
    body: `${label}：受注/管理宛の郵送物が届きました。開封して到着受信簿で中身を再登録・紐付けしてください。`,
  })))
}

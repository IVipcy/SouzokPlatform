import { createClient } from '@/lib/supabase/client'

// 受注/管理宛の郵送物一式を「到着連絡」したとき：
// ・受信簿レコードに arrival_notified_at を刻む
// ・受注担当＋管理担当に共有の「郵送物の開封・中身の紐付け」タスクを1件生成（system＝軽い型・実施結果ゲートなし）
//   source_rid=receipt:{id} を持たせ、タスクを開くと到着受信簿の該当レコードへ直行できるようにする（taskLanding）
// ・両者へ通知（アラート「到着物あり」＋タスク通知）
// 重複生成は ext_data.receipt_id + doc='parcel_open' で防止。
export async function notifyParcelArrival(receiptId: string): Promise<void> {
  const supabase = createClient()
  const { data: r } = await supabase
    .from('document_receipts')
    .select('id, case_id, arrival_notified_at, cases(case_number, deal_name)')
    .eq('id', receiptId)
    .single()
  if (!r) return

  await supabase.from('document_receipts').update({ arrival_notified_at: new Date().toISOString() }).eq('id', receiptId)

  const caseId = (r as { case_id: string }).case_id
  const cx = (r as { cases?: { case_number?: string; deal_name?: string } | null }).cases
  const label = `${cx?.case_number ?? ''} ${cx?.deal_name ?? ''}`.trim()

  // 開封タスク（重複防止）
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('case_id', caseId)
    .contains('ext_data', { receipt_id: receiptId, doc: 'parcel_open' })
    .limit(1)

  let taskId: string | null = existing && existing.length > 0 ? (existing[0] as { id: string }).id : null
  if (!taskId) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: nt, error } = await supabase
      .from('tasks')
      .insert({
        case_id: caseId,
        title: '郵送物の開封・中身の紐付け',
        task_kind: 'system',       // 受注/管理担当タスク（軽い型）
        phase: '受注',
        category: '受領',
        status: '未着手',
        priority: '急ぎ',
        assign_role: 'both',
        due_date: today,
        source_rid: `receipt:${receiptId}`,   // 開くと到着受信簿の該当レコードへ
        ext_data: { receipt_id: receiptId, doc: 'parcel_open' },
        sort_order: 1,
      })
      .select('id')
      .single()
    if (error || !nt) { console.error('notifyParcelArrival task insert failed', error); return }
    taskId = (nt as { id: string }).id
  }

  // 受注担当＋管理担当に共有アサイン＋通知
  const { data: cm } = await supabase.from('case_members').select('member_id, role').eq('case_id', caseId).in('role', ['sales', 'manager'])
  const ids = [...new Set(((cm ?? []) as { member_id: string | null }[]).map(m => m.member_id).filter((v): v is string => !!v))]
  if (ids.length === 0) return

  // 既存アサインは無視（23505）。まとめて挿入。
  await supabase.from('task_assignees').insert(ids.map(member_id => ({ task_id: taskId, member_id, role: 'primary' })))
  await supabase.from('notifications').insert(ids.map(member_id => ({
    member_id, type: 'arrival_notice', case_id: caseId,
    title: '到着物あり',
    body: `${label}：受注/管理宛の郵送物が届きました。開封して中身を到着受信簿に紐付けてください。`,
  })))
}

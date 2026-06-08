import type { createClient } from '@/lib/supabase/client'

/**
 * 案件1件分の関連レコードをカスケード削除する（CaseListClient の単件削除と同じ手順）。
 * タスク担当 → タスク → 案件担当 → 書類 → イベント → 入金 → 請求書 → 案件 の順で削除。
 * 取り消せない破壊的操作。呼び出し側で確認モーダルを挟むこと。
 */
export async function cascadeDeleteCase(supabase: ReturnType<typeof createClient>, caseId: string) {
  const { data: tasks } = await supabase.from('tasks').select('id').eq('case_id', caseId)
  for (const t of tasks ?? []) {
    await supabase.from('task_assignees').delete().eq('task_id', t.id)
  }
  await supabase.from('tasks').delete().eq('case_id', caseId)
  await supabase.from('case_members').delete().eq('case_id', caseId)
  await supabase.from('documents').delete().eq('case_id', caseId)
  await supabase.from('events').delete().eq('case_id', caseId)
  const { data: invoices } = await supabase.from('invoices').select('id').eq('case_id', caseId)
  for (const inv of invoices ?? []) {
    await supabase.from('payments').delete().eq('invoice_id', inv.id)
  }
  await supabase.from('invoices').delete().eq('case_id', caseId)
  const { error } = await supabase.from('cases').delete().eq('id', caseId)
  if (error) throw new Error(error.message)
}

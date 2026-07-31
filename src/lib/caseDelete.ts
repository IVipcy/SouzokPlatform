import type { createClient } from '@/lib/supabase/client'

type SB = ReturnType<typeof createClient>

/**
 * 案件1件分の関連レコードをすべてカスケード削除する。取り消せない破壊的操作。呼び出し側で確認モーダルを挟むこと。
 *
 * cases を参照している子テーブルが1つでも残っていると 最後の DELETE cases が外部キー違反で失敗して
 * 「削除したのに残る」状態になるため、case_id を持つ子テーブルを網羅的に削除する。
 * 子の子（task_assignees→tasks、payments→invoices、document_receipt_items→document_receipts、
 * real_estate_acquisitions→real_estate_properties 等）は 依存順に先に消す。
 */
export async function cascadeDeleteCase(supabase: SB, caseId: string) {
  const ids = async (table: string, col: string, val: string): Promise<string[]> => {
    const { data } = await supabase.from(table).select('id').eq(col, val)
    return (data ?? []).map((r: { id: string }) => r.id)
  }
  // 子テーブルの削除は「テーブル/列が無い」等のエラーは握りつぶして続行（環境差 migration 未適用対策）。
  // 本当に消えなかった参照は 最後の cases 削除の外部キー違反で顕在化する。
  const del = async (table: string, col: string, val: string) => {
    try { await supabase.from(table).delete().eq(col, val) } catch { /* ignore */ }
  }
  const delIn = async (table: string, col: string, vals: string[]) => {
    if (vals.length === 0) return
    try { await supabase.from(table).delete().in(col, vals) } catch { /* ignore */ }
  }

  // 1) タスク配下（task_id 参照）
  const taskIds = await ids('tasks', 'case_id', caseId)
  await delIn('task_assignees', 'task_id', taskIds)
  await delIn('document_receipt_item_tasks', 'task_id', taskIds)
  await del('task_reviews', 'case_id', caseId)
  await del('task_dependencies', 'case_id', caseId)

  // 2) 受信簿配下（document_receipt_items → document_receipts）
  const receiptIds = await ids('document_receipts', 'case_id', caseId)
  for (const rid of receiptIds) {
    const itemIds = await ids('document_receipt_items', 'receipt_id', rid)
    await delIn('document_receipt_item_tasks', 'receipt_item_id', itemIds)
  }
  await delIn('document_receipt_items', 'receipt_id', receiptIds)
  await del('document_receipts', 'case_id', caseId)

  // 3) 請求配下（payments → invoices）
  const invoiceIds = await ids('invoices', 'case_id', caseId)
  await delIn('payments', 'invoice_id', invoiceIds)
  await del('payment_check_requests', 'case_id', caseId)
  await del('invoices', 'case_id', caseId)

  // 4) タスク本体（documents が task_id を参照するため documents を先に消す）
  await del('documents', 'case_id', caseId)
  await del('tasks', 'case_id', caseId)

  // 5) 不動産（real_estate_acquisitions → real_estate_properties）
  await del('real_estate_acquisitions', 'case_id', caseId)
  await del('real_estate_properties', 'case_id', caseId)

  // 6) その他 case_id 直参照の子テーブル（順不同）
  const CASE_CHILD_TABLES = [
    'case_members', 'events', 'heirs', 'financial_assets',
    'contract_documents', 'division_details', 'agreement_dispatches',
    'progress_reports', 'case_reports', 'case_complaints', 'case_referrals',
    'case_clients', 'koseki_requests', 'client_communications', 'case_activities',
    'notifications', 'asset_inventory', 'reward_breakdowns', 'sagyo_documents', 'expenses',
  ]
  for (const t of CASE_CHILD_TABLES) await del(t, 'case_id', caseId)

  // 7) 本体
  const { error } = await supabase.from('cases').delete().eq('id', caseId)
  if (error) throw new Error(error.message)
}

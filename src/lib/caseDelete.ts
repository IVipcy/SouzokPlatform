import type { createClient } from '@/lib/supabase/client'

type SB = ReturnType<typeof createClient>

// case_id を持つ子テーブル。削除する順に並べる（子の子 → 子）。
// 多くは ON DELETE CASCADE だが、1つでも CASCADE でない参照が残ると
// 最後の DELETE cases が外部キー違反で失敗し「削除したのに残る」状態になる。
// テーブルを足したらここにも足すこと（未適用マイグレのテーブルはエラーを無視して素通りする）。
const CASE_CHILD_TABLES = [
  // 実務・書類
  'task_reviews', 'task_dependencies', 'documents', 'tasks',
  'securities_holdings', 'real_estate_acquisitions', 'real_estate_properties', 'financial_assets',
  'asset_inventory', 'case_other_assets', 'koseki_images', 'koseki_requests',
  'heirs', 'division_details', 'agreement_dispatches', 'contract_documents', 'sagyo_documents',
  'document_dispatches', 'case_files', 'meeting_memos', 'progress_summaries',
  // 請求・精算
  'payment_check_requests', 'invoices', 'billing_expense_items', 'reward_items', 'reward_breakdowns',
  'settlement_income_items', 'settlement_expense_items', 'instruction_items', 'expenses',
  // 案件まわり
  'case_members', 'case_clients', 'case_referrals', 'case_complaints', 'case_reports',
  'progress_reports', 'client_communications', 'case_activities', 'confirm_events',
  'notifications', 'events',
]

/**
 * 案件1件分の関連レコードをすべて削除する。取り消せない破壊的操作。呼び出し側で確認モーダルを挟むこと。
 *
 * 添付ファイル（戸籍画像・面談メモ・案件フォルダ）はストレージからも消す。
 * 行だけ消すとファイルが残り続けて容量を食うため。
 *
 * 子テーブルの削除で失敗しても止めずに続け、最後の cases 削除が失敗したときに
 * 「どのテーブルで詰まったか」を添えて投げる。黙って消えないのが一番たちが悪いので、
 * 原因が分かる形でエラーにする。
 */
export async function cascadeDeleteCase(supabase: SB, caseId: string) {
  const failures: string[] = []

  const ids = async (table: string, col: string, val: string): Promise<string[]> => {
    const { data } = await supabase.from(table).select('id').eq(col, val)
    return (data ?? []).map((r: { id: string }) => r.id)
  }
  const del = async (table: string, col: string, val: string) => {
    try {
      const { error } = await supabase.from(table).delete().eq(col, val)
      // テーブル自体が無い（マイグレ未適用）は無視。それ以外は原因として控えておく。
      if (error && error.code !== '42P01' && !/does not exist/i.test(error.message)) failures.push(`${table}: ${error.message}`)
    } catch { /* ignore */ }
  }
  const delIn = async (table: string, col: string, vals: string[]) => {
    if (vals.length === 0) return
    try {
      const { error } = await supabase.from(table).delete().in(col, vals)
      if (error && error.code !== '42P01' && !/does not exist/i.test(error.message)) failures.push(`${table}: ${error.message}`)
    } catch { /* ignore */ }
  }

  // 0) 添付ファイルの実体をストレージから削除（行はこのあと消える）
  await removeCaseStorage(supabase, caseId)

  // 1) 子の子（親を消す前に外す）
  const taskIds = await ids('tasks', 'case_id', caseId)
  await delIn('task_assignees', 'task_id', taskIds)
  await delIn('document_receipt_item_tasks', 'task_id', taskIds)

  const receiptIds = await ids('document_receipts', 'case_id', caseId)
  for (const rid of receiptIds) {
    const itemIds = await ids('document_receipt_items', 'receipt_id', rid)
    await delIn('document_receipt_item_tasks', 'receipt_item_id', itemIds)
  }
  await delIn('document_receipt_items', 'receipt_id', receiptIds)
  await del('document_receipts', 'case_id', caseId)

  const invoiceIds = await ids('invoices', 'case_id', caseId)
  await delIn('payments', 'invoice_id', invoiceIds)

  // 2) case_id を持つ子テーブル
  for (const t of CASE_CHILD_TABLES) await del(t, 'case_id', caseId)

  // 3) 本体
  const { error } = await supabase.from('cases').delete().eq('id', caseId)
  if (error) {
    const hint = failures.length > 0 ? `\n（先に失敗した削除：${failures.join(' / ')}）` : ''
    throw new Error(`${error.message}${hint}`)
  }
}

/** 案件に紐づくアップロード済みファイルをストレージから消す（失敗しても削除は続行する） */
async function removeCaseStorage(supabase: SB, caseId: string) {
  const sources: { table: string; pathCol: string; bucketCol: string; fallbackBucket: string }[] = [
    { table: 'koseki_images', pathCol: 'image_path', bucketCol: 'image_bucket', fallbackBucket: 'koseki-images' },
    { table: 'meeting_memos', pathCol: 'image_path', bucketCol: 'image_bucket', fallbackBucket: 'meeting-memos' },
    { table: 'case_files', pathCol: 'file_path', bucketCol: 'file_bucket', fallbackBucket: 'documents' },
  ]
  for (const s of sources) {
    try {
      const { data } = await supabase.from(s.table).select(`${s.pathCol}, ${s.bucketCol}`).eq('case_id', caseId)
      const rows = (data ?? []) as unknown as Array<Record<string, string | null>>
      const byBucket = new Map<string, string[]>()
      for (const r of rows) {
        const path = r[s.pathCol]
        if (!path) continue
        const bucket = r[s.bucketCol] || s.fallbackBucket
        ;(byBucket.get(bucket) ?? byBucket.set(bucket, []).get(bucket)!).push(path)
      }
      for (const [bucket, paths] of byBucket) await supabase.storage.from(bucket).remove(paths)
    } catch { /* ストレージの掃除は失敗しても案件削除は続ける */ }
  }
}

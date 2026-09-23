import type { createClient } from '@/lib/supabase/client'
import { assertCanDeleteCase } from '@/lib/caseDeletePermission'

type SB = ReturnType<typeof createClient>

// case_id を持つ子テーブル。削除する順に並べる（子の子 → 子 → 親）。
// 多くは ON DELETE CASCADE だが、events（003）は CASCADE が無く、confirm_events／visit_reservations_done は
// SET NULL で行が残る。1つでも CASCADE でない参照が残ると最後の DELETE cases が外部キー違反で失敗し
// 「削除したのに残る」状態になるため、ここで明示的に消す。
// 一覧は supabase/migrations の「case_id … REFERENCES cases(id)」を洗い直したもの（2026-09-23）。
// テーブルを足したらここにも足すこと（未適用マイグレのテーブルは「表が無い」だけ素通りする）。
const CASE_CHILD_TABLES = [
  // 実務・書類（他の子表を参照するものを先に）
  'task_reviews', 'task_dependencies', 'documents', 'case_documents', 'sagyo_documents', 'case_reports', 'tasks',
  'koseki_images', 'koseki_requests', 'koseki_plans',
  'real_estate_acquisitions', 'touki_requests', 'real_estate_properties',
  // 金融（明細 → 請求 → 口座/銘柄 → 調査先。ほふり結果は調査先を参照）
  'financial_request_items', 'financial_requests', 'financial_jasdec_results',
  'securities_holdings', 'financial_assets', 'financial_institutions',
  'asset_inventory', 'case_other_assets', 'case_asset_estimates',
  'agreement_dispatches', 'division_details', 'contract_documents', 'request_enclosures', 'original_doc_overrides',
  'heirs', 'case_files', 'meeting_memos', 'progress_summaries',
  // 請求・精算
  'payment_check_requests', 'invoices', 'billing_expense_items', 'reward_items',
  'settlement_income_items', 'settlement_expense_items', 'instruction_items', 'expenses',
  // 案件まわり
  'case_members', 'case_clients', 'case_referrals', 'case_complaints',
  'progress_reports', 'client_communications', 'case_activities', 'confirm_events',
  'notifications', 'events', 'visit_reservations_done',
]

/** 「テーブル自体が無い」（マイグレ未適用）だけを無視する。列違い（42703）などは failures に残す */
function isMissingTable(error: { code?: string; message: string }): boolean {
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message)
}

/**
 * 案件1件分の関連レコードをすべて削除する。取り消せない破壊的操作。呼び出し側で確認モーダルを挟むこと。
 *
 * 添付ファイル（戸籍画像・面談メモ・案件フォルダ・生成書類・受領ファイル・契約書類）はストレージからも消す。
 * 行だけ消すとファイルが残り続けて容量を食うため。
 *
 * 子テーブルの削除で失敗しても止めずに続け、最後の cases 削除が失敗したときに
 * 「どのテーブルで詰まったか」を添えて投げる。黙って消えないのが一番たちが悪いので、
 * 原因が分かる形でエラーにする。
 */
export async function cascadeDeleteCase(supabase: SB, caseId: string) {
  // 最初に権限を確かめる。子テーブルを消した後で本体だけポリシーに拒否されると
  // 「関連だけ消えて案件が残る」最悪の形になるので、ストレージにも触る前に止める。
  await assertCanDeleteCase(supabase, caseId)

  const failures: string[] = []

  const ids = async (table: string, col: string, val: string): Promise<string[]> => {
    const { data } = await supabase.from(table).select('id').eq(col, val)
    return (data ?? []).map((r: { id: string }) => r.id)
  }
  const del = async (table: string, col: string, val: string) => {
    try {
      const { error } = await supabase.from(table).delete().eq(col, val)
      if (error && !isMissingTable(error)) failures.push(`${table}: ${error.message}`)
    } catch (e) {
      failures.push(`${table}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const delIn = async (table: string, col: string, vals: string[]) => {
    if (vals.length === 0) return
    try {
      const { error } = await supabase.from(table).delete().in(col, vals)
      if (error && !isMissingTable(error)) failures.push(`${table}: ${error.message}`)
    } catch (e) {
      failures.push(`${table}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 0) 添付ファイルの実体をストレージから削除（行はこのあと消える）
  await removeCaseStorage(supabase, caseId)

  // 1) 子の子（親を消す前に外す）
  const taskIds = await ids('tasks', 'case_id', caseId)
  await delIn('task_assignees', 'task_id', taskIds)
  await delIn('task_comments', 'task_id', taskIds)
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

  // 金融の請求明細×口座／×銘柄（case_id を持たない。明細IDで消す）
  const finItemIds = await ids('financial_request_items', 'case_id', caseId)
  await delIn('financial_request_item_accounts', 'item_id', finItemIds)
  await delIn('financial_request_item_holdings', 'item_id', finItemIds)

  // 2) case_id を持つ子テーブル
  for (const t of CASE_CHILD_TABLES) await del(t, 'case_id', caseId)

  // 関連案件は向きが無いので、相手側から結ばれている行も消す
  await del('case_relations', 'case_id', caseId)
  await del('case_relations', 'related_case_id', caseId)

  // 3) 本体
  const { error } = await supabase.from('cases').delete().eq('id', caseId)
  if (error) {
    const hint = failures.length > 0 ? `\n（先に失敗した削除：${failures.join(' / ')}）` : ''
    throw new Error(`${error.message}${hint}`)
  }
  // 本体は消えたが子表で失敗があった＝列名違いなど。CASCADE で消えていれば実害は無いが、黙らせない
  if (failures.length > 0) console.warn('[caseDelete] 子テーブルの削除で失敗あり:', failures.join(' / '))
}

/** 案件に紐づくアップロード済みファイルをストレージから消す（失敗しても削除は続行する） */
async function removeCaseStorage(supabase: SB, caseId: string) {
  // bucketCol が無い表（documents）は fallbackBucket に決め打ち。
  // case_documents は自社控え（outbound）と受領ファイル（received）の2組を持つので2行に分ける。
  // received の古い行はバケット列が空で dispatch-documents に入っている（migration 031）。
  const sources: { table: string; pathCol: string; bucketCol: string | null; fallbackBucket: string }[] = [
    { table: 'koseki_images', pathCol: 'image_path', bucketCol: 'image_bucket', fallbackBucket: 'koseki-images' },
    { table: 'meeting_memos', pathCol: 'image_path', bucketCol: 'image_bucket', fallbackBucket: 'meeting-memos' },
    { table: 'case_files', pathCol: 'file_path', bucketCol: 'file_bucket', fallbackBucket: 'documents' },
    { table: 'documents', pathCol: 'file_path', bucketCol: null, fallbackBucket: 'documents' },
    { table: 'case_documents', pathCol: 'outbound_file_path', bucketCol: 'outbound_file_bucket', fallbackBucket: 'documents' },
    { table: 'case_documents', pathCol: 'received_file_path', bucketCol: 'received_file_bucket', fallbackBucket: 'dispatch-documents' },
    { table: 'contract_documents', pathCol: 'file_path', bucketCol: 'file_bucket', fallbackBucket: 'documents' },
    // 生成済みの公式請求書Excel（migration 113）。documents バケット固定
    { table: 'invoices', pathCol: 'generated_file_path', bucketCol: null, fallbackBucket: 'documents' },
  ]
  for (const s of sources) {
    try {
      const cols = s.bucketCol ? `${s.pathCol}, ${s.bucketCol}` : s.pathCol
      const { data } = await supabase.from(s.table).select(cols).eq('case_id', caseId)
      const rows = (data ?? []) as unknown as Array<Record<string, string | null>>
      const byBucket = new Map<string, string[]>()
      for (const r of rows) {
        const path = r[s.pathCol]
        if (!path) continue
        const bucket = (s.bucketCol ? r[s.bucketCol] : null) || s.fallbackBucket
        ;(byBucket.get(bucket) ?? byBucket.set(bucket, []).get(bucket)!).push(path)
      }
      for (const [bucket, paths] of byBucket) await supabase.storage.from(bucket).remove(paths)
    } catch { /* ストレージの掃除は失敗しても案件削除は続ける */ }
  }
}

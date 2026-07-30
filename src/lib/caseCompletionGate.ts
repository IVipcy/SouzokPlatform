// 案件を「完了」ステータスに変更する前に、請求パターンに応じた入金完了条件を満たしているかチェックする。
// 満たしていなければ拒否して、不足している請求（＋未処理の返金）を表示する。
//
// 請求パターン別の完了条件（cases.billing_pattern）:
//   ①段階請求 (staged)     : 前受金＋確定請求＋立替実費（発生分）すべて入金済
//   ②一括+実費 (lump_expense) : 前受金＋立替実費（発生分）すべて入金済
//   ③一括のみ (lump_only)  : 前受金のみ入金済（実費・確定は発生させない前提）
//
// 返金の扱い：invoice.status='入金済' でも、未実行の返金依頼(payment_check_requests kind='refund' status!='完了')
// があれば「返金処理中」として完了不可。承認フロー中(pending_sales/pending_leader/approved) はすべて対象。

import type { SupabaseClient } from '@supabase/supabase-js'

export type CompletableCheckInvoice = {
  id: string
  invoice_type: string
  status: string
  amount: number | null
  firm_type: string | null
  issued_date: string | null
  due_date: string | null
}

export type CompletableCheckResult =
  | { ok: true }
  | { ok: false; missing: MissingInvoice[]; pendingRefunds: PendingRefund[]; billingPattern: string; hasInvoices: boolean }

export type MissingInvoice = {
  id: string
  typeLabel: string
  firmLabel: string
  amount: number
  issued_date: string | null
  due_date: string | null
  status: string
}

export type PendingRefund = {
  id: string
  refund_amount: number | null
  reason_category: string | null
  approval_status: string | null   // pending_sales / pending_leader / approved / rejected / null(旧仕様)
  status: string                   // 依頼中 / 完了
  requested_date: string
}

const REFUND_STAGE_LABEL: Record<string, string> = {
  pending_sales: '受注担当の承認待ち',
  pending_leader: '上長の承認待ち',
  approved: '承認済（経理の返金実行待ち）',
}
export function refundStageLabel(approvalStatus: string | null | undefined, status: string): string {
  if (approvalStatus && REFUND_STAGE_LABEL[approvalStatus]) return REFUND_STAGE_LABEL[approvalStatus]
  if (status !== '完了') return '返金処理中'
  return ''
}

const REQUIRED_BY_PATTERN: Record<string, string[]> = {
  lump_only:    ['前受金'],
  lump_expense: ['前受金', '立替実費'],
  staged:       ['前受金', '確定請求', '立替実費'],
}

const firmLabel = (f: string | null | undefined) => f === 'shiho' ? '司法' : f === 'gyosei' ? '行政' : ''

/**
 * 案件の invoices を取得し、請求パターンに応じて完了条件を判定する。
 * ok=false のとき、未完了の請求リストを返す（画面でリスト表示）。
 * @param supabase Supabase クライアント（呼出側で作る）
 * @param caseId 対象案件ID
 * @param billingPattern cases.billing_pattern。未設定/未知値は staged 扱い。
 */
export async function checkCaseCompletable(
  supabase: SupabaseClient,
  caseId: string,
  billingPattern: string | null | undefined,
): Promise<CompletableCheckResult> {
  const pattern = billingPattern ?? 'staged'
  const required = REQUIRED_BY_PATTERN[pattern] ?? REQUIRED_BY_PATTERN.staged

  // 請求 + 未処理の返金依頼を同時に取得
  const [invRes, refundRes] = await Promise.all([
    supabase.from('invoices').select('id, invoice_type, status, amount, firm_type, issued_date, due_date').eq('case_id', caseId),
    supabase.from('payment_check_requests').select('id, refund_amount, reason_category, approval_status, status, requested_date').eq('case_id', caseId).eq('kind', 'refund').neq('status', '完了'),
  ])
  if (invRes.error) {
    // 取得失敗時は「ゲート通過」させず、UIで案内する意図で ok=false + hasInvoices=false を返す
    return { ok: false, missing: [], pendingRefunds: [], billingPattern: pattern, hasInvoices: false }
  }
  const invoices = (invRes.data ?? []) as CompletableCheckInvoice[]
  const pendingRefunds = ((refundRes?.data ?? []) as PendingRefund[])

  // 必要な請求種別ごとにチェック：立替実費は「発生していれば必須」・前受金/確定請求は「未発生なら未完了扱い（=完了できない）」。
  // ただし ③lump_only は前受金のみ、②lump_expense は実費が「発生していれば」必要（発生していない場合はスキップ）。
  const missing: MissingInvoice[] = []
  for (const type of required) {
    const list = invoices.filter(i => i.invoice_type === type)
    if (list.length === 0) {
      // 立替実費が0件は「発生なし」扱い（②③の実費・すべての立替実費）。
      // 前受金/確定請求が0件の場合は「未発生」＝完了不可（請求書がまだ立っていない）。
      if (type === '立替実費') continue
      missing.push({ id: `__missing__${type}`, typeLabel: `${type}（未発行）`, firmLabel: '', amount: 0, issued_date: null, due_date: null, status: '未発行' })
      continue
    }
    for (const inv of list) {
      if (inv.status === '入金済' || inv.status === 'キャンセル') continue
      missing.push({
        id: inv.id,
        typeLabel: type,
        firmLabel: firmLabel(inv.firm_type),
        amount: inv.amount ?? 0,
        issued_date: inv.issued_date,
        due_date: inv.due_date,
        status: inv.status,
      })
    }
  }

  if (missing.length === 0 && pendingRefunds.length === 0) return { ok: true }
  return { ok: false, missing, pendingRefunds, billingPattern: pattern, hasInvoices: invoices.length > 0 }
}

export function billingPatternLabel(pattern: string | null | undefined): string {
  if (pattern === 'lump_only') return '③一括のみ（前受金のみ）'
  if (pattern === 'lump_expense') return '②一括+実費'
  return '①段階請求'
}

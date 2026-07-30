// 案件を「業務完了」ステータスに移す(業務完了申請)前のゲート判定。
// 会計上、請求書発行=売掛計上=請求完了として扱うため、判定基準は「発行済(issued_date あり)」。
// 入金追跡は 請求/入金 一覧側・経理タブで並行して継続する。
//
// 請求パターン別の完了条件（cases.billing_pattern）:
//   ①段階請求 (staged)     : 前受金＋確定請求＋立替実費（発生分）すべて 発行済
//   ②一括+実費 (lump_expense) : 前受金＋立替実費（発生分）すべて 発行済
//   ③一括のみ (lump_only)  : 前受金のみ 発行済（実費・確定は発生させない前提）
//
// 追加ゲート:
//   ・他事業者紹介(case_referrals) 全 partner で billing_status ≠ '未請求' であること
//
// 返金の扱い：未実行の返金依頼(payment_check_requests kind='refund' status!='完了')
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
  | { ok: false; missing: MissingInvoice[]; pendingRefunds: PendingRefund[]; missingReferrals: MissingReferral[]; billingPattern: string; hasInvoices: boolean }

export type MissingInvoice = {
  id: string
  typeLabel: string
  firmLabel: string
  amount: number
  issued_date: string | null
  due_date: string | null
  status: string
}

// 他事業者紹介の請求未完了（billing_status = '未請求'）
export type MissingReferral = {
  id: string
  partnerType: string    // 税理士 / 不動産 等
  content: string | null
  billingStatus: string  // '未請求'
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

  // 請求 + 未処理の返金依頼 + 他事業者紹介 を同時に取得
  const [invRes, refundRes, refRes] = await Promise.all([
    supabase.from('invoices').select('id, invoice_type, status, amount, firm_type, issued_date, due_date').eq('case_id', caseId),
    supabase.from('payment_check_requests').select('id, refund_amount, reason_category, approval_status, status, requested_date').eq('case_id', caseId).eq('kind', 'refund').neq('status', '完了'),
    supabase.from('case_referrals').select('id, partner_type, content, billing_status').eq('case_id', caseId),
  ])
  if (invRes.error) {
    // 取得失敗時は「ゲート通過」させず、UIで案内する意図で ok=false + hasInvoices=false を返す
    return { ok: false, missing: [], pendingRefunds: [], missingReferrals: [], billingPattern: pattern, hasInvoices: false }
  }
  const invoices = (invRes.data ?? []) as CompletableCheckInvoice[]
  const pendingRefunds = ((refundRes?.data ?? []) as PendingRefund[])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referrals = ((refRes?.data ?? []) as Array<{ id: string; partner_type: string; content: string | null; billing_status: string | null }>)

  // 必要な請求種別ごとにチェック：立替実費は「発生していれば必須」・前受金/確定請求は「未発生なら未完了扱い」。
  // 発行済(issued_date あり)なら会計上「請求完了」= ゲート通過。未発行(issued_date IS NULL) は未完了扱い。
  // 入金追跡は 請求/入金 一覧側・経理タブで並行し、ここでは判定に使わない。
  const missing: MissingInvoice[] = []
  for (const type of required) {
    const list = invoices.filter(i => i.invoice_type === type)
    if (list.length === 0) {
      if (type === '立替実費') continue
      missing.push({ id: `__missing__${type}`, typeLabel: `${type}（未発行）`, firmLabel: '', amount: 0, issued_date: null, due_date: null, status: '未発行' })
      continue
    }
    for (const inv of list) {
      if (inv.status === 'キャンセル') continue
      // 発行済(issued_date あり)なら ゲート通過。未発行のみ missing に積む。
      if (inv.issued_date) continue
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

  // 他事業者紹介の請求未完了
  const missingReferrals: MissingReferral[] = referrals
    .filter(r => (r.billing_status ?? '未請求') === '未請求')
    .map(r => ({ id: r.id, partnerType: r.partner_type, content: r.content, billingStatus: r.billing_status ?? '未請求' }))

  if (missing.length === 0 && pendingRefunds.length === 0 && missingReferrals.length === 0) return { ok: true }
  return { ok: false, missing, pendingRefunds, missingReferrals, billingPattern: pattern, hasInvoices: invoices.length > 0 }
}

export function billingPatternLabel(pattern: string | null | undefined): string {
  if (pattern === 'lump_only') return '③一括のみ（前受金のみ）'
  if (pattern === 'lump_expense') return '②一括+実費'
  return '①段階請求'
}

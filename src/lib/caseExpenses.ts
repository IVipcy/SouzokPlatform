// 経費（お客様に請求しない自社負担）の取得。
//
// いまの発生源は、戸籍請求・不動産の資料請求で請求区分を「誤請求」にした行。
// 間違えて取ってしまった費用は立替実費に入れられない（お客様に請求できない）ので、
// 自社の経費として案件別に集計する。
//
// 発生源を増やすときはここに足す。画面（案件詳細の請求タブ／経費表）はこの結果を並べるだけ。

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMistakenRequest, MISTAKEN_REQUEST } from '@/lib/constants'

export type CaseExpenseRow = {
  id: string
  caseId: string
  /** 発生源の区分ラベル（今は「誤請求」のみ） */
  kind: string
  /** 何にかかった費用か */
  label: string
  /** 発生日（請求日。無ければ null） */
  date: string | null
  amount: number
}

type KosekiLike = {
  id: string; case_id: string; request_kind: string | null; acquirer: string | null
  target_person: string | null; request_to: string | null; request_date: string | null
  cost_budget: number | null; cost_refund: number | null; cost_confirmed: number | null
}
type AcqLike = {
  id: string; case_id: string; request_kind: string | null
  item_type: string | null; target_municipality: string | null; request_to: string | null
  request_date: string | null; cost_confirmed: number | null; cost_budget: number | null; cost_refund: number | null
}

/** 費用の確定額。予算−返金が入っていればそれを優先し、無ければ確定費用をそのまま使う */
const confirmedOf = (budget: number | null, refund: number | null, confirmed: number | null) =>
  (budget != null || refund != null) ? (budget ?? 0) - (refund ?? 0) : (confirmed ?? 0)

export async function fetchCaseExpenses(
  supabase: SupabaseClient,
  caseIds: string[],
): Promise<CaseExpenseRow[]> {
  if (caseIds.length === 0) return []
  const [kosRes, acqRes] = await Promise.all([
    supabase.from('koseki_requests')
      .select('id, case_id, request_kind, acquirer, target_person, request_to, request_date, cost_budget, cost_refund, cost_confirmed')
      .in('case_id', caseIds),
    supabase.from('real_estate_acquisitions')
      .select('id, case_id, request_kind, item_type, target_municipality, request_to, request_date, cost_confirmed, cost_budget, cost_refund')
      .in('case_id', caseIds),
  ])

  const out: CaseExpenseRow[] = []
  for (const k of (kosRes.data ?? []) as KosekiLike[]) {
    if (!isMistakenRequest(k.request_kind)) continue
    if (k.acquirer === '依頼者') continue  // 依頼者が取ったものは自社の費用ではない
    const amount = confirmedOf(k.cost_budget, k.cost_refund, k.cost_confirmed)
    if (amount <= 0) continue
    out.push({
      id: `koseki:${k.id}`, caseId: k.case_id, kind: MISTAKEN_REQUEST,
      label: `戸籍等取得（${k.target_person || '対象者未設定'}／${k.request_to || '請求先未設定'}）`,
      date: k.request_date, amount,
    })
  }
  for (const a of (acqRes.data ?? []) as AcqLike[]) {
    if (!isMistakenRequest(a.request_kind)) continue
    const amount = confirmedOf(a.cost_budget, a.cost_refund, a.cost_confirmed)
    if (amount <= 0) continue
    out.push({
      id: `re_acq:${a.id}`, caseId: a.case_id, kind: MISTAKEN_REQUEST,
      label: `不動産資料（${a.item_type || '取得資料'}／${a.target_municipality || a.request_to || '請求先未設定'}）`,
      date: a.request_date, amount,
    })
  }
  // 発生日の新しい順（日付なしは後ろ）
  return out.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
}

// 要注意/要確認バナー用の「案件状態アラート」（レコード無しの計算アラート）。
// タスク超過・請求超過（レコード由来）に対し、これは案件フィールドから計算する第3のソース。
// いまは「管理担当 未アサイン（受注〜作業着手準備・2営業日超過）」。今後の案件状態アラートもここに足す。

import { bizDaysOverdue, type OverdueSeverity } from '@/lib/overdue'
import { PROGRESS_REPORT_STATE_URGENT } from '@/lib/constants'

export type CaseStateAlert = {
  caseId: string
  caseNumber: string
  dealName: string
  category: string
  severity: OverdueSeverity   // 'chui'=要注意(赤) / 'kakunin'=要確認(黄)
}

const PREP_STATUSES = new Set(['受注', '戻り受注', '作業着手準備'])

export function computeCaseStateAlerts(
  cases: Array<{ id: string; case_number: string; deal_name: string; status: string; order_received_date: string | null; managerExists: boolean }>,
  todayStr: string,
): CaseStateAlert[] {
  const out: CaseStateAlert[] = []
  for (const c of cases) {
    // 管理担当 未アサイン：受注〜作業着手準備 かつ 管理担当未設定 かつ 受注から2営業日超過 → 要注意(赤)。
    if (PREP_STATUSES.has(c.status) && !c.managerExists && c.order_received_date && bizDaysOverdue(c.order_received_date, todayStr) >= 2) {
      out.push({ caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name, category: '管理担当 未アサイン', severity: 'chui' })
    }
  }
  return out
}

// 案件報告(progress_check)で 状態='至急！！' かつ 未確認(status='依頼中') の案件を 要注意(赤) として返す。
// 受注担当がマイページ/チームの要注意バナーで拾えるようにする。確認済(status≠依頼中)になれば消える。
export function computeUrgentReportAlerts(
  reports: Array<{ case_id: string; kind?: string | null; report_state?: string | null; status: string }>,
  caseMetaById: Map<string, { case_number: string; deal_name: string }>,
): CaseStateAlert[] {
  const out: CaseStateAlert[] = []
  const seen = new Set<string>()
  for (const r of reports) {
    if ((r.kind ?? 'progress_check') !== 'progress_check') continue
    if (r.report_state !== PROGRESS_REPORT_STATE_URGENT) continue
    if (r.status !== '依頼中') continue
    if (seen.has(r.case_id)) continue
    const meta = caseMetaById.get(r.case_id)
    if (!meta) continue
    seen.add(r.case_id)
    out.push({ caseId: r.case_id, caseNumber: meta.case_number, dealName: meta.deal_name, category: '案件報告：至急', severity: 'chui' })
  }
  return out
}

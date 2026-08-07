// 要注意/要確認バナー用のアラート。
// 判定そのものは src/lib/alertRules.ts に集約してあり、ここはその結果を
// バナー用の形（要注意=chui / 要確認=kakunin）に並べ替えるだけ。
// info（青）はバナーには出さない。

import { bizDaysOverdue, type OverdueSeverity } from '@/lib/overdue'
import { evaluateCaseAlerts, bannerOf, ALERT_DAYS, type CaseAlertInput, type CaseAlertContext } from '@/lib/alertRules'
import { PROGRESS_REPORT_STATE_URGENT } from '@/lib/constants'

export type CaseStateAlert = {
  caseId: string
  caseNumber: string
  dealName: string
  category: string
  severity: OverdueSeverity   // 'chui'=要注意(赤) / 'kakunin'=要確認(黄)
  href?: string               // 指定時はこの遷移先へ（未指定は案件詳細）
  /** 起点日（受注日・到着連絡日 など）。'YYYY-MM-DD' */
  since?: string | null
  /** 起点日からの経過営業日 */
  days?: number
  /** 出た条件の説明（画面にそのまま出す） */
  reason?: string
}

export type BannerCase = CaseAlertInput & {
  case_number: string
  deal_name: string
} & CaseAlertContext

export function computeCaseStateAlerts(cases: BannerCase[], todayStr: string): CaseStateAlert[] {
  const out: CaseStateAlert[] = []
  for (const c of cases) {
    for (const h of evaluateCaseAlerts(c, c, todayStr)) {
      const sev = bannerOf(h.severity)
      if (!sev) continue
      out.push({
        caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name,
        category: h.category, severity: sev,
        since: h.since, days: h.days, reason: h.reason,
        href: h.href ?? (h.tab ? `/cases/${c.id}?tab=${h.tab}` : undefined),
      })
    }
  }
  return out
}

// 受注/管理宛の郵送物一式（未開封）が到着連絡済み → 要確認(黄)。開封（中身を再登録・紐付け）で消える。
// クリックで到着受信簿の該当レコードへ直行。
export function computeParcelArrivalAlerts(
  parcels: Array<{ id: string; case_id: string; case_number: string; deal_name: string; notified_at?: string | null }>,
  todayStr?: string,
): CaseStateAlert[] {
  return parcels.map(p => {
    const since = p.notified_at ? p.notified_at.slice(0, 10) : null
    const days = since && todayStr ? bizDaysOverdue(since, todayStr) : undefined
    return {
      caseId: p.case_id, caseNumber: p.case_number, dealName: p.deal_name,
      category: '到着物あり（未開封）', severity: 'kakunin' as OverdueSeverity,
      href: `/documents?receipt=${p.id}`,
      since, days,
      reason: '受注/管理宛の郵送物が届いた連絡がありますが、まだ開封（中身の登録）がされていません',
    }
  })
}

// 案件報告(progress_check)のうち未確認(status='依頼中')のものを拾う。
//   状態='至急！！'          … その場で 要注意(赤)
//   それ以外で3営業日 未回答 … 要確認(黄)
// 「至急」以外の報告も放置されると管理担当が次に進めないので、日数で拾えるようにした。
// 確認済(status≠依頼中)になれば消える。
export function computeUrgentReportAlerts(
  reports: Array<{ id?: string; case_id: string; kind?: string | null; report_state?: string | null; status: string; created_at?: string | null }>,
  caseMetaById: Map<string, { case_number: string; deal_name: string }>,
  todayStr?: string,
): CaseStateAlert[] {
  const out: CaseStateAlert[] = []
  const seen = new Set<string>()
  // 至急を先に見る（同じ案件で至急と通常が混在したとき、重い方を残す）
  const sorted = [...reports].sort((a, b) =>
    (b.report_state === PROGRESS_REPORT_STATE_URGENT ? 1 : 0) - (a.report_state === PROGRESS_REPORT_STATE_URGENT ? 1 : 0))
  for (const r of sorted) {
    if ((r.kind ?? 'progress_check') !== 'progress_check') continue
    if (r.status !== '依頼中') continue
    if (seen.has(r.case_id)) continue
    const meta = caseMetaById.get(r.case_id)
    if (!meta) continue
    const since = r.created_at ? r.created_at.slice(0, 10) : null
    const days = since && todayStr ? bizDaysOverdue(since, todayStr) : undefined
    const urgent = r.report_state === PROGRESS_REPORT_STATE_URGENT
    // 至急でない報告は、3営業日たっても回答が無いときだけ出す
    if (!urgent && (days == null || days < ALERT_DAYS.reportAnswer)) continue
    seen.add(r.case_id)
    out.push({
      caseId: r.case_id, caseNumber: meta.case_number, dealName: meta.deal_name,
      category: urgent ? '案件報告：至急' : '案件報告 未回答', severity: urgent ? 'chui' : 'kakunin',
      since, days,
      reason: urgent
        ? '管理担当から「至急！！」の案件報告が届いていますが、まだ確認されていません'
        : `案件報告が届いてから${ALERT_DAYS.reportAnswer}営業日以上、確認・回答がされていません`,
      // 案件詳細の報告欄へ直行する。確認ボタンはそこにあり、報告した本人以外なら誰でも押せる。
      href: `/cases/${r.case_id}?tab=progress&sub=report${r.id ? `&openReport=${r.id}` : ''}`,
    })
  }
  return out
}

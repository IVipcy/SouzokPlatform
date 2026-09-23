// 要注意/要確認バナー用のアラート。
// 判定そのものは src/lib/alertRules.ts に集約してあり、ここはその結果を
// バナー用の形（要注意=chui / 要確認=kakunin）に並べ替えるだけ。
// info（青）はバナーには出さない。

import { bizDaysOverdue, type OverdueSeverity } from '@/lib/overdue'
import { evaluateCaseAlerts, bannerOf, hourensouOverdueReason, type CaseAlertInput, type CaseAlertContext } from '@/lib/alertRules'
import { isUrgentReportState } from '@/lib/constants'
import { REPORT_KAKUNIN_BIZ_DAYS, REPORT_CHUI_BIZ_DAYS, caseReportSeverity } from '@/lib/caseReports'

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

// ========== 案件報告（progress_reports。管理担当 → 受注担当の 報告→確認）==========
//
// 段階（2026-09-23 決定）：
//   届いた直後            … 青（ベルだけ。受注担当本人に）
//   1営業日 未確認        … 黄＝要確認。本人＋同じチーム全員のバナーとベルに出す（放置をチームで拾う）
//   3営業日 未確認        … 赤＝要注意（同上）
//   状態が「要至急対応」  … 即赤
// 起点は依頼日（requested_date。無い古い行は created_at）。しきい値は報連相（要対応）と同じ 1／3 営業日。
// 種類は4つ（案件報告・業務完了申請・案件再オープン・納品確認申請）とも同じ扱い。どれも受注担当の確認待ちで止まる。

export const PROGRESS_REPORT_KIND_LABEL: Record<string, string> = {
  progress_check: '案件報告', work_complete: '業務完了申請', case_reopen: '案件再オープン', delivery_confirm: '納品確認申請',
}

export type ProgressReportLike = {
  id?: string
  case_id: string
  kind?: string | null
  report_state?: string | null
  status: string
  requested_date?: string | null
  created_at?: string | null
}

export type ProgressReportLevel = { level: 'info' | 'mid' | 'high'; urgent: boolean; since: string | null; days: number | null; label: string }

/** 未確認の案件報告の段階。確認済（status≠依頼中）は null */
export function progressReportLevel(r: ProgressReportLike, todayStr: string): ProgressReportLevel | null {
  if (r.status !== '依頼中') return null
  const since = ((r.requested_date ?? r.created_at ?? '') as string).slice(0, 10) || null
  const days = since ? bizDaysOverdue(since, todayStr) : null
  const urgent = isUrgentReportState(r.report_state)
  const level: ProgressReportLevel['level'] =
    urgent ? 'high'
    : days != null && days >= REPORT_CHUI_BIZ_DAYS ? 'high'
    : days != null && days >= REPORT_KAKUNIN_BIZ_DAYS ? 'mid'
    : 'info'
  return { level, urgent, since, days, label: PROGRESS_REPORT_KIND_LABEL[r.kind ?? 'progress_check'] ?? '案件報告' }
}

export function progressReportCategory(l: ProgressReportLevel): string {
  return l.urgent ? `${l.label}：至急` : l.level === 'info' ? l.label : `${l.label} 未回答`
}
export function progressReportReason(l: ProgressReportLevel): string {
  if (l.urgent) return `管理担当から「要至急対応」の${l.label}が届いていますが、まだ確認されていません`
  if (l.level === 'info') return `${l.label}が届いています`
  return `${l.label}が届いてから${l.days}営業日たっていますが、確認・回答がされていません`
}
export const progressReportHref = (r: ProgressReportLike) =>
  `/cases/${r.case_id}?tab=progress&sub=report${r.id ? `&openReport=${r.id}` : ''}`

/**
 * バナー用：未確認の案件報告（黄・赤だけ。青はベルだけ）。同じ案件に複数あれば一番重い1件。
 * 確認ボタンは案件詳細の報告欄にあり、報告した本人以外なら誰でも押せる（チームの人が代わりに確認できる）。
 */
export function computeUrgentReportAlerts(
  reports: ProgressReportLike[],
  caseMetaById: Map<string, { case_number: string; deal_name: string }>,
  todayStr?: string,
): CaseStateAlert[] {
  if (!todayStr) return []
  const best = new Map<string, { r: ProgressReportLike; l: ProgressReportLevel }>()
  const rank = (l: ProgressReportLevel) => (l.urgent ? 3 : l.level === 'high' ? 2 : l.level === 'mid' ? 1 : 0)
  for (const r of reports) {
    const l = progressReportLevel(r, todayStr)
    if (!l || l.level === 'info') continue
    if (!caseMetaById.has(r.case_id)) continue
    const cur = best.get(r.case_id)
    if (!cur || rank(l) > rank(cur.l) || (rank(l) === rank(cur.l) && (l.days ?? 0) > (cur.l.days ?? 0))) best.set(r.case_id, { r, l })
  }
  return [...best.values()].map(({ r, l }) => {
    const meta = caseMetaById.get(r.case_id)!
    return {
      caseId: r.case_id, caseNumber: meta.case_number, dealName: meta.deal_name,
      category: progressReportCategory(l), severity: l.level === 'high' ? 'chui' : 'kakunin',
      since: l.since, days: l.days ?? undefined, reason: progressReportReason(l),
      href: progressReportHref(r),
    }
  })
}

// ========== 報連相（case_reports の要対応）をチームの案件まで広げる ==========
// 自分が担当の案件ぶんは alertRules（report_action_overdue）で出る。ここは「自分が担当ではない同じチームの案件」用。
export function computeTeamHourensouAlerts(
  rows: Array<{ case_id: string; kind: string; status: string; requested_date: string | null }>,
  caseMetaById: Map<string, { case_number: string; deal_name: string }>,
  todayStr: string,
): CaseStateAlert[] {
  const byCase = new Map<string, { sev: OverdueSeverity; n: number; since: string | null }>()
  for (const r of rows) {
    const sev = caseReportSeverity(r, todayStr)
    if (!sev || !caseMetaById.has(r.case_id)) continue
    const cur = byCase.get(r.case_id)
    const since = r.requested_date ? r.requested_date.slice(0, 10) : null
    if (!cur) byCase.set(r.case_id, { sev, n: 1, since })
    else {
      cur.n += 1
      if (sev === 'chui') cur.sev = 'chui'
      if (since && (!cur.since || since < cur.since)) cur.since = since
    }
  }
  return [...byCase.entries()].map(([caseId, v]) => {
    const meta = caseMetaById.get(caseId)!
    return {
      caseId, caseNumber: meta.case_number, dealName: meta.deal_name,
      category: '報連相 未回答', severity: v.sev,
      since: v.since, days: v.since ? bizDaysOverdue(v.since, todayStr) : undefined,
      reason: hourensouOverdueReason(v.sev === 'chui' ? 'high' : 'mid', v.n),
      href: `/cases/${caseId}?tab=progress`,
    }
  })
}

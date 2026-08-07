// 要注意/要確認バナー用の「案件状態アラート」（レコード無しの計算アラート）。
// タスク超過・請求超過（レコード由来）に対し、これは案件フィールドから計算する第3のソース。
//
// どのアラートも「いつを起点に、何営業日経ったから出たのか」を持たせる。
// バナーを見た人が、条件を覚えていなくても対応の緊急度を判断できるようにするため。
// 営業日＝日曜と祝日を除く日（土曜は営業日）。

import { bizDaysOverdue, fromOrderSeverity, type OverdueSeverity } from '@/lib/overdue'
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

const PREP_STATUSES = new Set(['受注', '戻り受注', '作業着手準備'])

export function computeCaseStateAlerts(
  cases: Array<{
    id: string; case_number: string; deal_name: string; status: string
    order_received_date: string | null
    managerExists: boolean
    managerAssignSkipped?: boolean | null
    order_sheet_completed_at?: string | null
    advanceInvoiceExists?: boolean
  }>,
  todayStr: string,
): CaseStateAlert[] {
  const out: CaseStateAlert[] = []
  for (const c of cases) {
    if (!PREP_STATUSES.has(c.status) || !c.order_received_date) continue
    const days = bizDaysOverdue(c.order_received_date, todayStr)

    // 管理担当 未アサイン：受注から2営業日超過 → 要注意(赤)。「割り振らない」と決めた案件は対象外。
    if (!c.managerExists && !c.managerAssignSkipped && days >= 2) {
      out.push({
        caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name,
        category: '管理担当 未アサイン', severity: 'chui',
        since: c.order_received_date, days,
        reason: '受注から2営業日を過ぎても管理担当が決まっていません',
      })
    }

    // オーダーシート未完成：受注から3営業日=要確認／5営業日=要注意。
    // オーダーシートが固まらないと実務タブが解禁されず、着手そのものが止まるため。
    if (!c.order_sheet_completed_at) {
      const sev = fromOrderSeverity(c.order_received_date, todayStr)
      if (sev) {
        out.push({
          caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name,
          category: 'オーダーシート未完成', severity: sev,
          since: c.order_received_date, days,
          reason: sev === 'chui' ? '受注から5営業日を過ぎてもオーダーシートが完成していません' : '受注から3営業日を過ぎてもオーダーシートが完成していません',
          href: `/cases/${c.id}?tab=orderSheet`,
        })
      }
    }

    // 前受金 未請求：受注から5営業日を過ぎても前受金の請求書が作られていない → 要注意(赤)。
    // これまで案件詳細のバッジとアラートセンターにしか出ておらず、バナーでは拾えていなかった。
    if (c.advanceInvoiceExists === false && days >= 5) {
      out.push({
        caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name,
        category: '前受金 未請求', severity: 'chui',
        since: c.order_received_date, days,
        reason: '受注から5営業日を過ぎても前受金の請求書が作られていません',
        href: `/cases/${c.id}?tab=contract`,
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
export const REPORT_NO_ANSWER_BIZ_DAYS = 3
export function computeUrgentReportAlerts(
  reports: Array<{ case_id: string; kind?: string | null; report_state?: string | null; status: string; created_at?: string | null }>,
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
    if (!urgent && (days == null || days < REPORT_NO_ANSWER_BIZ_DAYS)) continue
    seen.add(r.case_id)
    out.push({
      caseId: r.case_id, caseNumber: meta.case_number, dealName: meta.deal_name,
      category: urgent ? '案件報告：至急' : '案件報告 未回答', severity: urgent ? 'chui' : 'kakunin',
      since, days,
      reason: urgent
        ? '管理担当から「至急！！」の案件報告が届いていますが、まだ確認されていません'
        : `案件報告が届いてから${REPORT_NO_ANSWER_BIZ_DAYS}営業日以上、確認・回答がされていません`,
      href: '/my?tab=progress',
    })
  }
  return out
}

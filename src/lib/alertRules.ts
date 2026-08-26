// アラートの定義（唯一の場所）。
//
// これまで「要確認/要注意バナー」「案件詳細のチップ（案件色）」「アラートセンター（ベル）」で
// 同じアラートを別々に判定していたため、同じ名前なのに画面によって出たり出なかったりしていた。
// 判定はこのファイルだけに置き、3つの画面はここが返した結果を並べ替えて表示するだけにする。
//
// 表示場所は深刻度で決まる（アラートの種類ごとに決めない）：
//   claim(紫)/high(赤) … 要注意バナー
//   mid(黄)            … 要確認バナー
//   info(青)           … バナーには出さない（ベルだけ）
//   すべて             … ベル（自分が担当している分）
//   案件の色           … その案件に出ているアラートの最大深刻度
//
// 営業日＝日曜と祝日を除く日（土曜は営業日）。

import { bizDaysOverdue } from '@/lib/overdue'
import { REPORT_KAKUNIN_BIZ_DAYS, REPORT_CHUI_BIZ_DAYS } from '@/lib/caseReports'

export type AlertSeverity = 'claim' | 'high' | 'mid' | 'info'
export const ALERT_SEVERITY_ORDER: Record<AlertSeverity, number> = { claim: 0, high: 1, mid: 2, info: 3 }

/** 誰に向けたアラートか。ベルの出し分けに使う（バナー・案件色は担当を問わず出す） */
export type AlertAudience = 'sales' | 'manager' | 'both'

export type CaseAlertHit = {
  key: string
  category: string
  severity: AlertSeverity
  audience: AlertAudience
  /** 起点日（受注日・面談日など）。'YYYY-MM-DD' */
  since?: string | null
  /** 起点日からの経過営業日 */
  days?: number
  /** なぜ出たのか。画面にそのまま出す */
  reason: string
  /** 案件詳細のどのタブへ飛ばすか */
  tab?: string
  /** 案件詳細以外へ飛ばすとき */
  href?: string
}

// === しきい値（営業日）。変えるときはここだけ ===
export const ALERT_DAYS = {
  managerUnassign: 2,     // 受注→管理担当アサイン
  orderSheetMid: 3,       // 受注→オーダーシート完成（要確認）
  orderSheetHigh: 5,      // 受注→オーダーシート完成（要注意）
  advanceInvoice: 5,      // 受注→前受金の請求書作成
  advanceSend: 3,         // 請求書作成→郵送して入金待ちにする
  tasksGenerate: 2,       // 作業進行中→事務管理タスク生成
  contractDocs: 5,        // 受注→契約関連書類の回収
  reportAnswer: 3,        // 案件報告→受注担当の確認
  parcelOpen: 1,          // 到着連絡→開封
  inactivityMid: 5,       // 最終接触→未対応（要確認）
  inactivityHigh: 10,     // 最終接触→未対応（要注意）
  billBase: 5,            // 入金期日超過→督促の起点（ここから暦日で数える）
  taskMid: 5,             // タスク期日超過（要確認）
  prepayThanksMid: 1,     // 前受金入金御礼連絡（要確認）
  prepayThanksHigh: 2,    // 前受金入金御礼連絡（要注意）
} as const
/** 暦日で見るもの（営業日ではない） */
export const ALERT_CAL_DAYS = {
  billKakunin: 3,         // 入金：起点から要確認まで
  billChui: 10,           // 入金：起点から要注意まで
  taskHigh: 14,
} as const

const PREP = new Set(['受注', '戻り受注', '作業着手準備'])
const ACTIVE = new Set(['受注', '戻り受注', '作業着手準備', '対応中'])
const PENDING_ANSWER = new Set(['面談設定済', '検討中', '検討中（契約書待ち）'])

export type CaseAlertInput = {
  id: string
  status: string
  has_complaint?: boolean | null
  order_received_date?: string | null
  order_sheet_completed_at?: string | null
  expected_completion_date?: string | null
  meeting_date?: string | null
  meeting_executed_date?: string | null
  client_response_due_date?: string | null
  last_opened_at?: string | null
  created_at?: string | null
  management_started_at?: string | null
  manager_assign_skipped?: boolean | null
}

// 判定材料が無い項目は undefined にする（false と undefined は意味が違う）。
// undefined ＝ そのアラートは判定しない。
export type CaseAlertContext = {
  managerExists?: boolean
  /** 前受金請求書のステータス。null=請求書が無い / undefined=判定しない */
  advanceInvoiceStatus?: string | null
  /** 前受金請求書を作った日 */
  advanceInvoiceCreatedAt?: string | null
  hasCaseTasks?: boolean
  contractPending?: boolean
  recentWeeklyConfirmed?: boolean
  responseCheckDone?: boolean
  /** タスク期日超過の最大深刻度（consumer 側で判定して渡す） */
  taskOverdue?: AlertSeverity | null
  /** 上が「超急ぎタスク」由来か（期日前でも赤にしている。理由文を分けるために持つ） */
  taskOverdueUrgent?: boolean
  /** 入金期日超過の最大深刻度 */
  billOverdue?: AlertSeverity | null
  /** 前受金の入金御礼連絡が未完了のまま何日たったか（1営業日=mid / 2営業日=high） */
  prepayThanksOverdue?: AlertSeverity | null
  /** 報連相（要対応）が未回答のまま放置されている最大深刻度。情報共有は数えない */
  reportActionOverdue?: AlertSeverity | null
  /** 上の件数（理由文に出す） */
  reportActionCount?: number
}

const dayOf = (v: string | null | undefined) => (v ? v.slice(0, 10) : null)

/**
 * その案件に出ているアラートを全部返す。深刻度の重い順。
 * 3つの画面（バナー／案件チップ／ベル）はすべてこの結果を使う。
 */
export function evaluateCaseAlerts(c: CaseAlertInput, ctx: CaseAlertContext, todayStr: string): CaseAlertHit[] {
  const out: CaseAlertHit[] = []
  const prep = PREP.has(c.status)
  const active = ACTIVE.has(c.status)
  const pending = PENDING_ANSWER.has(c.status)
  const orderDay = dayOf(c.order_received_date)
  const orderDays = orderDay ? bizDaysOverdue(orderDay, todayStr) : null

  if (c.has_complaint && active) {
    out.push({ key: 'claim', category: 'クレーム', severity: 'claim', audience: 'both',
      reason: '依頼者からのクレームがあります。最優先で対応してください', tab: 'complaints' })
  }

  if (ctx.taskOverdue) {
    out.push({ key: 'task_overdue', category: 'タスク期限超過', severity: ctx.taskOverdue, audience: 'both',
      reason: ctx.taskOverdueUrgent
        ? '「超急ぎ」の未完了タスクがあります'
        : ctx.taskOverdue === 'high'
          ? `期日から${ALERT_CAL_DAYS.taskHigh}日以上たった未完了タスクがあります`
          : `期日を${ALERT_DAYS.taskMid}営業日過ぎた未完了タスクがあります`, tab: 'tasks' })
  }

  // 前受金の入金御礼連絡。入金を確認した日が期限で、そこから1営業日で要確認・2営業日で要注意。
  // 「お礼の電話が遅れる」のは目に見えて印象が悪いので、他のタスクより早く鳴らす。
  if (ctx.prepayThanksOverdue) {
    out.push({ key: 'prepay_thanks', category: '入金御礼 未連絡', severity: ctx.prepayThanksOverdue, audience: 'both',
      reason: ctx.prepayThanksOverdue === 'high'
        ? `前受金の入金御礼連絡が${ALERT_DAYS.prepayThanksHigh}営業日たっても終わっていません`
        : `前受金の入金御礼連絡が${ALERT_DAYS.prepayThanksMid}営業日たっても終わっていません`,
      tab: 'tasks' })
  }

  // 報連相（要対応）の放置。情報共有はここに来ない（アラートに出さない）。
  if (ctx.reportActionOverdue) {
    const n = ctx.reportActionCount ?? 1
    out.push({ key: 'report_action_overdue', category: '報連相 未回答', severity: ctx.reportActionOverdue, audience: 'both',
      reason: ctx.reportActionOverdue === 'high'
        ? `要対応の報連相が${REPORT_CHUI_BIZ_DAYS}営業日以上そのままです（${n}件）`
        : `要対応の報連相が${REPORT_KAKUNIN_BIZ_DAYS}営業日そのままです（${n}件）`,
      tab: 'progress' })
  }

  if (ctx.billOverdue) {
    out.push({ key: 'bill_overdue', category: '入金期日 超過', severity: ctx.billOverdue, audience: 'sales',
      reason: ctx.billOverdue === 'high'
        ? `入金期日から${ALERT_DAYS.billBase}営業日＋${ALERT_CAL_DAYS.billChui}日たった未入金の請求があります`
        : `入金期日から${ALERT_DAYS.billBase}営業日＋${ALERT_CAL_DAYS.billKakunin}日たった未入金の請求があります`, href: '/my?tab=billing' })
  }

  if (prep && orderDay && orderDays != null) {
    if (ctx.managerExists === false && !c.manager_assign_skipped && orderDays >= ALERT_DAYS.managerUnassign) {
      out.push({ key: 'manager_unassigned', category: '管理担当 未割振', severity: 'high', audience: 'sales',
        since: orderDay, days: orderDays,
        reason: `受注から${ALERT_DAYS.managerUnassign}営業日を過ぎても管理担当が決まっていません`, tab: 'assignees' })
    }
    if (!c.order_sheet_completed_at && orderDays >= ALERT_DAYS.orderSheetMid) {
      const high = orderDays >= ALERT_DAYS.orderSheetHigh
      out.push({ key: 'ordersheet_incomplete', category: 'オーダーシート 未完成', severity: high ? 'high' : 'mid', audience: 'sales',
        since: orderDay, days: orderDays,
        reason: `受注から${high ? ALERT_DAYS.orderSheetHigh : ALERT_DAYS.orderSheetMid}営業日を過ぎてもオーダーシートが完成していません`, tab: 'orderSheet' })
    }
    if (ctx.advanceInvoiceStatus === null && orderDays >= ALERT_DAYS.advanceInvoice) {
      out.push({ key: 'advance_uninvoiced', category: '前受金 未請求', severity: 'high', audience: 'manager',
        since: orderDay, days: orderDays,
        reason: `受注から${ALERT_DAYS.advanceInvoice}営業日を過ぎても前受金の請求書が作られていません`, tab: 'contract' })
    }
  }

  // 前受金の請求書を作ったまま郵送していない（入金待ちにしていない）
  if (ctx.advanceInvoiceStatus === '作成済') {
    const since = dayOf(ctx.advanceInvoiceCreatedAt)
    const days = since ? bizDaysOverdue(since, todayStr) : null
    if (days == null || days >= ALERT_DAYS.advanceSend) {
      out.push({ key: 'advance_unsent', category: '前受金 入金待ち', severity: 'mid', audience: 'manager',
        since, days: days ?? undefined,
        reason: `前受金の請求書を作ってから${ALERT_DAYS.advanceSend}営業日を過ぎています。郵送して入金待ちにしてください`, href: '/billing' })
    }
  }

  // 作業進行中なのに事務管理タスクが1件も無い
  if (c.status === '対応中' && ctx.hasCaseTasks === false) {
    const since = dayOf(c.management_started_at)
    const days = since ? bizDaysOverdue(since, todayStr) : null
    if (days == null || days >= ALERT_DAYS.tasksGenerate) {
      out.push({ key: 'tasks_not_generated', category: 'タスク未生成', severity: 'mid', audience: 'manager',
        since, days: days ?? undefined,
        reason: '事務管理タスクが生成されていません。事務にタスク生成を依頼してください', tab: 'tasks' })
    }
  }

  // 契約関連書類が未回収
  if ((prep || c.status === '検討中（契約書待ち）') && ctx.contractPending) {
    const since = orderDay ?? dayOf(c.created_at)
    const days = since ? bizDaysOverdue(since, todayStr) : null
    if (days == null || days >= ALERT_DAYS.contractDocs) {
      out.push({ key: 'contract_pending', category: '契約手続き 未了', severity: 'mid', audience: 'both',
        since, days: days ?? undefined,
        reason: `契約関連書類が${ALERT_DAYS.contractDocs}営業日を過ぎても回収できていません`, tab: 'contractProc' })
    }
  }

  if (c.expected_completion_date && c.expected_completion_date < todayStr && c.status !== '完了' && c.status !== '失注') {
    out.push({ key: 'completion_overdue', category: '完了予定日 超過', severity: 'high', audience: 'manager',
      since: c.expected_completion_date, days: bizDaysOverdue(c.expected_completion_date, todayStr),
      reason: `完了予定日 ${c.expected_completion_date} を過ぎています`, tab: 'tasks' })
  }

  // 週次報告の漏れ。作業進行中に入って1週間たってからカウントする。
  if (c.status === '対応中' && ctx.recentWeeklyConfirmed === false) {
    const started = dayOf(c.management_started_at)
    const eligible = !started || bizDaysOverdue(started, todayStr) >= 5
    if (eligible) {
      out.push({ key: 'weekly_report_missing', category: '週次報告の漏れ', severity: 'mid', audience: 'manager',
        reason: '直近7日に確認済の案件報告がありません', href: '/my?tab=progress' })
    }
  }

  if (pending && c.meeting_date && c.meeting_date < todayStr && !c.meeting_executed_date) {
    out.push({ key: 'meeting_memo_missing', category: '面談メモ未記載', severity: 'mid', audience: 'sales',
      since: c.meeting_date, days: bizDaysOverdue(c.meeting_date, todayStr),
      reason: '面談予定日を過ぎていますが、面談の実施内容が入力されていません', tab: 'basicInfo' })
  }

  if (pending && c.client_response_due_date && ctx.responseCheckDone !== true) {
    const horizon = new Date(todayStr + 'T00:00:00'); horizon.setDate(horizon.getDate() + 2)
    const horizonStr = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`
    if (c.client_response_due_date <= horizonStr) {
      const over = c.client_response_due_date < todayStr
      out.push({ key: 'response_due', category: over ? '回答予定日 超過' : '回答予定日 間近', severity: 'mid', audience: 'sales',
        since: c.client_response_due_date,
        reason: `お客様の回答予定日 ${c.client_response_due_date}${over ? ' を過ぎています' : ' が近づいています'}`, tab: 'clientInfo' })
    }
  }

  // 未対応日数（最後にこの案件を開いた日から）
  if (active) {
    const ref = dayOf(c.last_opened_at) ?? dayOf(c.created_at)
    if (ref) {
      const d = bizDaysOverdue(ref, todayStr)
      if (d >= ALERT_DAYS.inactivityHigh) {
        out.push({ key: 'inactivity', category: `未対応 ${ALERT_DAYS.inactivityHigh}営業日超`, severity: 'high', audience: 'both',
          since: ref, days: d, reason: `${ALERT_DAYS.inactivityHigh}営業日この案件が開かれていません` })
      } else if (d >= ALERT_DAYS.inactivityMid) {
        out.push({ key: 'inactivity', category: `未対応 ${ALERT_DAYS.inactivityMid}営業日超`, severity: 'mid', audience: 'both',
          since: ref, days: d, reason: `${ALERT_DAYS.inactivityMid}営業日この案件が開かれていません` })
      }
    }
  }

  return out.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
}

/** アラート群 → 案件色。紫 > 要注意 > 要確認 > 青。案件色は「一番重いアラートの色」でしかない。 */
export type CaseColorFlag = 'purple' | 'red' | 'yellow' | 'blue'
export function caseColorOf(hits: Array<{ severity: AlertSeverity }>): CaseColorFlag {
  if (hits.some(h => h.severity === 'claim')) return 'purple'
  if (hits.some(h => h.severity === 'high')) return 'red'
  if (hits.some(h => h.severity === 'mid')) return 'yellow'
  return 'blue'
}

// 案件色の見た目。要注意・要確認はバナーとまったく同じ色にして、
// 「この色の案件＝このバナーに入っている案件」と目で追えるようにする。
export const CASE_FLAG_LABEL: Record<CaseColorFlag, string> = {
  purple: 'クレーム',
  red:    '要注意',
  yellow: '要確認',
  blue:   'なし',
}
export const CASE_FLAG_BG: Record<CaseColorFlag, string> = {
  purple: 'bg-purple-600 text-white',
  red:    'bg-[#DC2626] text-white',
  yellow: 'bg-[#EAB308] text-[#3B2A05]',
  blue:   'bg-sky-100 text-sky-700',
}
/** 数字だけ出すところ（KPIカード・チーム表）の文字色 */
export const CASE_FLAG_TEXT: Record<CaseColorFlag, string> = {
  purple: 'text-purple-600',
  red:    'text-[#DC2626]',
  yellow: 'text-[#B98410]',
  blue:   'text-sky-600',
}

/** 深刻度 → バナーの区分。info はバナーに出さない。 */
export function bannerOf(severity: AlertSeverity): 'chui' | 'kakunin' | null {
  if (severity === 'claim' || severity === 'high') return 'chui'
  if (severity === 'mid') return 'kakunin'
  return null
}

// === 画面に出す「アラート定義」の一覧 ===
// バナー横の「アラート定義」ポップアップがこれを描く。しきい値は上の ALERT_DAYS を参照するので、
// 条件を変えれば画面の説明も自動で追従する（資料と画面がずれない）。
export const ALERT_CATALOG: Array<{
  group: string
  items: Array<{ label: string; severity: AlertSeverity; when: string }>
}> = [
  {
    group: '期日の超過',
    items: [
      { label: '入金期日 超過', severity: 'mid', when: `期日から${ALERT_DAYS.billBase}営業日＋${ALERT_CAL_DAYS.billKakunin}日／さらに${ALERT_CAL_DAYS.billChui}日で赤（＋の日数は暦日）` },
      { label: 'タスク期限超過', severity: 'mid', when: `期日を${ALERT_DAYS.taskMid}営業日／${ALERT_CAL_DAYS.taskHigh}日で赤` },
      { label: '至急タスク', severity: 'high', when: '優先度が超急ぎで未完了' },
      { label: '完了予定日 超過', severity: 'high', when: '完了予定日を過ぎた' },
    ],
  },
  {
    group: '受注してから止まっている',
    items: [
      { label: '管理担当 未アサイン', severity: 'high', when: `受注から${ALERT_DAYS.managerUnassign}営業日` },
      { label: 'オーダーシート未完成', severity: 'mid', when: `受注から${ALERT_DAYS.orderSheetMid}営業日／${ALERT_DAYS.orderSheetHigh}営業日で赤` },
      { label: '前受金 未請求', severity: 'high', when: `受注から${ALERT_DAYS.advanceInvoice}営業日` },
      { label: '前受金 郵送・入金待ち', severity: 'mid', when: `請求書を作ってから${ALERT_DAYS.advanceSend}営業日` },
      { label: '契約手続き 未了', severity: 'mid', when: `契約書類が未回収のまま${ALERT_DAYS.contractDocs}営業日` },
      { label: 'タスク未生成', severity: 'mid', when: `作業進行中になって${ALERT_DAYS.tasksGenerate}営業日` },
    ],
  },
  {
    group: '連絡・確認が止まっている',
    items: [
      { label: 'クレーム', severity: 'claim', when: 'クレームが登録されている' },
      { label: '案件報告：至急', severity: 'high', when: '至急の報告が未確認' },
      { label: '案件報告 未回答', severity: 'mid', when: `報告が未確認のまま${ALERT_DAYS.reportAnswer}営業日` },
      { label: '到着物あり（未開封）', severity: 'mid', when: `到着連絡から${ALERT_DAYS.parcelOpen}営業日` },
      { label: '週次報告の漏れ', severity: 'mid', when: '直近7日に確認済の報告がない' },
      { label: '面談メモ未記載', severity: 'mid', when: '面談日を過ぎて未入力' },
      { label: '回答予定日 間近・超過', severity: 'mid', when: 'お客様の回答予定日が2日以内または超過' },
      { label: '未対応が続いている', severity: 'mid', when: `最後に開いてから${ALERT_DAYS.inactivityMid}営業日／${ALERT_DAYS.inactivityHigh}営業日で赤` },
      { label: '自分宛てタスク', severity: 'info', when: '自分宛ての未着手タスクがある' },
    ],
  },
]

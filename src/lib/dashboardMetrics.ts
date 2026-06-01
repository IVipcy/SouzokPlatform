// 月次成績ダッシュボード用の集計ロジック。
// すべて in-memory のpureな関数。Supabaseから一括フェッチした行を受け取り、
// 月 × スコープ（部全体 / 個人）で5指標を計算する。

export type DashCase = {
  id: string
  case_number?: string
  deal_name?: string
  status: string
  order_received_date: string | null
  completion_date: string | null
  expected_completion_date?: string | null
  // 鮮度フラグ用: 案件を最後に開いた日時 / 案件作成日時（last_opened_at が無ければ created_at で代替）
  last_opened_at?: string | null
  created_at?: string | null
  fee_total: number | null
  total_revenue_estimate: number | null
  // 内訳別タブで使用（主区分 = 配列の先頭）。
  // 未設定の案件は '未設定' バケットに集計される。
  procedure_type?: string[] | null
  // 受注担当ダッシュボードの「相続税申告件数」算出に使用
  tax_filing_required?: string | null
  // 進捗管理ボードで紫フラグ（最優先）判定に使用
  has_complaint?: boolean | null
  // 当月面談一覧 (migration 049)
  meeting_date?: string | null
  meeting_executed_date?: string | null
  client_response_due_date?: string | null
  meeting_place?: string | null
  lost_reason?: string | null
}

// 受注担当ダッシュボードの「不動産査定件数」算出に使用する物件行型
export type DashProperty = {
  case_id: string
  appraisal_status: '未対応' | '対応中' | '完了' | '不要' | null
}

export type DashCaseMember = {
  case_id: string
  member_id: string
  role: string
}

// activity_log の status_change 行
export type DashStatusChange = {
  entity_id: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type MetricsBundle = {
  newOrders: number
  managing: number
  completed: number
  cycleMonths: number | null
  completedAmount: number
}

export type DashTask = {
  case_id: string
  status: string
  due_date: string | null
}

export type CaseFlag = 'purple' | 'red' | 'yellow' | 'blue'

// 鮮度フラグのしきい値（最終接触＝案件を最後に開いた日からの経過日数）
//   青: <= yellowDays 日 / 黄: yellowDays+1 〜 redDays 日 / 赤: > redDays 日
export const FRESHNESS_THRESHOLDS = {
  yellowDays: 3, // 青: <=3日 / 黄: 4〜7日 / 赤: >7日
  redDays: 7,
}

// 2つの日付(ISO文字列/Date)の経過日数
export function daysSince(ref: string | null | undefined, today: Date = new Date()): number | null {
  if (!ref) return null
  const refTime = new Date(ref).getTime()
  if (Number.isNaN(refTime)) return null
  return Math.floor((today.getTime() - refTime) / 86_400_000)
}

// 案件単位のフラグ判定（鮮度ベース）
//   優先度: 紫（クレームあり） > 赤/黄/青（最終接触からの経過日数）
//   「最終接触」= 案件詳細を最後に開いた日時 last_opened_at（無ければ作成日 created_at）
export function computeCaseFlag(
  caseRow: { has_complaint?: boolean | null; last_opened_at?: string | null; created_at?: string | null },
  _tasks: DashTask[] = [],
  today: Date = new Date(),
): CaseFlag {
  // (0) クレームあり → 紫（最優先・既存仕様）
  if (caseRow.has_complaint) {
    return 'purple'
  }
  const ref = caseRow.last_opened_at ?? caseRow.created_at ?? null
  const days = daysSince(ref, today)
  if (days === null) return 'blue' // 基準日不明なら新しい扱い
  if (days > FRESHNESS_THRESHOLDS.redDays) return 'red'
  if (days > FRESHNESS_THRESHOLDS.yellowDays) return 'yellow'
  return 'blue'
}

export type ProgressKpiBundle = {
  totalAssigned: number          // 担当件数（全アクティブ案件）
  blueCount: number              // 青件数
  yellowCount: number            // 黄件数
  redCount: number               // 赤件数
  purpleCount: number            // 紫件数（クレームあり、最優先）
  monthCompletionTarget: number  // 業完対象（選択月の完了予定件数）
  monthCompleted: number         // 月初〜本日完了件数（完了割合の分子）
  cycleMonths: number | null     // サイクル
  invoiceCount: number           // 当月発行された請求書の件数
}

export type DailyMetricsBundle = {
  newOrders: number          // 本日「面談設定済→受注」遷移
  startedManaging: number    // 本日「受注→対応中」遷移（新規受注かどうかは問わない）
  completed: number          // 本日 完了
  completedAmount: number    // 本日完了の fee_total 合計
  cycleMonths: number | null // 本日完了の (完了−受注) 平均
  monthExpected: number      // 当月の完了予定件数（完了割合の分母）
  monthCompleted: number     // 月初〜本日の完了累計（完了割合の分子）
}

export type SalesMetricsBundle = {
  meetingsCount: number          // 当月面談数
  newOrdersCount: number         // 当月新規受注件数
  conversionRate: number | null  // 受注率（小数 0..1）
  avgOrderUnit: number | null    // 平均受注単価（円）
  taxFilingCount: number         // 相続税申告件数（当月新規受注のうち tax_filing_required='要'）
  propertyAppraisalCount: number // 不動産査定件数（当月新規受注に紐づく不動産で appraisal_status IN ('対応中','完了') の物件数）
  expectedCompletions: number    // 業務完了予定件数
  completedCount: number         // 業務完了件数
  completedAmount: number        // 業務完了金額（円）
  avgCycleMonths: number | null  // 平均サイクル
}

// 受注担当 日次ダッシュボード（チーム別）用の 6 KPI
export type SalesDailyMetricsBundle = {
  meetingsCount: number          // 本日面談数
  newOrdersCount: number         // 本日新規受注件数
  conversionRate: number | null  // 受注率（本日, 0..1）
  avgOrderUnit: number | null    // 平均受注単価（本日新規受注の fee_total 平均, 円）
  taxFilingCount: number         // 相続税申告件数（本日新規受注のうち tax_filing_required='要'）
  propertyAppraisalCount: number // 不動産査定件数（本日新規受注の不動産で appraisal_status IN ('対応中','完了') の物件数）
}

const STATUS_AFTER_ORDER = new Set(['受注', '対応中', '保留・長期', '完了'])
const AVG_DAYS_PER_MONTH = 30.4375

export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const last = new Date(y, m, 0)
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  return { start, end }
}

const monthsDiff = (a: string, b: string): number =>
  (new Date(b).getTime() - new Date(a).getTime()) / 86400000 / AVG_DAYS_PER_MONTH

export function computeMetrics(cases: DashCase[], ym: string): MetricsBundle {
  const { start, end } = monthRange(ym)
  const live = cases.filter(c => c.status !== '失注')

  const newOrders = live.filter(c =>
    c.order_received_date &&
    c.order_received_date >= start &&
    c.order_received_date <= end &&
    STATUS_AFTER_ORDER.has(c.status),
  ).length

  const completedCases = live.filter(c =>
    c.status === '完了' &&
    c.completion_date &&
    c.completion_date >= start &&
    c.completion_date <= end,
  )

  const managing = live.filter(c => {
    if (!c.order_received_date || c.order_received_date > end) return false
    if (!STATUS_AFTER_ORDER.has(c.status)) return false
    if (c.status === '完了') {
      return !!(c.completion_date && c.completion_date > end)
    }
    return true
  }).length

  const cycles = completedCases
    .filter(c => c.order_received_date && c.completion_date)
    .map(c => monthsDiff(c.order_received_date!, c.completion_date!))
  const cycleMonths = cycles.length
    ? cycles.reduce((s, x) => s + x, 0) / cycles.length
    : null

  const completedAmount = completedCases.reduce(
    (s, c) => s + (c.fee_total ?? c.total_revenue_estimate ?? 0),
    0,
  )

  return {
    newOrders,
    managing,
    completed: completedCases.length,
    cycleMonths,
    completedAmount,
  }
}

export function casesForMember(
  cases: DashCase[],
  caseMembers: DashCaseMember[],
  memberId: string,
  role: 'sales' | 'manager',
): DashCase[] {
  const ids = new Set(
    caseMembers
      .filter(cm => cm.member_id === memberId && cm.role === role)
      .map(cm => cm.case_id),
  )
  return cases.filter(c => ids.has(c.id))
}

// 当年度（4月～3月）のうち、現在月までを 当月→過去 順で返す
export function fiscalYearMonthsToDate(today: Date = new Date()): string[] {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const fiscalStartYear = m >= 4 ? y : y - 1
  const months: string[] = []
  let cy = fiscalStartYear
  let cm = 4
  while (cy < y || (cy === y && cm <= m)) {
    months.push(`${cy}-${String(cm).padStart(2, '0')}`)
    cm++
    if (cm > 12) {
      cm = 1
      cy++
    }
  }
  return months.reverse()
}

// 月ヘッダー表示: 当月/先月 の2つは言葉、それ以前は YYYY-MM
export function monthHeaderLabel(ym: string, today: Date = new Date()): string {
  const tym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (ym === tym) return '今月'
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const pym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  if (ym === pym) return '先月'
  return ym
}

export function tenureLabel(joinedAt: string | null, today: Date = new Date()): string {
  if (!joinedAt) return '-'
  const j = new Date(joinedAt)
  if (Number.isNaN(j.getTime())) return '-'
  let years = today.getFullYear() - j.getFullYear()
  let months = today.getMonth() - j.getMonth()
  if (today.getDate() < j.getDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years < 0) return '-'
  return `${years}年${months}か月`
}

// アクティブ = 受注済〜未完了（失注・受注前は除く）
const ACTIVE_STATUSES = new Set(['受注', '対応中', '保留・長期'])

// 当月発行された請求書を集計するため、月内 issued_date を持つ行型
export type DashInvoice = {
  case_id: string
  issued_date: string | null
}

// 進捗管理ボード用のKPI計算
// scopedCases: 対象スコープ（チーム or 個人）に絞り込み済みの案件
// scopedInvoices: 同スコープの請求書（issued_date 当月のものをカウント）
// selectedMonth: フラグ集計と業完対象の対象月（null なら全期間）
export function computeProgressKpis(
  scopedCases: DashCase[],
  scopedTasks: DashTask[],
  selectedMonth: string | null,
  today: Date = new Date(),
  scopedInvoices: DashInvoice[] = [],
): ProgressKpiBundle {
  const tasksByCase = new Map<string, DashTask[]>()
  for (const t of scopedTasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }

  // 担当件数 = アクティブ案件全部（月フィルタなし）
  const activeCases = scopedCases.filter(c => ACTIVE_STATUSES.has(c.status))
  const totalAssigned = activeCases.length

  // 月フィルタ対象 = 完了予定日が選択月に入っているアクティブ案件
  const monthFiltered = selectedMonth === null
    ? activeCases.filter(c => c.expected_completion_date)
    : (() => {
        const { start, end } = monthRange(selectedMonth)
        return activeCases.filter(c =>
          c.expected_completion_date &&
          c.expected_completion_date >= start &&
          c.expected_completion_date <= end,
        )
      })()

  // 各案件のフラグ集計
  let blueCount = 0, yellowCount = 0, redCount = 0, purpleCount = 0
  for (const c of monthFiltered) {
    const flag = computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today)
    if (flag === 'purple') purpleCount++
    else if (flag === 'red') redCount++
    else if (flag === 'yellow') yellowCount++
    else blueCount++
  }

  // 業完対象 = 選択月の完了予定件数（無効選択時は全期間の予定数）
  const monthCompletionTarget = monthFiltered.length

  // 完了割合 = 当月（実時間）の実績
  const todayYmd = todayJstYmd(today)
  const currentYm = todayYmd.slice(0, 7)
  const { start: cmStart, end: cmEnd } = monthRange(currentYm)

  const monthCompleted = scopedCases.filter(c =>
    c.status === '完了' &&
    c.completion_date &&
    c.completion_date >= cmStart &&
    c.completion_date <= todayYmd,
  ).length

  // サイクル = 当月完了案件の (完了−受注) 平均
  const monthCompletedCases = scopedCases.filter(c =>
    c.status === '完了' &&
    c.completion_date &&
    c.completion_date >= cmStart &&
    c.completion_date <= cmEnd,
  )
  const cycles = monthCompletedCases
    .filter(c => c.order_received_date && c.completion_date)
    .map(c => monthsDiff(c.order_received_date!, c.completion_date!))
  const cycleMonths = cycles.length
    ? cycles.reduce((s, x) => s + x, 0) / cycles.length
    : null

  // 請求件数: 選択月（未指定なら当月）に issued_date がある請求書をカウント
  const invoiceMonth = selectedMonth ?? currentYm
  const { start: invStart, end: invEnd } = monthRange(invoiceMonth)
  const invoiceCount = scopedInvoices.filter(inv =>
    inv.issued_date && inv.issued_date >= invStart && inv.issued_date <= invEnd,
  ).length

  return {
    totalAssigned,
    blueCount,
    yellowCount,
    redCount,
    purpleCount,
    monthCompletionTarget,
    monthCompleted,
    cycleMonths,
    invoiceCount,
  }
}

// 「面談設定済 → どこか」 の遷移先として 当月面談数 / 受注 を判定するための集合
const POST_MEETING_STATUSES = new Set(['検討中', '受注', '失注', '保留・長期'])

// 当日の YYYY-MM-DD 文字列を返す（Asia/Tokyo タイムゾーン）
export function todayJstYmd(today: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(today)
}

// 日次ダッシュボード用の集計
export function computeDailyMetrics(
  cases: DashCase[],
  statusChanges: DashStatusChange[],
  today: Date = new Date(),
): DailyMetricsBundle {
  const ymd = todayJstYmd(today)
  const ym = ymd.slice(0, 7)
  const monthStart = `${ym}-01`
  const monthEnd = monthRange(ym).end

  // 当日の status_change のみ
  const todayStartTs = `${ymd}T00:00:00`
  const todayEndTs = `${ymd}T23:59:59.999`
  const todayChanges = statusChanges.filter(
    sc => sc.created_at >= todayStartTs && sc.created_at <= todayEndTs,
  )

  // 本日 面談設定済→受注 遷移
  const newOrderIds = new Set(
    todayChanges
      .filter(sc => sc.old_value === '面談設定済' && sc.new_value === '受注')
      .map(sc => sc.entity_id),
  )

  // 本日 受注→対応中 遷移（受注日は問わない）
  const startedManagingIds = new Set(
    todayChanges
      .filter(sc => sc.old_value === '受注' && sc.new_value === '対応中')
      .map(sc => sc.entity_id),
  )

  // 本日完了 = completion_date == 当日 かつ status='完了'
  const completedToday = cases.filter(
    c => c.status === '完了' && c.completion_date === ymd,
  )

  const completedAmount = completedToday.reduce(
    (s, c) => s + (c.fee_total ?? c.total_revenue_estimate ?? 0),
    0,
  )

  const cycles = completedToday
    .filter(c => c.order_received_date && c.completion_date)
    .map(c => monthsDiff(c.order_received_date!, c.completion_date!))
  const cycleMonths = cycles.length
    ? cycles.reduce((s, x) => s + x, 0) / cycles.length
    : null

  // 当月完了予定 = expected_completion_date が当月、失注以外
  const monthExpected = cases.filter(c =>
    c.expected_completion_date &&
    c.expected_completion_date >= monthStart &&
    c.expected_completion_date <= monthEnd &&
    c.status !== '失注',
  ).length

  // 月初〜本日の完了件数
  const monthCompleted = cases.filter(c =>
    c.status === '完了' &&
    c.completion_date &&
    c.completion_date >= monthStart &&
    c.completion_date <= ymd,
  ).length

  return {
    newOrders: newOrderIds.size,
    startedManaging: startedManagingIds.size,
    completed: completedToday.length,
    completedAmount,
    cycleMonths,
    monthExpected,
    monthCompleted,
  }
}

// 受注担当チーム日次ダッシュボード用の 6 KPI を計算する。
// 引数はすでにスコープ（チーム or 個人）に絞られている前提。
export function computeSalesDailyMetrics(
  cases: DashCase[],
  statusChanges: DashStatusChange[],
  properties: DashProperty[],
  today: Date = new Date(),
): SalesDailyMetricsBundle {
  const ymd = todayJstYmd(today)
  const todayStartTs = `${ymd}T00:00:00`
  const todayEndTs = `${ymd}T23:59:59.999`

  // 当日の status_change のみ
  const todayChanges = statusChanges.filter(
    sc => sc.created_at >= todayStartTs && sc.created_at <= todayEndTs,
  )

  // 本日 面談数: 面談設定済 → 検討中/受注/失注/保留・長期 への遷移
  const meetingCaseIds = new Set(
    todayChanges
      .filter(sc => sc.old_value === '面談設定済' && sc.new_value && POST_MEETING_STATUSES.has(sc.new_value))
      .map(sc => sc.entity_id),
  )
  const meetingsCount = meetingCaseIds.size

  // 本日 新規受注: 面談設定済 → 受注
  const newOrderCaseIds = new Set(
    todayChanges
      .filter(sc => sc.old_value === '面談設定済' && sc.new_value === '受注')
      .map(sc => sc.entity_id),
  )
  const newOrdersCount = newOrderCaseIds.size

  const conversionRate = meetingsCount > 0 ? newOrdersCount / meetingsCount : null

  // 平均受注単価 = 本日新規受注した案件の fee_total 平均
  const newOrderCases = cases.filter(c => newOrderCaseIds.has(c.id))
  const orderTotal = newOrderCases.reduce(
    (s, c) => s + (c.fee_total ?? c.total_revenue_estimate ?? 0),
    0,
  )
  const avgOrderUnit = newOrderCases.length > 0 ? orderTotal / newOrderCases.length : null

  // 相続税申告件数 = 本日新規受注のうち tax_filing_required='要'
  const taxFilingCount = newOrderCases.filter(c => c.tax_filing_required === '要').length

  // 不動産査定件数 = 本日新規受注に紐づく不動産で appraisal_status IN ('対応中','完了') の物件数
  const propertyAppraisalCount = properties.filter(p =>
    newOrderCaseIds.has(p.case_id) &&
    (p.appraisal_status === '対応中' || p.appraisal_status === '完了'),
  ).length

  return {
    meetingsCount,
    newOrdersCount,
    conversionRate,
    avgOrderUnit,
    taxFilingCount,
    propertyAppraisalCount,
  }
}

// 受注担当ダッシュボード用の KPI を計算する。
// cases / statusChanges / properties は呼び出し側でスコープ（個人/チーム/全体）に絞って渡す。
//   - properties は呼び出し側で渡したい案件群のものに絞っておくこと
export function computeSalesMetrics(
  cases: DashCase[],
  statusChanges: DashStatusChange[],
  ym: string,
  properties: DashProperty[] = [],
): SalesMetricsBundle {
  const { start, end } = monthRange(ym)
  const startTs = `${start}T00:00:00`
  const endTs = `${end}T23:59:59.999`

  // 当月のステータス遷移
  const inMonthChanges = statusChanges.filter(
    sc => sc.created_at >= startTs && sc.created_at <= endTs,
  )

  // 面談数: 面談設定済 → 検討中/受注/失注/保留・長期 への遷移（同案件複数遷移は1カウント）
  const meetingCaseIds = new Set(
    inMonthChanges
      .filter(sc => sc.old_value === '面談設定済' && sc.new_value && POST_MEETING_STATUSES.has(sc.new_value))
      .map(sc => sc.entity_id),
  )
  const meetingsCount = meetingCaseIds.size

  // 新規受注: 面談設定済 → 受注
  const newOrderCaseIds = new Set(
    inMonthChanges
      .filter(sc => sc.old_value === '面談設定済' && sc.new_value === '受注')
      .map(sc => sc.entity_id),
  )
  const newOrdersCount = newOrderCaseIds.size

  const conversionRate = meetingsCount > 0 ? newOrdersCount / meetingsCount : null

  // 平均受注単価 = 当月新規受注した案件の fee_total 平均
  const newOrderCases = cases.filter(c => newOrderCaseIds.has(c.id))
  const orderTotal = newOrderCases.reduce(
    (s, c) => s + (c.fee_total ?? c.total_revenue_estimate ?? 0),
    0,
  )
  const avgOrderUnit = newOrderCases.length > 0 ? orderTotal / newOrderCases.length : null

  // 相続税申告件数 = 当月新規受注したうち tax_filing_required='要' の件数
  const taxFilingCount = newOrderCases.filter(c => c.tax_filing_required === '要').length

  // 不動産査定件数 = 当月新規受注した案件に紐づく不動産のうち、
  // 査定ステータスが '対応中' または '完了' の物件数
  const propertyAppraisalCount = properties.filter(p =>
    newOrderCaseIds.has(p.case_id) &&
    (p.appraisal_status === '対応中' || p.appraisal_status === '完了'),
  ).length

  // 業務完了予定件数 = expected_completion_date が当月、未完了
  const expectedCompletions = cases.filter(c =>
    c.expected_completion_date &&
    c.expected_completion_date >= start &&
    c.expected_completion_date <= end &&
    c.status !== '失注',
  ).length

  // 業務完了
  const completedCases = cases.filter(c =>
    c.status === '完了' &&
    c.completion_date &&
    c.completion_date >= start &&
    c.completion_date <= end,
  )
  const completedCount = completedCases.length
  const completedAmount = completedCases.reduce(
    (s, c) => s + (c.fee_total ?? c.total_revenue_estimate ?? 0),
    0,
  )

  const cycles = completedCases
    .filter(c => c.order_received_date && c.completion_date)
    .map(c => monthsDiff(c.order_received_date!, c.completion_date!))
  const avgCycleMonths = cycles.length
    ? cycles.reduce((s, x) => s + x, 0) / cycles.length
    : null

  return {
    meetingsCount,
    newOrdersCount,
    conversionRate,
    avgOrderUnit,
    taxFilingCount,
    propertyAppraisalCount,
    expectedCompletions,
    completedCount,
    completedAmount,
    avgCycleMonths,
  }
}

// ============================================================
// 部全体ダッシュボード（サマリ / 内訳別）用
// ============================================================

// dept_targets テーブルの行型
export type DeptTargetRow = {
  ym: string
  new_orders: number
  managing: number
  completed: number
  cycle_months: number      // numeric は JS では number
  completed_amount: number  // 円
}

// 目標が未設定の場合のデフォルト
export const EMPTY_DEPT_TARGET: Omit<DeptTargetRow, 'ym'> = {
  new_orders: 0,
  managing: 0,
  completed: 0,
  cycle_months: 0,
  completed_amount: 0,
}

// sales_targets テーブルの行型
export type SalesTargetRow = {
  ym: string
  meetings_count: number
  new_orders_count: number
  conversion_rate: number       // % 値 (0..100)
  avg_order_unit: number        // 円
  tax_filing_count: number
  property_appraisal_count: number
}

export const EMPTY_SALES_TARGET: Omit<SalesTargetRow, 'ym'> = {
  meetings_count: 0,
  new_orders_count: 0,
  conversion_rate: 0,
  avg_order_unit: 0,
  tax_filing_count: 0,
  property_appraisal_count: 0,
}

// 達成率算出: target=0 のときは null（未設定扱い）
export function achievementRate(actual: number, target: number): number | null {
  if (!target || target <= 0) return null
  return actual / target
}

// サイクルは「短いほうが良い」指標なので別扱い
//   - target=0 / actual=null は null
//   - actual<=target は 100%、それを超えると比率に応じて低下
export function cycleAchievementRate(actual: number | null, target: number): number | null {
  if (!target || target <= 0) return null
  if (actual === null) return null
  if (actual <= 0) return 1
  return target / actual
}

// 主区分の候補（CaseEditModal の PROCEDURE_OPTIONS と揃える）
export const PROCEDURE_BUCKETS = ['手続一式', '登記', '遺産分割協議書のみ', '相続人調査のみ', '未設定'] as const
export type ProcedureBucket = (typeof PROCEDURE_BUCKETS)[number]

export type ProcedureBreakdownItem = {
  procedure: ProcedureBucket
  caseCount: number
  amount: number       // 円
  ratio: number        // 0..1 （金額ベース）
}

export type ProcedureBreakdown = {
  totalAmount: number  // 円
  totalCases: number
  items: ProcedureBreakdownItem[]  // amount 降順、最低でも全バケットを返す
}

// 当月完了した案件を「手続区分（主区分=配列先頭）」で集計する
export function computeProcedureBreakdown(cases: DashCase[], ym: string): ProcedureBreakdown {
  const { start, end } = monthRange(ym)
  const completed = cases.filter(c =>
    c.status === '完了' &&
    c.completion_date &&
    c.completion_date >= start &&
    c.completion_date <= end,
  )

  const buckets: Record<ProcedureBucket, { caseCount: number; amount: number }> = {
    '手続一式': { caseCount: 0, amount: 0 },
    '登記': { caseCount: 0, amount: 0 },
    '遺産分割協議書のみ': { caseCount: 0, amount: 0 },
    '相続人調査のみ': { caseCount: 0, amount: 0 },
    '未設定': { caseCount: 0, amount: 0 },
  }

  let totalAmount = 0
  for (const c of completed) {
    const amount = c.fee_total ?? c.total_revenue_estimate ?? 0
    const primary = (c.procedure_type ?? [])[0]
    const bucket: ProcedureBucket = (PROCEDURE_BUCKETS as readonly string[]).includes(primary ?? '')
      ? (primary as ProcedureBucket)
      : '未設定'
    buckets[bucket].caseCount++
    buckets[bucket].amount += amount
    totalAmount += amount
  }

  const items: ProcedureBreakdownItem[] = (Object.entries(buckets) as Array<[ProcedureBucket, { caseCount: number; amount: number }]>)
    .map(([procedure, v]) => ({
      procedure,
      caseCount: v.caseCount,
      amount: v.amount,
      ratio: totalAmount > 0 ? v.amount / totalAmount : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    totalAmount,
    totalCases: completed.length,
    items,
  }
}

// ============================================================
// 達成判定（ダッシュボード達成ポップアップ用）
// ============================================================

export type AchievementResult = {
  // true=目標が1つ以上設定されている。false=全部0（未設定）。
  hasTargets: boolean
  // hasTargets=true のときのみ意味を持つ。set済み目標が全て達成なら true。
  achieved: boolean
}

// 部全体ダッシュボード ポップアップ判定（業務完了金額 単独）
//   - completed_amount 目標が未設定 → ポップアップ非表示
//   - actual >= target なら達成
export function isDeptAchieved(
  m: MetricsBundle,
  t: { completed_amount: number },
): AchievementResult {
  if (!t.completed_amount || t.completed_amount <= 0) {
    return { hasTargets: false, achieved: false }
  }
  return { hasTargets: true, achieved: m.completedAmount >= t.completed_amount }
}

// 受注担当ダッシュボード ポップアップ判定（新規受注件数 単独）
//   - new_orders_count 目標が未設定 → ポップアップ非表示
//   - actual >= target なら達成
export function isSalesAchieved(
  m: SalesMetricsBundle,
  t: { new_orders_count: number },
): AchievementResult {
  if (!t.new_orders_count || t.new_orders_count <= 0) {
    return { hasTargets: false, achieved: false }
  }
  return { hasTargets: true, achieved: m.newOrdersCount >= t.new_orders_count }
}

// 円 → 万円表示
export function formatMan(yen: number): string {
  if (yen === 0) return '0'
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億`
  if (yen >= 10_000) return `${Math.round(yen / 10_000).toLocaleString()}`
  return yen.toLocaleString()
}

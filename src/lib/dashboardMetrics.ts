// 月次成績ダッシュボード用の集計ロジック。
// すべて in-memory のpureな関数。Supabaseから一括フェッチした行を受け取り、
// 月 × スコープ（部全体 / 個人）で5指標を計算する。

export type DashCase = {
  id: string
  status: string
  order_received_date: string | null
  completion_date: string | null
  expected_completion_date?: string | null
  fee_total: number | null
  total_revenue_estimate: number | null
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

export type CaseFlag = 'red' | 'yellow' | 'blue'

// 進捗管理ボードのしきい値（運用しながら調整可能）
const FLAG_THRESHOLDS = {
  redOverdueTasks: 2,
  yellowOverdueTasks: 1,
  yellowImminentDays: 3,
  yellowImminentTasks: 2,
}

const isTaskOpen = (s: string) => s !== '完了' && s !== 'キャンセル'

// 案件単位のフラグ判定
export function computeCaseFlag(
  caseRow: { expected_completion_date?: string | null },
  tasks: DashTask[],
  today: Date = new Date(),
): CaseFlag {
  const ymd = todayJstYmd(today)
  const plus3 = new Date(today)
  plus3.setDate(plus3.getDate() + FLAG_THRESHOLDS.yellowImminentDays)
  const ymdPlus3 = todayJstYmd(plus3)

  const overdueCount = tasks.filter(t =>
    t.due_date && t.due_date < ymd && isTaskOpen(t.status),
  ).length

  // (a) 案件の完了予定日 < 今日
  if (caseRow.expected_completion_date && caseRow.expected_completion_date < ymd) {
    return 'red'
  }
  // (b) 期限超過タスクが redOverdueTasks 件以上
  if (overdueCount >= FLAG_THRESHOLDS.redOverdueTasks) {
    return 'red'
  }
  // (c) 期限超過タスクが yellowOverdueTasks 件以上
  if (overdueCount >= FLAG_THRESHOLDS.yellowOverdueTasks) {
    return 'yellow'
  }
  // (d) 期限間近 (今日〜+3日) の未完タスクが yellowImminentTasks 件以上
  const imminentCount = tasks.filter(t =>
    t.due_date && t.due_date >= ymd && t.due_date <= ymdPlus3 && isTaskOpen(t.status),
  ).length
  if (imminentCount >= FLAG_THRESHOLDS.yellowImminentTasks) {
    return 'yellow'
  }
  return 'blue'
}

export type ProgressKpiBundle = {
  totalAssigned: number          // 担当件数（全アクティブ案件）
  blueCount: number              // 青件数
  yellowCount: number            // 黄件数
  redCount: number               // 赤件数
  monthCompletionTarget: number  // 業完対象（選択月の完了予定件数）
  monthCompleted: number         // 月初〜本日完了件数（完了割合の分子）
  cycleMonths: number | null     // サイクル
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
  expectedCompletions: number    // 業務完了予定件数
  completedCount: number         // 業務完了件数
  completedAmount: number        // 業務完了金額（円）
  avgCycleMonths: number | null  // 平均サイクル
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

// 進捗管理ボード用のKPI計算
// scopedCases: 対象スコープ（チーム or 個人）に絞り込み済みの案件
// selectedMonth: フラグ集計と業完対象の対象月（null なら全期間）
export function computeProgressKpis(
  scopedCases: DashCase[],
  scopedTasks: DashTask[],
  selectedMonth: string | null,
  today: Date = new Date(),
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
  let blueCount = 0, yellowCount = 0, redCount = 0
  for (const c of monthFiltered) {
    const flag = computeCaseFlag(c, tasksByCase.get(c.id) ?? [], today)
    if (flag === 'red') redCount++
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

  return {
    totalAssigned,
    blueCount,
    yellowCount,
    redCount,
    monthCompletionTarget,
    monthCompleted,
    cycleMonths,
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

// 受注担当ダッシュボード用の8KPIを計算する。
// cases / statusChanges は呼び出し側でスコープ（個人/チーム/全体）に絞って渡す。
export function computeSalesMetrics(
  cases: DashCase[],
  statusChanges: DashStatusChange[],
  ym: string,
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
    expectedCompletions,
    completedCount,
    completedAmount,
    avgCycleMonths,
  }
}

// 円 → 万円表示
export function formatMan(yen: number): string {
  if (yen === 0) return '0'
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億`
  if (yen >= 10_000) return `${Math.round(yen / 10_000).toLocaleString()}`
  return yen.toLocaleString()
}

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CASE_STATUSES } from '@/lib/constants'
import Badge from '@/components/ui/Badge'

// ─── 型定義（Supabaseレスポンス最小限） ───
type CM = { role: string; members: { id: string; name: string; avatar_color: string } | null }
type DashCase = {
  id: string
  case_number: string
  deal_name: string
  status: string
  date_of_death: string | null
  order_date: string | null
  order_received_date: string | null
  completion_date: string | null
  expected_completion_date: string | null
  tax_filing_required: string | null
  total_revenue_estimate: number | null
  fee_total: number | null
  order_route: string | null
  deceased_name: string | null
  case_members?: CM[]
}
type DashTask = {
  id: string
  case_id: string
  title: string
  status: string
  phase: string | null
  priority: string | null
  due_date: string | null
  started_by: string | null
  task_assignees?: Array<{ member_id: string; role: string }>
}
type DashInvoice = {
  id: string
  case_id: string
  amount: number
  status: string
  payments: Array<{ amount: number }>
}

// ─── Helpers ───
const normTaskStatus = (s: string) => {
  if (s === '未着手') return '着手前'
  if (['Wチェック待ち', '差戻し', '保留'].includes(s)) return '対応中'
  if (s === 'キャンセル') return '完了'
  return s
}
const yen = (n: number) => `¥${n.toLocaleString()}`
const man = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(0)}万円` : yen(n))
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const daysDiff = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
const addMonths = (d: Date, n: number) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }

export default async function DashboardPage() {
  const supabase = await createClient()
  const now = new Date()
  const today = ymd(now)
  const thisMonth = ym(now)
  const lastMonth = ym(addMonths(now, -1))
  const nextMonth = ym(addMonths(now, 1))
  const twoMonth = ym(addMonths(now, 2))
  const lastMonthStart = `${lastMonth}-01`
  const thisMonthStart = `${thisMonth}-01`

  // ─── fetch ───
  const [
    { data: casesRaw },
    { data: tasksRaw },
    { data: invoicesRaw },
    { data: membersRaw },
  ] = await Promise.all([
    supabase.from('cases').select('id,case_number,deal_name,status,date_of_death,order_date,order_received_date,completion_date,expected_completion_date,tax_filing_required,total_revenue_estimate,fee_total,order_route,deceased_name,case_members(role,members(id,name,avatar_color))'),
    supabase.from('tasks').select('id,case_id,title,status,phase,priority,due_date,started_by,task_assignees(member_id,role)'),
    supabase.from('invoices').select('id,case_id,amount,status,payments(amount)'),
    supabase.from('members').select('id,name,avatar_color').eq('is_active', true),
  ])

  const cases = (casesRaw ?? []) as unknown as DashCase[]
  const tasks = (tasksRaw ?? []) as unknown as DashTask[]
  const invoices = (invoicesRaw ?? []) as unknown as DashInvoice[]
  const members = (membersRaw ?? []) as Array<{ id: string; name: string; avatar_color: string }>

  const caseMap: Record<string, DashCase> = Object.fromEntries(cases.map(c => [c.id, c]))

  // ─── セクション1: 今月サマリー ───
  const amtOf = (c: DashCase) => c.total_revenue_estimate ?? c.fee_total ?? 0
  const monthOrdered = cases.filter(c => c.order_received_date?.startsWith(thisMonth))
  const monthOrderedAmount = monthOrdered.reduce((s, c) => s + amtOf(c), 0)
  const lastMonthOrdered = cases.filter(c => c.order_received_date?.startsWith(lastMonth))
  const lastMonthOrderedAmount = lastMonthOrdered.reduce((s, c) => s + amtOf(c), 0)
  const monthCompleting = cases.filter(c => {
    const d = c.expected_completion_date ?? c.completion_date
    return d?.startsWith(thisMonth) && c.status !== '失注'
  })
  const monthCompletingAmount = monthCompleting.reduce((s, c) => s + amtOf(c), 0)
  const lastMonthCompleted = cases.filter(c => c.completion_date?.startsWith(lastMonth) && c.status === '完了')
  const lastMonthCompletedAmount = lastMonthCompleted.reduce((s, c) => s + amtOf(c), 0)
  const unpaidAmount = invoices.reduce((s, inv) => {
    if (inv.status === '入金済') return s
    const paid = (inv.payments ?? []).reduce((a, p) => a + (p.amount ?? 0), 0)
    return s + Math.max(inv.amount - paid, 0)
  }, 0)
  // トレンド計算
  const pctDelta = (cur: number, prev: number): number | null => {
    if (prev === 0) return cur > 0 ? null : 0
    return Math.round(((cur - prev) / prev) * 100)
  }

  // ─── セクション2: 緊急アラート ───
  // 相続税10ヶ月期限
  const taxDeadlines = cases
    .filter(c => c.tax_filing_required === '要' && c.date_of_death && c.status !== '完了' && c.status !== '失注')
    .map(c => {
      const deadline = addMonths(new Date(c.date_of_death!), 10)
      const remaining = daysDiff(ymd(deadline), today)
      return { ...c, deadline: ymd(deadline), remaining }
    })
    .filter(c => c.remaining <= 90)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 8)

  // 期限超過タスクTOP10
  const overdueTasks = tasks
    .filter(t => t.due_date && t.due_date < today && normTaskStatus(t.status) !== '完了')
    .map(t => ({ ...t, overdueDays: daysDiff(today, t.due_date!) }))
    .sort((a, b) => b.overdueDays - a.overdueDays)
    .slice(0, 10)

  // ─── セクション3: チャート ───
  // 完了予定タイムライン (当月/来月/再来月/それ以降)
  const activeCases = cases.filter(c => c.status !== '完了' && c.status !== '失注')
  const bucketCases = (filterFn: (ym: string | null) => boolean) => {
    return activeCases.filter(c => {
      const d = c.expected_completion_date ?? c.completion_date
      return filterFn(d ? d.slice(0, 7) : null)
    })
  }
  const caseProgress = (caseId: string): number => {
    const ct = tasks.filter(t => t.case_id === caseId)
    if (!ct.length) return 0
    const done = ct.filter(t => normTaskStatus(t.status) === '完了').length
    return Math.round((done / ct.length) * 100)
  }
  const timelineBuckets = [
    { key: 'this', label: '当月', cases: bucketCases(m => m === thisMonth) },
    { key: 'next', label: '来月', cases: bucketCases(m => m === nextMonth) },
    { key: 'two', label: '再来月', cases: bucketCases(m => m === twoMonth) },
    { key: 'later', label: 'それ以降', cases: bucketCases(m => !!m && m > twoMonth) },
    { key: 'none', label: '未設定', cases: bucketCases(m => !m) },
  ].map(b => {
    const progs = b.cases.map(c => caseProgress(c.id))
    const avgProg = progs.length ? Math.round(progs.reduce((s, p) => s + p, 0) / progs.length) : 0
    const delayedCount = progs.filter(p => p < 50).length
    return {
      ...b,
      count: b.cases.length,
      amount: b.cases.reduce((s, c) => s + amtOf(c), 0),
      avgProg,
      delayedCount,
    }
  })

  // 全体タスク進捗（アクティブ案件のみ）
  const activeCaseIds = new Set(activeCases.map(c => c.id))
  const activeTasks = tasks.filter(t => activeCaseIds.has(t.case_id))
  const totalT = activeTasks.length
  const todoT = activeTasks.filter(t => normTaskStatus(t.status) === '着手前').length
  const doingT = activeTasks.filter(t => normTaskStatus(t.status) === '対応中').length
  const doneT = activeTasks.filter(t => normTaskStatus(t.status) === '完了').length
  const overdueT = activeTasks.filter(t => t.due_date && t.due_date < today && normTaskStatus(t.status) !== '完了').length
  const urgentT = activeTasks.filter(t => t.priority === '急ぎ' && normTaskStatus(t.status) !== '完了').length
  const noAssigneeT = activeTasks.filter(t =>
    normTaskStatus(t.status) === '着手前' &&
    !t.started_by &&
    !(t.task_assignees ?? []).some(a => a.role === 'primary'),
  ).length
  const dueSoonT = activeTasks.filter(t => {
    if (!t.due_date || normTaskStatus(t.status) === '完了') return false
    const d = daysDiff(t.due_date, today)
    return d >= 0 && d <= 7
  }).length
  const donePct = totalT ? Math.round((doneT / totalT) * 100) : 0
  const stalledPct = totalT ? Math.round((overdueT / totalT) * 100) : 0

  // 受注ファネル (当月 + 前月比較)
  const buildFunnel = (src: DashCase[]) => [
    { label: '架電案件化', count: src.length, color: '#6B7280' },
    { label: '面談設定', count: src.filter(c => ['面談設定済', '検討中', '受注', '対応中', '完了'].includes(c.status)).length, color: '#3B82F6' },
    { label: '検討中', count: src.filter(c => ['検討中', '受注', '対応中', '完了'].includes(c.status)).length, color: '#D97706' },
    { label: '受注', count: src.filter(c => ['受注', '対応中', '完了'].includes(c.status)).length, color: '#16A34A' },
  ]
  const callMonth = cases.filter(c => c.order_date && c.order_date >= thisMonthStart)
  const callLastMonth = cases.filter(c => c.order_date && c.order_date >= lastMonthStart && c.order_date < thisMonthStart)
  const funnel = buildFunnel(callMonth)
  const funnelPrev = buildFunnel(callLastMonth)
  const funnelMax = Math.max(...funnel.map(f => f.count), ...funnelPrev.map(f => f.count), 1)
  const finalConvRate = funnel[0].count > 0 ? Math.round((funnel[funnel.length - 1].count / funnel[0].count) * 100) : 0
  const finalConvRatePrev = funnelPrev[0].count > 0 ? Math.round((funnelPrev[funnelPrev.length - 1].count / funnelPrev[0].count) * 100) : 0

  // 受注ルート別（過去90日: 架電件数も集計して受注率算出）
  const ninetyAgo = ymd(new Date(Date.now() - 90 * 86400000))
  const routeCallCases = cases.filter(c => c.order_date && c.order_date >= ninetyAgo)
  const routeMap: Record<string, { count: number; amount: number; calls: number }> = {}
  routeCallCases.forEach(c => {
    const r = c.order_route ?? '未設定'
    if (!routeMap[r]) routeMap[r] = { count: 0, amount: 0, calls: 0 }
    routeMap[r].calls++
    if (['受注', '対応中', '完了'].includes(c.status) && c.order_received_date && c.order_received_date >= ninetyAgo) {
      routeMap[r].count++
      routeMap[r].amount += amtOf(c)
    }
  })
  // 架電がないがこの期間に受注したもの（order_date未登録）も拾う
  cases.filter(c => c.order_received_date && c.order_received_date >= ninetyAgo && (!c.order_date || c.order_date < ninetyAgo)).forEach(c => {
    const r = c.order_route ?? '未設定'
    if (!routeMap[r]) routeMap[r] = { count: 0, amount: 0, calls: 0 }
    routeMap[r].count++
    routeMap[r].amount += amtOf(c)
  })
  const routeStats = Object.entries(routeMap).map(([k, v]) => ({
    route: k,
    ...v,
    avgUnit: v.count > 0 ? Math.round(v.amount / v.count) : 0,
    orderRate: v.calls > 0 ? Math.round((v.count / v.calls) * 100) : null,
  })).filter(r => r.count > 0 || r.calls > 0).sort((a, b) => b.amount - a.amount)

  // 担当者別負荷
  const memberLoad = members.map(m => {
    const caseSet = new Set(
      cases
        .filter(c => activeCaseIds.has(c.id))
        .filter(c => c.case_members?.some(cm => cm.members?.id === m.id))
        .map(c => c.id),
    )
    const myTasks = tasks.filter(t =>
      activeCaseIds.has(t.case_id) &&
      normTaskStatus(t.status) !== '完了' &&
      (t.started_by === m.id || t.task_assignees?.some(a => a.member_id === m.id && a.role === 'primary')),
    )
    const overdue = myTasks.filter(t => t.due_date && t.due_date < today).length
    return { ...m, cases: caseSet.size, tasks: myTasks.length, overdue }
  }).filter(m => m.cases > 0 || m.tasks > 0).sort((a, b) => (b.tasks + b.cases * 2) - (a.tasks + a.cases * 2))
  const avgTasks = memberLoad.length ? memberLoad.reduce((s, m) => s + m.tasks, 0) / memberLoad.length : 0
  const overloadedCount = memberLoad.filter(m => m.tasks > avgTasks * 1.5 && m.tasks >= 5).length

  // ─── セクション4: 対応中案件タスク進捗 ───
  const activeProgress = cases
    .filter(c => c.status === '受注' || c.status === '対応中')
    .map(c => {
      const ct = tasks.filter(t => t.case_id === c.id)
      const done = ct.filter(t => normTaskStatus(t.status) === '完了').length
      const pct = ct.length ? Math.round((done / ct.length) * 100) : 0
      const overdue = ct.filter(t => t.due_date && t.due_date < today && normTaskStatus(t.status) !== '完了').length
      const sales = c.case_members?.find(cm => cm.role === 'sales')?.members
      return { ...c, total: ct.length, done, pct, overdue, sales }
    })
    .sort((a, b) => b.overdue - a.overdue || a.pct - b.pct)
    .slice(0, 12)

  // ─── ステータス分布（全案件） ───
  const statusDist = CASE_STATUSES.map(s => ({ ...s, count: cases.filter(c => c.status === s.key).length }))

  // ─── Summary KPIs ───
  const kpis = [
    {
      label: '今月受注件数', value: String(monthOrdered.length), unit: '件',
      sub: `前月 ${lastMonthOrdered.length}件`, color: '#2563EB', icon: '🎯',
      delta: pctDelta(monthOrdered.length, lastMonthOrdered.length), higherIsBetter: true,
    },
    {
      label: '今月受注金額', value: man(monthOrderedAmount), unit: '',
      sub: `前月 ${man(lastMonthOrderedAmount)}`, color: '#16A34A', icon: '💰',
      delta: pctDelta(monthOrderedAmount, lastMonthOrderedAmount), higherIsBetter: true,
    },
    {
      label: '今月完了予定', value: String(monthCompleting.length), unit: '件',
      sub: `${man(monthCompletingAmount)} / 前月実績${lastMonthCompleted.length}件`, color: '#D97706', icon: '📅',
      delta: pctDelta(monthCompleting.length, lastMonthCompleted.length), higherIsBetter: true,
    },
    {
      label: '未入金額', value: man(unpaidAmount), unit: '',
      sub: `請求書 ${invoices.length}件`, color: '#DC2626', icon: '💳',
      delta: null, higherIsBetter: false,
    },
  ]

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-xs text-gray-400">{today} ・ 案件 {cases.length}件 / タスク {tasks.length}件</p>
      </div>

      {/* ─── セクション1: 今月サマリー ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => {
          const good = k.delta !== null && (k.higherIsBetter ? k.delta >= 0 : k.delta <= 0)
          const deltaColor = k.delta === null ? 'text-gray-400' : k.delta === 0 ? 'text-gray-500' : good ? 'text-green-600' : 'text-red-600'
          const arrow = k.delta === null ? '' : k.delta > 0 ? '↑' : k.delta < 0 ? '↓' : '→'
          return (
            <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-500">{k.label}</span>
                <span className="text-[16px]">{k.icon}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[24px] font-extrabold tracking-tight leading-none" style={{ color: k.color }}>
                  {k.value}
                </span>
                {k.unit && <span className="text-[12px] font-bold text-gray-500">{k.unit}</span>}
                {k.delta !== null && (
                  <span className={`text-[11px] font-mono font-bold ${deltaColor} ml-auto`}>
                    {arrow}{Math.abs(k.delta)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{k.sub}</div>
            </div>
          )
        })}
      </div>

      {/* ─── セクション2: 緊急アラート ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="🚨 相続税申告期限 切迫" accent="red" count={taxDeadlines.length}>
          {taxDeadlines.length === 0 ? (
            <Empty>90日以内の切迫案件はありません</Empty>
          ) : taxDeadlines.map(c => (
            <Link key={c.id} href={`/cases/${c.id}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-red-50/40 border-b border-gray-50 last:border-b-0">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono flex-shrink-0 ${
                c.remaining <= 30 ? 'bg-red-600 text-white' : c.remaining <= 60 ? 'bg-orange-100 text-orange-700' : 'bg-amber-50 text-amber-700'
              }`}>
                残{c.remaining}日
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-gray-900 truncate">{c.deal_name}</div>
                <div className="text-[10px] text-gray-400">期限: {c.deadline}</div>
              </div>
            </Link>
          ))}
        </Card>
        <Card title="⚠️ 期限超過タスク TOP10" accent="red" count={overdueTasks.length}>
          {overdueTasks.length === 0 ? (
            <Empty>期限超過タスクはありません 🎉</Empty>
          ) : overdueTasks.map(t => {
            const c = caseMap[t.case_id]
            return (
              <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-red-50/40 border-b border-gray-50 last:border-b-0">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white font-mono flex-shrink-0">
                  {t.overdueDays}日超過
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-gray-900 truncate">{t.title}</div>
                  {c && <div className="text-[10px] text-gray-400 truncate">{c.case_number} {c.deal_name}</div>}
                </div>
                <span className="text-[10px] font-mono text-gray-400">{t.due_date}</span>
              </Link>
            )
          })}
        </Card>
      </div>

      {/* ─── セクション3: チャート ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* 完了予定タイムライン */}
        <Card title="📅 完了予定タイムライン" sub="見込みキャッシュフロー">
          <div className="px-4 py-3 space-y-2.5">
            {(() => {
              const totalAmt = timelineBuckets.reduce((s, b) => s + b.amount, 0)
              const cumAmt = timelineBuckets.filter(b => b.key !== 'none').reduce((s, b) => s + b.amount, 0)
              return (
                <div className="flex items-baseline justify-between pb-2 mb-1 border-b border-gray-100">
                  <span className="text-[11px] text-gray-500 font-semibold">累計見込み金額</span>
                  <span className="text-[16px] font-extrabold text-gray-900">{man(cumAmt)}<span className="text-[10px] text-gray-400 ml-1">/ 総 {man(totalAmt)}</span></span>
                </div>
              )
            })()}
            {timelineBuckets.map(b => {
              const max = Math.max(...timelineBuckets.map(x => x.amount), 1)
              const pct = b.amount / max * 100
              // 当月は進捗で色付け、その他はbucket固定色
              let barColor = '#6B7280'
              if (b.key === 'this') {
                barColor = b.avgProg >= 80 ? '#16A34A' : b.avgProg >= 50 ? '#D97706' : '#DC2626'
              } else if (b.key === 'next') barColor = '#D97706'
              else if (b.key === 'two') barColor = '#2563EB'
              else if (b.key === 'later') barColor = '#6B7280'
              else if (b.key === 'none') barColor = '#D1D5DB'
              return (
                <div key={b.key}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                      {b.label}
                      {b.key === 'this' && b.count > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">進捗{b.avgProg}%</span>
                      )}
                      {b.delayedCount > 0 && b.key !== 'none' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-700">遅れ{b.delayedCount}件</span>
                      )}
                    </span>
                    <span className="font-mono text-gray-500">{b.count}件 / {man(b.amount)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 全体タスク進捗 */}
        <Card title="📊 全体タスク進捗" sub="アクティブ案件のタスク">
          <div className="px-4 py-4">
            {/* 大きな完了率 */}
            <div className="flex items-end justify-between mb-2">
              <div>
                <div className="text-[11px] text-gray-500 font-semibold mb-0.5">完了率</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[32px] font-extrabold leading-none" style={{ color: donePct >= 70 ? '#059669' : donePct >= 40 ? '#2563EB' : '#D97706' }}>
                    {donePct}%
                  </span>
                  <span className="text-[11px] font-mono text-gray-500">{doneT} / {totalT} 完了</span>
                </div>
              </div>
              {stalledPct > 0 && (
                <div className="text-right">
                  <div className="text-[11px] text-gray-500 font-semibold mb-0.5">滞留率</div>
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className="text-[22px] font-extrabold leading-none text-red-600">{stalledPct}%</span>
                    <span className="text-[10px] font-mono text-red-500">{overdueT} 期限超過</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3色スタックバー: 完了/対応中/着手前 */}
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex mb-2">
              <div className="h-full bg-green-500" style={{ width: `${totalT ? (doneT / totalT) * 100 : 0}%` }} title={`完了 ${doneT}`} />
              <div className="h-full bg-blue-500" style={{ width: `${totalT ? (doingT / totalT) * 100 : 0}%` }} title={`対応中 ${doingT}`} />
              <div className="h-full bg-gray-300" style={{ width: `${totalT ? (todoT / totalT) * 100 : 0}%` }} title={`着手前 ${todoT}`} />
            </div>
            <div className="flex items-center justify-between text-[11px] mb-4">
              <LegendDot color="#22C55E" label="完了" count={doneT} />
              <LegendDot color="#3B82F6" label="対応中" count={doingT} />
              <LegendDot color="#D1D5DB" label="着手前" count={todoT} />
            </div>

            {/* 注意指標 4項目 */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
              <StatChip label="期限超過" value={overdueT} tone={overdueT > 0 ? 'red' : 'gray'} />
              <StatChip label="7日以内期限" value={dueSoonT} tone={dueSoonT > 0 ? 'amber' : 'gray'} />
              <StatChip label="🚨 急ぎ" value={urgentT} tone={urgentT > 0 ? 'red' : 'gray'} />
              <StatChip label="担当者未割当" value={noAssigneeT} tone={noAssigneeT > 0 ? 'amber' : 'gray'} />
            </div>
          </div>
        </Card>

        {/* 受注ファネル */}
        <Card title="🎯 受注ファネル（今月）" sub="架電→面談→検討→受注">
          <div className="px-4 py-3">
            {/* 最終受注率バナー */}
            <div className="flex items-baseline justify-between pb-3 mb-3 border-b border-gray-100">
              <div>
                <div className="text-[10px] text-gray-500 font-semibold mb-0.5">最終受注率</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-extrabold leading-none" style={{ color: finalConvRate >= 30 ? '#059669' : finalConvRate >= 15 ? '#D97706' : '#DC2626' }}>
                    {finalConvRate}%
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">前月 {finalConvRatePrev}%</span>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 font-mono text-right">
                <div>架電 {funnel[0].count} → 受注 {funnel[funnel.length - 1].count}</div>
                <div>前月: {funnelPrev[0].count} → {funnelPrev[funnelPrev.length - 1].count}</div>
              </div>
            </div>
            <div className="space-y-2.5">
              {funnel.map((f, i) => {
                const pct = (f.count / funnelMax) * 100
                const prevPct = (funnelPrev[i].count / funnelMax) * 100
                const conversion = i > 0 && funnel[i - 1].count > 0
                  ? Math.round((f.count / funnel[i - 1].count) * 100) : null
                const loss = i > 0 ? funnel[i - 1].count - f.count : 0
                return (
                  <div key={f.label}>
                    {loss > 0 && (
                      <div className="text-[9px] font-mono text-red-600 mb-0.5 pl-2">↓ 離脱 {loss}件{conversion !== null && ` (通過 ${conversion}%)`}</div>
                    )}
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-gray-700">{f.label}</span>
                      <span className="font-mono text-gray-700 font-bold">{f.count}件</span>
                    </div>
                    {/* 前月オーバーレイ + 当月バー */}
                    <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-gray-200 rounded-full" style={{ width: `${prevPct}%` }} title={`前月 ${funnelPrev[i].count}件`} />
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: f.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-3 text-[9px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" />前月</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />当月</span>
            </div>
          </div>
        </Card>

        {/* 受注ルート別 */}
        <Card title="📣 受注ルート別内訳" sub="過去90日">
          <div className="px-4 py-3 space-y-2.5">
            {routeStats.length === 0 ? <Empty>過去90日の受注がありません</Empty> : routeStats.map(r => {
              const max = Math.max(...routeStats.map(x => x.amount), 1)
              return (
                <div key={r.route}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-medium text-gray-700 flex items-center gap-1.5">
                      {r.route}
                      {r.orderRate !== null && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          r.orderRate >= 30 ? 'bg-green-50 text-green-700' : r.orderRate >= 15 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                        }`}>受注率 {r.orderRate}%</span>
                      )}
                    </span>
                    <span className="font-mono text-gray-500">{r.count}件 / {man(r.amount)}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.amount / max) * 100}%` }} />
                  </div>
                  <div className="text-[9px] font-mono text-gray-400 mt-0.5 text-right">
                    平均単価 {man(r.avgUnit)}{r.calls > 0 && ` ・ 架電${r.calls}件`}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* ステータス分布 */}
        <Card title="📂 案件ステータス分布" sub="全案件の内訳">
          <div className="px-4 py-3 space-y-1.5">
            {statusDist.map(s => {
              const max = Math.max(...statusDist.map(x => x.count), 1)
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="flex items-center gap-1.5 text-gray-700">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.key}
                    </span>
                    <span className="font-mono text-gray-500">{s.count}件</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 担当者別負荷 */}
        <Card
          title="👥 担当者別 負荷"
          sub={`平均 ${avgTasks.toFixed(1)}タスク/人`}
          extra={overloadedCount > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">⚠️ 過負荷 {overloadedCount}人</span>
          ) : undefined}
        >
          <div className="px-4 py-3 space-y-2">
            {memberLoad.length === 0 ? <Empty>データなし</Empty> : memberLoad.slice(0, 10).map(m => {
              const max = Math.max(...memberLoad.map(x => x.tasks), 1)
              const overloaded = m.tasks > avgTasks * 1.5 && m.tasks >= 5
              const light = m.tasks < avgTasks * 0.5 && avgTasks >= 3
              const barColor = overloaded ? '#DC2626' : light ? '#16A34A' : '#3B82F6'
              const avgPct = (avgTasks / max) * 100
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
                    {m.name.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-medium text-gray-700 truncate flex items-center gap-1">
                        {m.name}
                        {overloaded && <span className="text-[9px] font-bold text-red-600">過負荷</span>}
                        {light && <span className="text-[9px] font-bold text-green-600">余裕</span>}
                      </span>
                      <span className="font-mono text-gray-500 flex-shrink-0">
                        案件{m.cases} / タスク{m.tasks}
                        {m.overdue > 0 && <span className="ml-1 text-red-600 font-bold">⚠{m.overdue}</span>}
                      </span>
                    </div>
                    <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(m.tasks / max) * 100}%`, backgroundColor: barColor }} />
                      {avgTasks > 0 && (
                        <div className="absolute inset-y-0 border-l border-dashed border-gray-500" style={{ left: `${avgPct}%` }} title={`平均 ${avgTasks.toFixed(1)}`} />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {avgTasks > 0 && memberLoad.length > 0 && (
              <div className="text-[9px] text-gray-400 pt-1 flex items-center gap-1">
                <span className="inline-block w-3 border-t border-dashed border-gray-500" />
                平均ライン ({avgTasks.toFixed(1)}タスク)
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ─── セクション4: 対応中案件 進捗 ─── */}
      <Card title="🚀 受注中・対応中案件 タスク進捗" sub="期限超過・進捗遅延順" extra={<Link href="/cases" className="text-[11px] text-blue-600 font-medium hover:underline">すべて表示 →</Link>}>
        {activeProgress.length === 0 ? <Empty>対応中の案件はありません</Empty> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {activeProgress.map(c => {
              const statusDef = CASE_STATUSES.find(s => s.key === c.status)
              return (
                <Link key={c.id} href={`/cases/${c.id}`} className="px-4 py-3 hover:bg-gray-50 transition-colors block">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-gray-400">{c.case_number}</div>
                      <div className="text-[12px] font-semibold text-gray-900 truncate">{c.deal_name}</div>
                    </div>
                    {statusDef && <Badge label={statusDef.key} color={statusDef.color} />}
                  </div>
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="font-mono text-gray-500">{c.done}/{c.total} タスク完了</span>
                    <span className="flex items-center gap-1.5">
                      {c.overdue > 0 && <span className="text-red-600 font-bold">⚠{c.overdue}</span>}
                      <span className="font-mono font-bold text-gray-700">{c.pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${c.pct}%`,
                      backgroundColor: c.pct === 100 ? '#059669' : c.overdue > 0 ? '#DC2626' : '#2563EB',
                    }} />
                  </div>
                  {c.sales && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: c.sales.avatar_color }}>
                        {c.sales.name.charAt(0)}
                      </span>
                      <span className="text-[10px] text-gray-500">{c.sales.name}</span>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── UI atoms ───
function Card({ title, children, sub, extra, accent, count }: {
  title: string
  children: React.ReactNode
  sub?: string
  extra?: React.ReactNode
  accent?: 'red'
  count?: number
}) {
  const borderColor = accent === 'red' ? 'border-red-200' : 'border-gray-200'
  const headerBg = accent === 'red' ? 'bg-red-50/40' : ''
  return (
    <div className={`bg-white rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
      <div className={`px-4 py-3 border-b border-gray-100 flex items-center gap-2 ${headerBg}`}>
        <h2 className="text-[13px] font-semibold text-gray-900 flex-1">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${accent === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
            {count}件
          </span>
        )}
        {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
        {extra}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-xs text-gray-400">{children}</div>
}

function LegendDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-gray-600">{label}</span>
      <span className="font-mono text-gray-500">{count}</span>
    </span>
  )
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'gray' }) {
  const cls = tone === 'red'
    ? 'bg-red-50 border-red-200 text-red-700'
    : tone === 'amber'
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-gray-50 border-gray-200 text-gray-500'
  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 border rounded-md ${cls}`}>
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[14px] font-bold font-mono">{value}</span>
    </div>
  )
}

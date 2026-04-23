import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CASE_STATUSES } from '@/lib/constants'
import { DB_PHASES, getPhaseLabel, getPhaseColor } from '@/lib/phases'
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
  const nextMonth = ym(addMonths(now, 1))
  const twoMonth = ym(addMonths(now, 2))

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
  const monthOrdered = cases.filter(c => c.order_received_date?.startsWith(thisMonth))
  const monthOrderedAmount = monthOrdered.reduce((s, c) => s + (c.total_revenue_estimate ?? c.fee_total ?? 0), 0)
  const monthCompleting = cases.filter(c => {
    const d = c.expected_completion_date ?? c.completion_date
    return d?.startsWith(thisMonth) && c.status !== '失注'
  })
  const monthCompletingAmount = monthCompleting.reduce((s, c) => s + (c.total_revenue_estimate ?? c.fee_total ?? 0), 0)
  const unpaidAmount = invoices.reduce((s, inv) => {
    if (inv.status === '入金済') return s
    const paid = (inv.payments ?? []).reduce((a, p) => a + (p.amount ?? 0), 0)
    return s + Math.max(inv.amount - paid, 0)
  }, 0)

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
  const timelineBuckets = [
    { key: 'this', label: '当月', cases: bucketCases(m => m === thisMonth) },
    { key: 'next', label: '来月', cases: bucketCases(m => m === nextMonth) },
    { key: 'two', label: '再来月', cases: bucketCases(m => m === twoMonth) },
    { key: 'later', label: 'それ以降', cases: bucketCases(m => !!m && m > twoMonth) },
    { key: 'none', label: '未設定', cases: bucketCases(m => !m) },
  ].map(b => ({
    ...b,
    count: b.cases.length,
    amount: b.cases.reduce((s, c) => s + (c.total_revenue_estimate ?? c.fee_total ?? 0), 0),
  }))

  // フェーズ別タスク分布（対応中の案件のみ）
  const activeCaseIds = new Set(activeCases.map(c => c.id))
  const phaseStats = DB_PHASES.map(p => {
    const pt = tasks.filter(t => t.phase === p && activeCaseIds.has(t.case_id))
    const open = pt.filter(t => normTaskStatus(t.status) !== '完了').length
    const done = pt.filter(t => normTaskStatus(t.status) === '完了').length
    return { phase: p, label: getPhaseLabel(p), color: getPhaseColor(p), open, done, total: pt.length }
  })

  // 受注ファネル (当月)
  const monthStart = `${thisMonth}-01`
  const callMonth = cases.filter(c => c.order_date && c.order_date >= monthStart)
  const funnel = [
    { label: '架電案件化', count: callMonth.length, color: '#6B7280' },
    { label: '面談設定済→以降', count: callMonth.filter(c => ['面談設定済', '検討中', '受注', '対応中', '完了'].includes(c.status)).length, color: '#3B82F6' },
    { label: '検討中→以降', count: callMonth.filter(c => ['検討中', '受注', '対応中', '完了'].includes(c.status)).length, color: '#D97706' },
    { label: '受注', count: callMonth.filter(c => ['受注', '対応中', '完了'].includes(c.status)).length, color: '#16A34A' },
  ]
  const funnelMax = Math.max(...funnel.map(f => f.count), 1)

  // 受注ルート別（過去90日）
  const ninetyAgo = ymd(new Date(Date.now() - 90 * 86400000))
  const routeCases = cases.filter(c => c.order_received_date && c.order_received_date >= ninetyAgo)
  const routeMap: Record<string, { count: number; amount: number }> = {}
  routeCases.forEach(c => {
    const r = c.order_route ?? '未設定'
    if (!routeMap[r]) routeMap[r] = { count: 0, amount: 0 }
    routeMap[r].count++
    routeMap[r].amount += c.total_revenue_estimate ?? c.fee_total ?? 0
  })
  const routeStats = Object.entries(routeMap).map(([k, v]) => ({ route: k, ...v })).sort((a, b) => b.amount - a.amount)

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
    { label: '今月受注件数', value: monthOrdered.length, sub: `${thisMonth}`, color: '#2563EB', icon: '🎯' },
    { label: '今月受注金額', value: man(monthOrderedAmount), sub: '総受注額見込', color: '#16A34A', icon: '💰' },
    { label: '今月完了予定', value: `${monthCompleting.length}件`, sub: man(monthCompletingAmount), color: '#D97706', icon: '📅' },
    { label: '未入金額', value: man(unpaidAmount), sub: `請求書 ${invoices.length}件`, color: '#DC2626', icon: '💳' },
  ]

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-xs text-gray-400">{today} ・ 案件 {cases.length}件 / タスク {tasks.length}件</p>
      </div>

      {/* ─── セクション1: 今月サマリー ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500">{k.label}</span>
              <span className="text-[16px]">{k.icon}</span>
            </div>
            <div className="text-[24px] font-extrabold tracking-tight leading-none" style={{ color: k.color }}>
              {k.value}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{k.sub}</div>
          </div>
        ))}
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
            {timelineBuckets.map(b => {
              const max = Math.max(...timelineBuckets.map(x => x.amount), 1)
              const pct = b.amount / max * 100
              return (
                <div key={b.key}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-gray-700">{b.label}</span>
                    <span className="font-mono text-gray-500">{b.count}件 / {man(b.amount)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${pct}%`,
                      backgroundColor: b.key === 'this' ? '#DC2626' : b.key === 'next' ? '#D97706' : b.key === 'two' ? '#2563EB' : b.key === 'later' ? '#6B7280' : '#D1D5DB',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* フェーズ別案件分布 */}
        <Card title="📊 フェーズ別タスク状況" sub="アクティブ案件のみ">
          <div className="px-4 py-3 space-y-2">
            {phaseStats.map(p => {
              const max = Math.max(...phaseStats.map(x => x.total), 1)
              return (
                <div key={p.phase}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="flex items-center gap-1.5 font-medium text-gray-700">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </span>
                    <span className="font-mono text-gray-500">進行{p.open} / 完了{p.done}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: `${(p.done / max) * 100}%`, backgroundColor: '#059669' }} />
                    <div className="h-full" style={{ width: `${(p.open / max) * 100}%`, backgroundColor: p.color, opacity: 0.7 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 受注ファネル */}
        <Card title="🎯 受注ファネル（今月）" sub="架電→面談→検討→受注">
          <div className="px-4 py-3 space-y-2">
            {funnel.map((f, i) => {
              const pct = (f.count / funnelMax) * 100
              const conversion = i > 0 && funnel[i - 1].count > 0
                ? Math.round((f.count / funnel[i - 1].count) * 100) : null
              return (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-gray-700">{f.label}</span>
                    <span className="flex items-center gap-2">
                      {conversion !== null && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          conversion >= 50 ? 'bg-green-50 text-green-700' : conversion >= 25 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                        }`}>↓{conversion}%</span>
                      )}
                      <span className="font-mono text-gray-700 font-bold">{f.count}件</span>
                    </span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: f.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 受注ルート別 */}
        <Card title="📣 受注ルート別内訳" sub="過去90日の受注">
          <div className="px-4 py-3 space-y-2">
            {routeStats.length === 0 ? <Empty>過去90日の受注がありません</Empty> : routeStats.map(r => {
              const max = Math.max(...routeStats.map(x => x.amount), 1)
              return (
                <div key={r.route}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-medium text-gray-700">{r.route}</span>
                    <span className="font-mono text-gray-500">{r.count}件 / {man(r.amount)}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.amount / max) * 100}%` }} />
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
        <Card title="👥 担当者別 負荷" sub="対応中案件・タスク">
          <div className="px-4 py-3 space-y-2">
            {memberLoad.length === 0 ? <Empty>データなし</Empty> : memberLoad.slice(0, 10).map(m => {
              const max = Math.max(...memberLoad.map(x => x.tasks), 1)
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
                    {m.name.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-medium text-gray-700 truncate">{m.name}</span>
                      <span className="font-mono text-gray-500 flex-shrink-0">
                        案件{m.cases} / タスク{m.tasks}
                        {m.overdue > 0 && <span className="ml-1 text-red-600 font-bold">⚠{m.overdue}</span>}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(m.tasks / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
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

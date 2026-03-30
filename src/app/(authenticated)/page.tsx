import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CASE_STATUSES, TASK_STATUSES } from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import Badge from '@/components/ui/Badge'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: caseCount },
    { count: activeTaskCount },
    { count: memberCount },
    { data: recentCases },
    { data: upcomingTasks },
    { count: completedCount },
    { count: reviewingCount },
  ] = await Promise.all([
    supabase.from('cases').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['未着手', '対応中']),
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('cases').select('*, case_members(*, members(*))').order('created_at', { ascending: false }).limit(5),
    supabase.from('tasks').select('*, task_assignees(*, members(*))').in('status', ['未着手', '対応中', 'Wチェック待ち']).not('due_date', 'is', null).order('due_date').limit(8),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('status', '完了'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('status', '検討中'),
  ])

  // Case map for tasks
  const caseIds = [...new Set((upcomingTasks ?? []).map((t: { case_id: string }) => t.case_id))]
  const { data: taskCases } = caseIds.length > 0
    ? await supabase.from('cases').select('id, case_number, deal_name').in('id', caseIds)
    : { data: [] }
  const caseMap: Record<string, { case_number: string; deal_name: string }> = {}
  taskCases?.forEach((c: { id: string; case_number: string; deal_name: string }) => { caseMap[c.id] = c })

  const kpis = [
    { label: '総案件数', value: caseCount ?? 0, icon: '📋', iconBg: '#EFF4FF' },
    { label: '対応中', value: activeTaskCount ?? 0, icon: '⚡', iconBg: '#F5F3FF', color: '#7C3AED' },
    { label: '完了', value: completedCount ?? 0, icon: '✅', iconBg: '#F0FDF4', color: '#059669' },
    { label: '検討中', value: reviewingCount ?? 0, icon: '🕐', iconBg: '#FFFBEB', color: '#D97706' },
    { label: 'メンバー', value: memberCount ?? 0, icon: '👥', iconBg: '#EFF4FF', color: '#2563EB' },
  ]

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-xs text-gray-400">案件とタスクの概況</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-gray-500">{kpi.label}</span>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px]" style={{ backgroundColor: kpi.iconBg }}>
                {kpi.icon}
              </span>
            </div>
            <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: kpi.color ?? '#111827' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent cases */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-gray-900">最近の案件</h2>
            <Link href="/cases" className="text-[11px] text-blue-600 font-medium hover:underline">すべて表示 →</Link>
          </div>
          <div>
            {(recentCases ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">案件がありません</div>
            ) : (
              (recentCases ?? []).map((c: { id: string; case_number: string; deal_name: string; status: string; deceased_name: string | null; case_members: Array<{ role: string; members: { name: string; avatar_color: string } }> }) => {
                const statusDef = CASE_STATUSES.find(s => s.key === c.status)
                const sales = c.case_members?.find((cm: { role: string }) => cm.role === 'sales')?.members
                return (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-gray-400">{c.case_number}</div>
                      <div className="text-sm font-semibold text-gray-900 truncate">{c.deal_name}</div>
                      {c.deceased_name && <div className="text-[10px] text-gray-400">被相続人：{c.deceased_name}</div>}
                    </div>
                    {statusDef && <Badge label={statusDef.key} color={statusDef.color} />}
                    {sales && (
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: sales.avatar_color }}
                      >
                        {sales.name.charAt(0)}
                      </span>
                    )}
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Upcoming tasks */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-gray-900">期限が近いタスク</h2>
            <Link href="/tasks" className="text-[11px] text-blue-600 font-medium hover:underline">すべて表示 →</Link>
          </div>
          <div>
            {(upcomingTasks ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">期限付きタスクがありません</div>
            ) : (
              (upcomingTasks ?? []).map((t: { id: string; title: string; status: string; phase: string; due_date: string | null; priority: string; case_id: string; task_assignees: Array<{ role: string; members: { name: string; avatar_color: string } }> }) => {
                const statusDef = TASK_STATUSES.find(s => s.key === t.status)
                const primary = t.task_assignees?.find((a: { role: string }) => a.role === 'primary')?.members
                const caseInfo = caseMap[t.case_id]
                return (
                  <Link
                    key={t.id}
                    href={`/cases/${t.case_id}`}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                  >
                    <span
                      className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center text-[7px] text-white font-bold"
                      style={{ backgroundColor: statusDef?.color ?? '#6B7280' }}
                    >
                      {t.status === '完了' ? '✓' : ''}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700 truncate">{t.title}</div>
                      {caseInfo && <div className="text-[10px] text-gray-400">{caseInfo.case_number} {caseInfo.deal_name}</div>}
                    </div>
                    {t.priority === '急ぎ' && (
                      <span className="text-[9px] font-semibold text-red-600 bg-red-50 px-1 py-0.5 rounded">🚨</span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono">{t.due_date}</span>
                    {primary && (
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: primary.avatar_color }}
                      >
                        {primary.name.charAt(0)}
                      </span>
                    )}
                  </Link>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

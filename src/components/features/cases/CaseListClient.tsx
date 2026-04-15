'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES } from '@/lib/constants'
import { useModal } from '@/hooks/useModal'
import CreateCaseModal from './CreateCaseModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
import type { CaseRow, MemberRow } from '@/types'

type CaseWithMembers = CaseRow & {
  case_members: Array<{ role: string; members: MemberRow }>
}

type Props = {
  cases: CaseWithMembers[]
  taskCounts: Record<string, { total: number; completed: number }>
  currentMemberId: string | null
  taskAssigneesMap: Record<string, string[]>
  taskDueDatesMap: Record<string, Array<{ due_date: string | null; status: string }>>
}

type ViewMode = 'all' | 'mine' | 'urgent'

const DIFFICULTY_COLORS: Record<string, string> = { '難': '#DC2626', '普': '#D97706', '易': '#059669' }

const VIEW_TABS: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'all', label: 'すべての案件', icon: '📋' },
  { key: 'mine', label: '担当の案件', icon: '👤' },
  { key: 'urgent', label: '至急対応案件', icon: '🚨' },
]

export default function CaseListClient({ cases, taskCounts, currentMemberId, taskAssigneesMap, taskDueDatesMap }: Props) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [displayMode, setDisplayMode] = useState<'list' | 'kanban'>('list')
  const createModal = useModal()
  const [deleteCase, setDeleteCase] = useState<CaseWithMembers | null>(null)

  const handleDeleteCase = async () => {
    if (!deleteCase) return
    const supabase = createClient()
    const { data: tasks } = await supabase.from('tasks').select('id').eq('case_id', deleteCase.id)
    if (tasks) {
      for (const t of tasks) {
        await supabase.from('task_assignees').delete().eq('task_id', t.id)
      }
    }
    await supabase.from('tasks').delete().eq('case_id', deleteCase.id)
    await supabase.from('case_members').delete().eq('case_id', deleteCase.id)
    await supabase.from('documents').delete().eq('case_id', deleteCase.id)
    await supabase.from('events').delete().eq('case_id', deleteCase.id)
    const { data: invoices } = await supabase.from('invoices').select('id').eq('case_id', deleteCase.id)
    if (invoices) {
      for (const inv of invoices) {
        await supabase.from('payments').delete().eq('invoice_id', inv.id)
      }
    }
    await supabase.from('invoices').delete().eq('case_id', deleteCase.id)
    const { error } = await supabase.from('cases').delete().eq('id', deleteCase.id)
    if (error) throw new Error(error.message)
    setDeleteCase(null)
    router.refresh()
  }

  const today = new Date().toISOString().split('T')[0]

  // Apply view filter first
  const viewFiltered = useMemo(() => {
    if (viewMode === 'all') return cases

    if (viewMode === 'mine' && currentMemberId) {
      return cases.filter(c => {
        // Check if user is a case member
        const isCaseMember = c.case_members?.some(cm => cm.members?.id === currentMemberId)
        // Check if user is assigned to any task in this case
        const isTaskAssignee = taskAssigneesMap[c.id]?.includes(currentMemberId)
        return isCaseMember || isTaskAssignee
      })
    }

    if (viewMode === 'urgent') {
      return cases.filter(c => {
        // Skip completed/lost cases
        if (c.status === '完了' || c.status === '失注') return false
        // Check overdue tasks
        const taskDates = taskDueDatesMap[c.id]
        const hasOverdueTask = taskDates?.some(t =>
          t.due_date && t.due_date < today && t.status !== '完了'
        )
        // Check overdue completion date
        const hasOverdueCompletion = c.completion_date && c.completion_date < today
        return hasOverdueTask || hasOverdueCompletion
      })
    }

    return cases
  }, [cases, viewMode, currentMemberId, taskAssigneesMap, taskDueDatesMap, today])

  // Then apply status + search filters
  const filtered = useMemo(() => {
    let result = viewFiltered
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(c =>
        c.deal_name.toLowerCase().includes(q) ||
        c.case_number.toLowerCase().includes(q) ||
        c.deceased_name?.toLowerCase().includes(q) ||
        c.clients?.name?.toLowerCase().includes(q)
      )
    }
    return result
  }, [viewFiltered, statusFilter, search])

  const kpis = useMemo(() => ({
    total: viewFiltered.length,
    active: viewFiltered.filter(c => c.status === '対応中').length,
    reviewing: viewFiltered.filter(c => c.status === '検討中').length,
    ordered: viewFiltered.filter(c => c.status === '受注').length,
    completed: viewFiltered.filter(c => c.status === '完了').length,
  }), [viewFiltered])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">案件管理</h1>
          <p className="text-xs text-gray-400">相続プラットフォーム / 案件管理</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 w-[220px]">
            <span className="text-gray-400 text-xs">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="案件名・依頼者・番号で検索"
              className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400"
            />
          </div>
          <button
            onClick={createModal.open}
            className="px-3.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition-colors"
          >
            ＋ 新規案件登録
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-lg p-1 shadow-sm w-fit">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setViewMode(tab.key); setStatusFilter('all') }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12px] font-medium transition-all ${
              viewMode === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-[13px]">{tab.icon}</span>
            {tab.label}
            {tab.key !== 'all' && (
              <span className={`text-[10px] font-mono ml-0.5 ${
                viewMode === tab.key ? 'opacity-80' : 'opacity-60'
              }`}>
                {tab.key === 'mine'
                  ? cases.filter(c => {
                      if (!currentMemberId) return false
                      const isCaseMember = c.case_members?.some(cm => cm.members?.id === currentMemberId)
                      const isTaskAssignee = taskAssigneesMap[c.id]?.includes(currentMemberId)
                      return isCaseMember || isTaskAssignee
                    }).length
                  : cases.filter(c => {
                      if (c.status === '完了' || c.status === '失注') return false
                      const taskDates = taskDueDatesMap[c.id]
                      const hasOverdueTask = taskDates?.some(t =>
                        t.due_date && t.due_date < today && t.status !== '完了'
                      )
                      const hasOverdueCompletion = c.completion_date && c.completion_date < today
                      return hasOverdueTask || hasOverdueCompletion
                    }).length
                }
              </span>
            )}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <KpiCard label="総案件数" value={kpis.total} icon="📋" iconBg="#EFF4FF" />
        <KpiCard label="対応中" value={kpis.active} icon="⚡" iconBg="#F5F3FF" color="#7C3AED" />
        <KpiCard label="受注" value={kpis.ordered} icon="✅" iconBg="#F0FDF4" color="#059669" />
        <KpiCard label="検討中" value={kpis.reviewing} icon="🕐" iconBg="#FFFBEB" color="#D97706" />
        <KpiCard label="完了" value={kpis.completed} icon="🎉" iconBg="#F0FDF4" color="#059669" />
      </div>

      {/* Toolbar: filter + view toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-0.5 bg-white border border-gray-200 rounded-md p-0.5 shadow-sm">
          <FilterTab label="すべて" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          {CASE_STATUSES.map(s => (
            <FilterTab
              key={s.key}
              label={s.key}
              active={statusFilter === s.key}
              onClick={() => setStatusFilter(s.key)}
              count={viewFiltered.filter(c => c.status === s.key).length}
            />
          ))}
        </div>

        <div className="ml-auto flex gap-0.5 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <button
            onClick={() => setDisplayMode('list')}
            className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${
              displayMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="リスト"
          >☰</button>
          <button
            onClick={() => setDisplayMode('kanban')}
            className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${
              displayMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="カンバン"
          >⊞</button>
        </div>
      </div>

      {/* Content */}
      {displayMode === 'list' ? (
        <ListView filtered={filtered} taskCounts={taskCounts} router={router} onDelete={setDeleteCase} taskDueDatesMap={taskDueDatesMap} viewMode={viewMode} />
      ) : (
        <KanbanView cases={filtered} taskCounts={taskCounts} router={router} />
      )}

      <CreateCaseModal
        isOpen={createModal.isOpen}
        onClose={createModal.close}
        onSaved={() => { router.refresh(); createModal.close() }}
      />

      <DeleteConfirmModal
        isOpen={!!deleteCase}
        onClose={() => setDeleteCase(null)}
        title="案件削除"
        message={`「${deleteCase?.deal_name}」(${deleteCase?.case_number}) を削除しますか？関連するタスク・書類・請求書も全て削除されます。`}
        onConfirm={handleDeleteCase}
      />
    </div>
  )
}

// ─── List View ───
function ListView({ filtered, taskCounts, router, onDelete, taskDueDatesMap, viewMode }: {
  filtered: (CaseRow & { case_members: Array<{ role: string; members: MemberRow }> })[]
  taskCounts: Record<string, { total: number; completed: number }>
  router: ReturnType<typeof useRouter>
  onDelete: (c: CaseRow & { case_members: Array<{ role: string; members: MemberRow }> }) => void
  taskDueDatesMap: Record<string, Array<{ due_date: string | null; status: string }>>
  viewMode: ViewMode
}) {
  const today = new Date().toISOString().split('T')[0]

  // 列幅（リサイズ可能・localStorage保存）
  const { widths, reset, startResize } = useResizableColumns('caseListColWidths', {
    deal: 280, status: 100, difficulty: 70, progress: 110, sales: 150, asset: 120, orderDate: 110, ops: 50,
  })
  const HEADERS: Array<{ key: keyof typeof widths; label: string }> = [
    { key: 'deal', label: '案件' },
    { key: 'status', label: 'ステータス' },
    { key: 'difficulty', label: '難度' },
    { key: 'progress', label: '進捗' },
    { key: 'sales', label: '受注担当' },
    { key: 'asset', label: '資産概算' },
    { key: 'orderDate', label: '依頼日' },
    { key: 'ops', label: '' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-gray-900">案件一覧</h2>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
          {filtered.length}件
        </span>
        <div className="flex-1" />
        <button onClick={reset} title="列幅をデフォルトに戻す"
          className="text-[11px] text-gray-500 hover:text-blue-600 px-2 py-1 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors">
          ↔ 列幅リセット
        </button>
      </div>
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {HEADERS.map(h => <col key={h.key} style={{ width: widths[h.key] }} />)}
        </colgroup>
        <thead>
          <tr>
            {HEADERS.map(h => (
              <th key={h.key} className="relative text-left px-3.5 py-2.5 text-[10px] font-bold text-gray-500 tracking-wider uppercase bg-gray-50 border-b border-gray-200">
                <span className="truncate block">{h.label}</span>
                {h.key !== 'ops' && <ResizeHandle onMouseDown={startResize(h.key)} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">該当する案件がありません</td></tr>
          ) : (
            filtered.map(c => {
              const statusDef = CASE_STATUSES.find(s => s.key === c.status)
              const salesMember = c.case_members?.find(cm => cm.role === 'sales')?.members
              const tc = taskCounts[c.id]
              const pct = tc ? Math.round((tc.completed / tc.total) * 100) : 0

              // Check urgency for highlighting
              const isUrgent = viewMode === 'urgent' || (() => {
                const taskDates = taskDueDatesMap[c.id]
                const hasOverdue = taskDates?.some(t => t.due_date && t.due_date < today && t.status !== '完了')
                const hasOverdueCompletion = c.completion_date && c.completion_date < today && c.status !== '完了' && c.status !== '失注'
                return hasOverdue || hasOverdueCompletion
              })()

              return (
                <tr key={c.id} className={`border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF] cursor-pointer transition-colors ${
                  viewMode === 'urgent' && isUrgent ? 'bg-red-50/30' : ''
                }`} onClick={() => router.push(`/cases/${c.id}`)}>
                  <td className="px-3.5 py-3">
                    <div className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded inline-block mb-1">{c.case_number}</div>
                    <div className="text-[13px] font-semibold text-gray-900">{c.deal_name}</div>
                    {c.deceased_name && <div className="text-[11px] text-gray-400 mt-0.5">被相続人：{c.deceased_name}</div>}
                    {viewMode === 'urgent' && isUrgent && (
                      <div className="text-[10px] text-red-500 font-semibold mt-0.5">⚠ 期限超過あり</div>
                    )}
                  </td>
                  <td className="px-3.5 py-3">{statusDef && <Badge label={statusDef.key} color={statusDef.color} />}</td>
                  <td className="px-3.5 py-3">
                    {c.difficulty && (
                      <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded text-[11px] font-bold font-mono"
                        style={{ backgroundColor: `${DIFFICULTY_COLORS[c.difficulty]}15`, color: DIFFICULTY_COLORS[c.difficulty] }}>{c.difficulty}</span>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    {tc ? (
                      <div className="w-20">
                        <div className="text-[10px] text-gray-400 font-mono mb-1">{tc.completed}/{tc.total}</div>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#059669' : '#2563EB' }} />
                        </div>
                      </div>
                    ) : <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3.5 py-3">
                    {salesMember ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ backgroundColor: salesMember.avatar_color }}>{salesMember.name.charAt(0)}</span>
                        <span className="text-xs font-medium text-gray-700">{salesMember.name}</span>
                      </div>
                    ) : <span className="text-[10px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="text-xs font-mono text-gray-700">{c.total_asset_estimate ? `¥${(c.total_asset_estimate / 10000).toLocaleString()}万` : '—'}</span>
                  </td>
                  <td className="px-3.5 py-3"><span className="text-[11px] font-mono text-gray-400">{c.order_date ?? '—'}</span></td>
                  <td className="px-3.5 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(c) }}
                      className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-300 hover:bg-red-50 hover:text-red-500 transition"
                      title="削除"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Kanban View ───
function KanbanView({ cases, taskCounts, router }: {
  cases: (CaseRow & { case_members: Array<{ role: string; members: MemberRow }> })[]
  taskCounts: Record<string, { total: number; completed: number }>
  router: ReturnType<typeof useRouter>
}) {
  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {CASE_STATUSES.map(status => {
          const columnCases = cases.filter(c => c.status === status.key)
          return (
            <div key={status.key} className="w-[248px] flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 flex items-center gap-2 shadow-sm mb-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
                <span className="text-xs font-semibold text-gray-700 flex-1">{status.key}</span>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{columnCases.length}</span>
              </div>
              <div className="flex flex-col gap-1.5" style={{ minHeight: 60 }}>
                {columnCases.length === 0 ? (
                  <div className="text-center text-[11px] text-gray-300 py-5 border border-dashed border-gray-200 rounded-lg">なし</div>
                ) : (
                  columnCases.map(c => {
                    const salesMember = c.case_members?.find(cm => cm.role === 'sales')?.members
                    const tc = taskCounts[c.id]
                    const pct = tc ? Math.round((tc.completed / tc.total) * 100) : 0
                    return (
                      <div
                        key={c.id}
                        className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all shadow-sm"
                        onClick={() => router.push(`/cases/${c.id}`)}
                      >
                        <div className="text-[9px] font-mono text-gray-400 bg-gray-50 px-1 py-0.5 rounded inline-block mb-1">{c.case_number}</div>
                        <div className="text-xs font-semibold text-gray-900 mb-0.5 leading-tight">{c.deal_name}</div>
                        {c.deceased_name && <div className="text-[10px] text-gray-400 mb-2">被相続人：{c.deceased_name}</div>}
                        <div className="flex gap-1 flex-wrap mb-2">
                          {c.difficulty && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                              style={{ backgroundColor: `${DIFFICULTY_COLORS[c.difficulty]}15`, color: DIFFICULTY_COLORS[c.difficulty] }}>
                              {c.difficulty}
                            </span>
                          )}
                          {c.tax_filing_required === '要' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-50 text-red-600">税要</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          {salesMember ? (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: salesMember.avatar_color }}>
                              {salesMember.name.charAt(0)}
                            </span>
                          ) : <span />}
                          <span className="text-[10px] font-mono text-gray-400">
                            {c.total_asset_estimate ? `¥${(c.total_asset_estimate / 10000).toLocaleString()}万` : ''}
                          </span>
                        </div>
                        {tc && (
                          <div className="w-full h-[3px] bg-gray-100 rounded-full mt-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#059669' : '#2563EB' }} />
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Sub components ───
function KpiCard({ label, value, icon, iconBg, color }: { label: string; value: number; icon: string; iconBg: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-default">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-semibold text-gray-500">{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px]" style={{ backgroundColor: iconBg }}>{icon}</span>
      </div>
      <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: color ?? '#111827' }}>{value}</div>
    </div>
  )
}

function FilterTab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors whitespace-nowrap ${active ? 'bg-blue-600 text-white font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
      {label}
      {count !== undefined && count > 0 && <span className={`ml-1 text-[10px] font-mono ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>}
    </button>
  )
}

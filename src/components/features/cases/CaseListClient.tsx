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
import type { CaseRow, MemberRow } from '@/types'

type CaseWithMembers = CaseRow & {
  case_members: Array<{ role: string; members: MemberRow }>
}

type Props = {
  cases: CaseWithMembers[]
  taskCounts: Record<string, { total: number; completed: number }>
}

const DIFFICULTY_COLORS: Record<string, string> = { '難': '#DC2626', '普': '#D97706', '易': '#059669' }

export default function CaseListClient({ cases, taskCounts }: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const createModal = useModal()
  const [deleteCase, setDeleteCase] = useState<CaseWithMembers | null>(null)

  const handleDeleteCase = async () => {
    if (!deleteCase) return
    const supabase = createClient()
    // Delete related data (tasks, assignees, members, docs, invoices, events)
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
    // Delete invoices and their payments
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

  const filtered = useMemo(() => {
    let result = cases
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
  }, [cases, statusFilter, search])

  const kpis = useMemo(() => ({
    total: cases.length,
    active: cases.filter(c => c.status === '対応中').length,
    reviewing: cases.filter(c => c.status === '検討中').length,
    ordered: cases.filter(c => c.status === '受注').length,
    completed: cases.filter(c => c.status === '完了').length,
  }), [cases])

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
              count={cases.filter(c => c.status === s.key).length}
            />
          ))}
        </div>

        <div className="ml-auto flex gap-0.5 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${
              viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="リスト"
          >☰</button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${
              viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="カンバン"
          >⊞</button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <ListView filtered={filtered} taskCounts={taskCounts} router={router} onDelete={setDeleteCase} />
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
function ListView({ filtered, taskCounts, router, onDelete }: {
  filtered: (CaseRow & { case_members: Array<{ role: string; members: MemberRow }> })[]
  taskCounts: Record<string, { total: number; completed: number }>
  router: ReturnType<typeof useRouter>
  onDelete: (c: CaseRow & { case_members: Array<{ role: string; members: MemberRow }> }) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-gray-900">案件一覧</h2>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
          {filtered.length}件
        </span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['案件', 'ステータス', '難度', '進捗', '受注担当', '資産概算', '依頼日', ''].map(h => (
              <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold text-gray-500 tracking-wider uppercase bg-gray-50 border-b border-gray-200">{h}</th>
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
              return (
                <tr key={c.id} className="border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF] cursor-pointer transition-colors" onClick={() => router.push(`/cases/${c.id}`)}>
                  <td className="px-3.5 py-3">
                    <div className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded inline-block mb-1">{c.case_number}</div>
                    <div className="text-[13px] font-semibold text-gray-900">{c.deal_name}</div>
                    {c.deceased_name && <div className="text-[11px] text-gray-400 mt-0.5">被相続人：{c.deceased_name}</div>}
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
              {/* Column header */}
              <div className="bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 flex items-center gap-2 shadow-sm mb-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
                <span className="text-xs font-semibold text-gray-700 flex-1">{status.key}</span>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{columnCases.length}</span>
              </div>

              {/* Cards */}
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

                        {/* Tags */}
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

                        {/* Footer */}
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

                        {/* Progress bar */}
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

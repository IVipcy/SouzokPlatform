'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from './EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { getPhaseLabel, getPhaseColor, DB_PHASES } from '@/lib/phases'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  caseMap: Record<string, { case_number: string; deal_name: string }>
  allMembers: MemberRow[]
}

export default function TaskListClient({ tasks, caseMap, allMembers }: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('all')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<'status' | 'phase' | 'case'>('status')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')

  // Edit modal state
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  // Delete modal state
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)

  const filtered = useMemo(() => {
    let result = tasks
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter)
    if (phaseFilter !== 'all') result = result.filter(t => t.phase === phaseFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(t => {
        const caseName = caseMap[t.case_id]?.deal_name ?? ''
        return t.title.toLowerCase().includes(q) || caseName.toLowerCase().includes(q)
      })
    }
    return result
  }, [tasks, statusFilter, phaseFilter, search, caseMap])

  const kpis = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter(t => t.status === '未着手').length,
    doing: tasks.filter(t => t.status === '対応中').length,
    wcheck: tasks.filter(t => t.status === 'Wチェック待ち').length,
    done: tasks.filter(t => t.status === '完了').length,
    urgent: tasks.filter(t => t.priority === '急ぎ').length,
  }), [tasks])

  // Phase counts
  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    tasks.forEach(t => { counts[t.phase] = (counts[t.phase] || 0) + 1 })
    return counts
  }, [tasks])

  const groups = useMemo(() => {
    if (groupBy === 'status') {
      return TASK_STATUSES.map(s => ({
        key: s.key, label: s.key, color: s.color,
        tasks: filtered.filter(t => t.status === s.key),
      })).filter(g => g.tasks.length > 0)
    }
    if (groupBy === 'phase') {
      return DB_PHASES.map(p => ({
        key: p, label: getPhaseLabel(p), color: getPhaseColor(p),
        tasks: filtered.filter(t => t.phase === p),
      })).filter(g => g.tasks.length > 0)
    }
    const caseIds = [...new Set(filtered.map(t => t.case_id))]
    return caseIds.map(cid => ({
      key: cid,
      label: caseMap[cid] ? `${caseMap[cid].case_number} ${caseMap[cid].deal_name}` : cid,
      color: '#2563EB',
      tasks: filtered.filter(t => t.case_id === cid),
    }))
  }, [filtered, groupBy, caseMap])

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteTask) return
    const supabase = createClient()
    await supabase.from('task_assignees').delete().eq('task_id', deleteTask.id)
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTask.id)
    if (error) throw new Error(error.message)
    setDeleteTask(null)
    router.refresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">タスク管理</h1>
          <p className="text-xs text-gray-400">相続プラットフォーム / タスク管理</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 w-[220px]">
            <span className="text-gray-400 text-xs">🔍</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="タスク名・案件名で検索"
              className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400" />
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <SummaryCard label="全タスク" value={kpis.total} sub="担当タスク" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <SummaryCard label="未着手" value={kpis.todo} sub="着手待ち" color="#6B7280" active={statusFilter === '未着手'} onClick={() => setStatusFilter('未着手')} />
        <SummaryCard label="対応中" value={kpis.doing} sub="進行中" color="#2563EB" active={statusFilter === '対応中'} onClick={() => setStatusFilter('対応中')} />
        <SummaryCard label="Wチェック待ち" value={kpis.wcheck} sub="確認依頼中" color="#7C3AED" active={statusFilter === 'Wチェック待ち'} onClick={() => setStatusFilter('Wチェック待ち')} />
        <SummaryCard label="完了" value={kpis.done} sub="完了済み" color="#059669" active={statusFilter === '完了'} onClick={() => setStatusFilter('完了')} />
        <SummaryCard label="🚨 急ぎ" value={kpis.urgent} sub="優先対応" color="#DC2626" active={false} onClick={() => {}} />
      </div>

      {/* Layout: phase panel + task area */}
      <div className="flex gap-4">
        {/* Phase panel (left sidebar) */}
        <div className="w-[180px] flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden sticky top-4">
            <div className="px-3 py-2.5 border-b border-gray-100 text-[11px] font-bold text-gray-500 tracking-wider">📂 フェーズ別</div>
            <div className="p-1.5">
              <PhaseItem label="すべて" count={tasks.length} active={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')} color="#6B7280" />
              {DB_PHASES.map(p => (
                <PhaseItem
                  key={p}
                  label={getPhaseLabel(p).replace(/Phase\d+:\s*/, '')}
                  count={phaseCounts[p] ?? 0}
                  active={phaseFilter === p}
                  onClick={() => setPhaseFilter(p)}
                  color={getPhaseColor(p)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Task area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex gap-0.5 bg-white border border-gray-200 rounded-md p-0.5 shadow-sm">
              <GroupTab label="ステータス別" active={groupBy === 'status'} onClick={() => setGroupBy('status')} />
              <GroupTab label="フェーズ別" active={groupBy === 'phase'} onClick={() => setGroupBy('phase')} />
              <GroupTab label="案件別" active={groupBy === 'case'} onClick={() => setGroupBy('case')} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400 font-mono">{filtered.length}件</span>
              <div className="flex gap-0.5 bg-gray-50 border border-gray-200 rounded-md p-0.5">
                <button onClick={() => setViewMode('list')}
                  className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="リスト">☰</button>
                <button onClick={() => setViewMode('kanban')}
                  className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="カンバン">⊞</button>
              </div>
            </div>
          </div>

          {/* Content */}
          {viewMode === 'list' ? (
            <div className="space-y-3">
              {groups.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">該当するタスクがありません</div>
              ) : (
                groups.map(group => (
                  <div key={group.key} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                      <h3 className="text-[13px] font-semibold text-gray-900 flex-1">{group.label}</h3>
                      <span className="text-[10px] font-mono text-gray-400">{group.tasks.length}件</span>
                    </div>
                    <div>
                      {group.tasks.map(task => (
                        <TaskRowItem
                          key={task.id}
                          task={task}
                          caseMap={caseMap}
                          onEdit={() => setEditTask(task)}
                          onDelete={() => setDeleteTask(task)}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <TaskKanban tasks={filtered} caseMap={caseMap} onStatusChange={handleStatusChange} onEdit={setEditTask} onDelete={setDeleteTask} />
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editTask && (
        <EditTaskModal
          isOpen={!!editTask}
          onClose={() => setEditTask(null)}
          task={editTask}
          allMembers={allMembers}
          onSaved={() => { setEditTask(null); router.refresh() }}
        />
      )}

      {/* Delete Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTask}
        onClose={() => setDeleteTask(null)}
        title="タスク削除"
        message={`「${deleteTask?.title}」を削除しますか？この操作は取り消せません。`}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Task Kanban ───
function TaskKanban({ tasks, caseMap, onStatusChange, onEdit, onDelete }: {
  tasks: TaskRow[]
  caseMap: Record<string, { case_number: string; deal_name: string }>
  onStatusChange: (taskId: string, status: string) => void
  onEdit: (task: TaskRow) => void
  onDelete: (task: TaskRow) => void
}) {
  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {TASK_STATUSES.map(status => {
          const columnTasks = tasks.filter(t => t.status === status.key)
          return (
            <div key={status.key} className="w-[240px] flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-2 shadow-sm mb-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
                <span className="text-xs font-semibold flex-1">{status.key}</span>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{columnTasks.length}</span>
              </div>
              <div className="flex flex-col gap-1.5" style={{ minHeight: 80 }}>
                {columnTasks.length === 0 ? (
                  <div className="text-center text-[11px] text-gray-300 py-5 border border-dashed border-gray-200 rounded-lg">なし</div>
                ) : (
                  columnTasks.map(task => {
                    const caseInfo = caseMap[task.case_id]
                    const primary = task.task_assignees?.find(a => a.role === 'primary')
                    return (
                      <div key={task.id}
                        className={`bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all shadow-sm ${
                          task.priority === '急ぎ' ? 'border-l-[3px] border-l-red-500' : task.priority === '外出タスク' ? 'border-l-[3px] border-l-orange-500' : ''
                        }`}
                        onClick={() => onEdit(task)}
                      >
                        <div className={`text-xs font-semibold mb-1 leading-tight ${task.status === '完了' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</div>
                        {caseInfo && <div className="text-[10px] text-gray-400 mb-1.5">{caseInfo.case_number} {caseInfo.deal_name}</div>}
                        <div className="flex items-center gap-1 flex-wrap mb-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ backgroundColor: `${getPhaseColor(task.phase)}15`, color: getPhaseColor(task.phase) }}>
                            {getPhaseLabel(task.phase).replace(/Phase\d+:\s*/, '')}
                          </span>
                          {task.category && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">{task.category}</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          {primary?.members ? (
                            <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: primary.members.avatar_color }}>{primary.members.name.charAt(0)}</span>
                          ) : <span />}
                          <div className="flex items-center gap-1">
                            {task.due_date && <span className="text-[10px] font-mono text-gray-400">{task.due_date}</span>}
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(task) }}
                              className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                              title="削除"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
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
function TaskRowItem({ task, caseMap, onEdit, onDelete, onStatusChange }: {
  task: TaskRow
  caseMap: Record<string, { case_number: string; deal_name: string }>
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (taskId: string, status: string) => void
}) {
  const statusDef = TASK_STATUSES.find(s => s.key === task.status)
  const caseInfo = caseMap[task.case_id]
  const primary = task.task_assignees?.find(a => a.role === 'primary')

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 group">
      {/* Status select */}
      <select
        value={task.status}
        onChange={(e) => { e.stopPropagation(); onStatusChange(task.id, e.target.value) }}
        className="w-4 h-4 rounded flex-shrink-0 appearance-none cursor-pointer border-none outline-none p-0"
        style={{ backgroundColor: statusDef?.color ?? '#6B7280', color: 'transparent', WebkitAppearance: 'none' }}
        title={`ステータス: ${task.status}`}
      >
        {TASK_STATUSES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
      </select>

      {/* Clickable area for edit */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className={`text-sm font-medium truncate ${task.status === '完了' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{task.title}</div>
        {caseInfo && <div className="text-[10px] text-gray-400 truncate">{caseInfo.case_number} {caseInfo.deal_name}</div>}
      </div>
      <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{getPhaseLabel(task.phase)}</span>
      {task.priority === '急ぎ' && <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">🚨 急ぎ</span>}
      {task.priority === '外出タスク' && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">🚗 外出</span>}
      {statusDef && <Badge label={statusDef.key} color={statusDef.color} />}
      {task.due_date && <span className="text-[10px] text-gray-400 font-mono min-w-[64px] text-right">{task.due_date}</span>}
      {primary?.members && (
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: primary.members.avatar_color }} title={primary.members.name}>
          {primary.members.name.charAt(0)}
        </span>
      )}
      {/* Action buttons - visible on hover */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition"
          title="編集"
        >
          ✏️
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
          title="削除"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function PhaseItem({ label, count, active, onClick, color }: { label: string; count: number; active: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
        active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
      }`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-[10px] font-mono text-gray-400">{count}</span>
    </button>
  )
}

function SummaryCard({ label, value, sub, color, active, onClick }: { label: string; value: number; sub: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`bg-white border rounded-xl p-3.5 text-left shadow-sm hover:shadow-md transition-all cursor-pointer ${active ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      <div className="text-[22px] font-extrabold tracking-tight leading-none mb-0.5" style={{ color: color ?? '#111827' }}>{value}</div>
      <div className="text-[10px] text-gray-400">{sub}</div>
    </button>
  )
}

function GroupTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${active ? 'bg-blue-600 text-white font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
      {label}
    </button>
  )
}

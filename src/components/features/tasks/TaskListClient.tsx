'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from './EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { getPhaseLabel, getPhaseColor, DB_PHASES } from '@/lib/phases'
import { useCurrentMember } from '@/lib/useCurrentMember'
import type { TaskRow, MemberRow } from '@/types'

type CaseMemberInfo = { id: string; name: string; avatar_color: string }
type CaseInfo = {
  case_number: string
  deal_name: string
  sales?: CaseMemberInfo
  manager?: CaseMemberInfo
}

type Props = {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  currentMemberId: string | null
}

export default function TaskListClient({ tasks, caseMap, allMembers, currentMemberId: serverMemberId }: Props) {
  const router = useRouter()
  const currentMemberId = useCurrentMember(serverMemberId)
  const [statusFilter, setStatusFilter] = useState('all')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'available' | 'mine'>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<'status' | 'phase' | 'case'>('status')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)
  const [dueDateSort, setDueDateSort] = useState<'none' | 'asc' | 'desc'>('none')

  const today = new Date().toISOString().split('T')[0]

  const filtered = useMemo(() => {
    let result = tasks
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter)
    if (phaseFilter !== 'all') result = result.filter(t => t.phase === phaseFilter)
    if (assigneeFilter === 'available') {
      result = result.filter(t => t.status === '未着手' && !t.started_by)
    }
    if (assigneeFilter === 'mine' && currentMemberId) {
      result = result.filter(t => t.started_by === currentMemberId)
    }
    if (overdueOnly) {
      result = result.filter(t => t.due_date && t.due_date < today && t.status !== '完了')
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(t => {
        const caseName = caseMap[t.case_id]?.deal_name ?? ''
        return t.title.toLowerCase().includes(q) || caseName.toLowerCase().includes(q)
      })
    }
    return result
  }, [tasks, statusFilter, phaseFilter, assigneeFilter, overdueOnly, search, caseMap, currentMemberId, today])

  const kpis = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter(t => t.status === '未着手').length,
    doing: tasks.filter(t => t.status === '対応中').length,
    done: tasks.filter(t => t.status === '完了').length,
    urgent: tasks.filter(t => t.priority === '急ぎ').length,
    available: tasks.filter(t => t.status === '未着手' && !t.started_by).length,
  }), [tasks])

  const sortTasks = (arr: TaskRow[]) => {
    if (dueDateSort === 'none') return arr
    return [...arr].sort((a, b) => {
      const da = a.due_date ?? '9999-12-31'
      const db = b.due_date ?? '9999-12-31'
      return dueDateSort === 'asc' ? da.localeCompare(db) : db.localeCompare(da)
    })
  }

  const groups = useMemo(() => {
    if (groupBy === 'status') {
      return TASK_STATUSES.map(s => ({ key: s.key, label: s.key, color: s.color, tasks: sortTasks(filtered.filter(t => t.status === s.key)) })).filter(g => g.tasks.length > 0)
    }
    if (groupBy === 'phase') {
      return DB_PHASES.map(p => ({ key: p, label: getPhaseLabel(p), color: getPhaseColor(p), tasks: sortTasks(filtered.filter(t => t.phase === p)) })).filter(g => g.tasks.length > 0)
    }
    const caseIds = [...new Set(filtered.map(t => t.case_id))]
    return caseIds.map(cid => ({
      key: cid, label: caseMap[cid] ? `${caseMap[cid].case_number} ${caseMap[cid].deal_name}` : cid, color: '#2563EB',
      tasks: sortTasks(filtered.filter(t => t.case_id === cid)),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy, caseMap, dueDateSort])

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    router.refresh()
  }

  // 着手する
  const handleStart = async (task: TaskRow) => {
    if (!currentMemberId) {
      console.error('[handleStart] currentMemberId is null - ボタン無効')
      alert('ログインユーザーのメンバー情報が取得できませんでした。ブラウザのコンソール(F12)を確認してください。')
      return
    }
    const supabase = createClient()
    const { error: updateError } = await supabase.from('tasks').update({
      status: '対応中',
      started_by: currentMemberId,
      started_at: new Date().toISOString(),
    }).eq('id', task.id)
    if (updateError) {
      console.error('[handleStart] タスク更新エラー:', updateError)
      alert(`タスク更新エラー: ${updateError.message}`)
      return
    }
    // 活動履歴に記録
    const { error: activityError } = await supabase.from('case_activities').insert({
      case_id: task.case_id,
      task_id: task.id,
      member_id: currentMemberId,
      activity_type: 'task_started',
      description: `${task.title} に着手`,
      activity_date: new Date().toISOString().split('T')[0],
    })
    if (activityError) {
      console.error('[handleStart] 活動履歴エラー:', activityError)
    }
    router.refresh()
  }

  // 完了にする
  const handleComplete = async (task: TaskRow) => {
    const supabase = createClient()
    await supabase.from('tasks').update({ status: '完了' }).eq('id', task.id)
    // 活動履歴に記録
    if (currentMemberId) {
      await supabase.from('case_activities').insert({
        case_id: task.case_id,
        task_id: task.id,
        member_id: currentMemberId,
        activity_type: 'task_completed',
        description: `${task.title} を完了`,
        activity_date: new Date().toISOString().split('T')[0],
      })
    }
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deleteTask) return
    const supabase = createClient()
    await supabase.from('task_assignees').delete().eq('task_id', deleteTask.id)
    await supabase.from('tasks').delete().eq('id', deleteTask.id)
    setDeleteTask(null)
    router.refresh()
  }

  const overdueCount = tasks.filter(t => t.due_date && t.due_date < today && t.status !== '完了').length
  const myTaskCount = currentMemberId ? tasks.filter(t => t.started_by === currentMemberId && t.status !== '完了').length : 0

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
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="タスク名・案件名で検索"
              className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400" />
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <SummaryCard label="全タスク" value={kpis.total} sub="すべて" active={statusFilter === 'all' && assigneeFilter === 'all'} onClick={() => { setStatusFilter('all'); setOverdueOnly(false); setAssigneeFilter('all') }} />
        <SummaryCard label="着手可能" value={kpis.available} sub="今すぐ着手できる" color="#16A34A" active={assigneeFilter === 'available'} onClick={() => { setAssigneeFilter(v => v === 'available' ? 'all' : 'available'); setStatusFilter('all'); setOverdueOnly(false) }} />
        <SummaryCard label="未着手" value={kpis.todo} sub="着手待ち" color="#6B7280" active={statusFilter === '未着手'} onClick={() => { setStatusFilter('未着手'); setOverdueOnly(false); setAssigneeFilter('all') }} />
        <SummaryCard label="対応中" value={kpis.doing} sub="進行中" color="#2563EB" active={statusFilter === '対応中'} onClick={() => { setStatusFilter('対応中'); setOverdueOnly(false); setAssigneeFilter('all') }} />
        <SummaryCard label="完了" value={kpis.done} sub="完了済み" color="#059669" active={statusFilter === '完了'} onClick={() => { setStatusFilter('完了'); setOverdueOnly(false); setAssigneeFilter('all') }} />
        <SummaryCard label="🚨 急ぎ" value={kpis.urgent} sub="優先対応" color="#DC2626" active={false} onClick={() => {}} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-gray-400">フェーズ:</span>
          <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)}
            className="text-[11px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-blue-400">
            <option value="all">すべて</option>
            {DB_PHASES.map(p => <option key={p} value={p}>{getPhaseLabel(p)}</option>)}
          </select>
        </div>
        <button onClick={() => setAssigneeFilter(v => v === 'mine' ? 'all' : 'mine')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${assigneeFilter === 'mine' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          👤 自分が着手中 {myTaskCount > 0 && <span className="text-[10px] font-mono opacity-80">{myTaskCount}</span>}
        </button>
        <button onClick={() => setOverdueOnly(v => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${overdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          ⚠️ 期限超過 {overdueCount > 0 && <span className="text-[10px] font-mono opacity-80">{overdueCount}</span>}
        </button>
        <div className="flex-1" />
        <div className="flex gap-0.5 bg-white border border-gray-200 rounded-md p-0.5 shadow-sm">
          <GroupTab label="ステータス別" active={groupBy === 'status'} onClick={() => setGroupBy('status')} />
          <GroupTab label="フェーズ別" active={groupBy === 'phase'} onClick={() => setGroupBy('phase')} />
          <GroupTab label="案件別" active={groupBy === 'case'} onClick={() => setGroupBy('case')} />
        </div>
        <span className="text-xs text-gray-400 font-mono">{filtered.length}件</span>
        <div className="flex gap-0.5 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <button onClick={() => setViewMode('list')} className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="リスト">☰</button>
          <button onClick={() => setViewMode('kanban')} className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="カンバン">⊞</button>
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
                {/* Table header */}
                <div className="grid grid-cols-[minmax(120px,2fr)_minmax(100px,1.5fr)_80px_120px_120px_85px_70px] gap-0 px-4 py-1.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <div>タスク名</div>
                  <div>案件</div>
                  <div>ステータス</div>
                  <div>案件担当者</div>
                  <div>着手者</div>
                  <button
                    onClick={() => setDueDateSort(v => v === 'none' ? 'asc' : v === 'asc' ? 'desc' : 'none')}
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    期限
                    <span className="text-[9px]">
                      {dueDateSort === 'asc' ? '▲' : dueDateSort === 'desc' ? '▼' : '⇅'}
                    </span>
                  </button>
                  <div>アクション</div>
                </div>
                <div>
                  {group.tasks.map(task => (
                    <TaskTableRow
                      key={task.id}
                      task={task}
                      caseMap={caseMap}
                      onEdit={() => setEditTask(task)}
                      onDelete={() => setDeleteTask(task)}
                      onStatusChange={handleStatusChange}
                      onStart={() => handleStart(task)}
                      onComplete={() => handleComplete(task)}
                      today={today}
                      allMembers={allMembers}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <TaskKanban tasks={filtered} caseMap={caseMap} allMembers={allMembers} onStatusChange={handleStatusChange} onStart={handleStart} onComplete={handleComplete} onDelete={setDeleteTask} today={today} />
      )}

      {editTask && (
        <EditTaskModal isOpen={!!editTask} onClose={() => setEditTask(null)} task={editTask} caseMap={caseMap} allMembers={allMembers}
          onSaved={() => { setEditTask(null); router.refresh() }} />
      )}
      <DeleteConfirmModal isOpen={!!deleteTask} onClose={() => setDeleteTask(null)} title="タスク削除"
        message={`「${deleteTask?.title}」を削除しますか？この操作は取り消せません。`} onConfirm={handleDelete} />
    </div>
  )
}

// ─── Table Row ───
function TaskTableRow({ task, caseMap, onEdit, onDelete, onStatusChange, onStart, onComplete, today, allMembers }: {
  task: TaskRow; caseMap: Record<string, CaseInfo>
  onEdit: () => void; onDelete: () => void; onStatusChange: (taskId: string, status: string) => void
  onStart: () => void; onComplete: () => void; today: string; allMembers: MemberRow[]
}) {
  const statusDef = TASK_STATUSES.find(s => s.key === task.status)
  const caseInfo = caseMap[task.case_id]
  const isOverdue = task.due_date && task.due_date < today && task.status !== '完了'
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null

  return (
    <div className={`grid grid-cols-[minmax(120px,2fr)_minmax(100px,1.5fr)_80px_120px_120px_85px_70px] gap-0 items-center px-4 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors group ${isOverdue ? 'bg-red-50/30' : ''}`}>
      {/* Task name */}
      <div className="min-w-0 pr-2">
        <a href={`/tasks/${task.id}`} className={`text-[13px] font-medium truncate block ${task.status === '完了' ? 'text-gray-400 line-through' : 'text-gray-800 hover:text-blue-600'}`}>{task.title}</a>
      </div>

      {/* Case link */}
      <div className="min-w-0">
        {caseInfo ? (
          <a href={`/cases/${task.case_id}`} onClick={e => e.stopPropagation()} className="group/link block">
            <div className="text-[11px] font-mono text-gray-400 truncate">{caseInfo.case_number}</div>
            <div className="text-[11px] text-gray-500 truncate group-hover/link:text-blue-600 group-hover/link:underline transition-colors">{caseInfo.deal_name}</div>
          </a>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </div>

      {/* Status */}
      <div>
        {statusDef && <Badge label={statusDef.key} color={statusDef.color} />}
      </div>

      {/* Case members: 受注担当 + 管理担当 */}
      <div className="flex items-center gap-1.5">
        {caseInfo?.sales ? (
          <MemberChip name={caseInfo.sales.name} color={caseInfo.sales.avatar_color} label="受注" />
        ) : (
          <span className="text-[9px] text-gray-300">—</span>
        )}
        {caseInfo?.manager && (
          <MemberChip name={caseInfo.manager.name} color={caseInfo.manager.avatar_color} label="管理" />
        )}
      </div>

      {/* 着手者 */}
      <div className="flex items-center gap-1">
        {startedMember ? (
          <MemberChip name={startedMember.name} color={startedMember.avatar_color} label="着手" />
        ) : (
          task.status === '未着手' ? (
            <button
              onClick={e => { e.stopPropagation(); onStart() }}
              className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded hover:bg-green-100 transition-colors"
            >
              ▶ 着手する
            </button>
          ) : (
            <span className="text-[9px] text-gray-300">—</span>
          )
        )}
      </div>

      {/* Due date */}
      <div>
        {task.due_date ? (
          <span className={`text-[11px] font-mono ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
            {isOverdue && '⚠ '}{task.due_date}
          </span>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.status === '対応中' && (
          <button onClick={onComplete} className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-400 hover:bg-green-50 hover:text-green-600 transition" title="完了にする">✅</button>
        )}
        <button onClick={onDelete} className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition" title="削除">🗑</button>
      </div>
    </div>
  )
}

function MemberChip({ name, color, label }: { name: string; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${label}: ${name}`}>
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0" style={{ backgroundColor: color }}>
        {name.charAt(0)}
      </span>
      <span className="text-[10px] text-gray-600 font-medium truncate max-w-[50px]">{name}</span>
    </span>
  )
}

// ─── Task Kanban ───
function TaskKanban({ tasks, caseMap, allMembers, onStatusChange, onStart, onComplete, onDelete, today }: {
  tasks: TaskRow[]; caseMap: Record<string, CaseInfo>; allMembers: MemberRow[]
  onStatusChange: (taskId: string, status: string) => void
  onStart: (task: TaskRow) => void; onComplete: (task: TaskRow) => void
  onDelete: (task: TaskRow) => void; today: string
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
                ) : columnTasks.map(task => {
                  const caseInfo = caseMap[task.case_id]
                  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null
                  const isOverdue = task.due_date && task.due_date < today && task.status !== '完了'
                  return (
                    <div key={task.id} className={`bg-white border border-gray-200 rounded-lg p-3 shadow-sm ${task.priority === '急ぎ' ? 'border-l-[3px] border-l-red-500' : ''}`}>
                      <a href={`/tasks/${task.id}`} className={`block text-xs font-semibold mb-1 leading-tight cursor-pointer hover:text-blue-600 ${task.status === '完了' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</a>
                      {caseInfo && <div className="text-[10px] text-gray-400 mb-1.5">{caseInfo.case_number} {caseInfo.deal_name}</div>}
                      <div className="flex items-center justify-between">
                        {startedMember ? (
                          <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: startedMember.avatar_color }} title={startedMember.name}>{startedMember.name.charAt(0)}</span>
                        ) : task.status === '未着手' ? (
                          <button
                            onClick={() => onStart(task)}
                            className="text-[9px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded hover:bg-green-100 transition-colors"
                          >
                            ▶ 着手
                          </button>
                        ) : (
                          <span className="text-[9px] text-gray-300">—</span>
                        )}
                        <div className="flex items-center gap-1">
                          {task.due_date && <span className={`text-[10px] font-mono ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{task.due_date}</span>}
                          {task.status === '対応中' && (
                            <button onClick={() => onComplete(task)} className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-300 hover:text-green-600 hover:bg-green-50 transition" title="完了">✅</button>
                          )}
                          <button onClick={() => onDelete(task)} className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-300 hover:text-red-500 hover:bg-red-50 transition" title="削除">🗑</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Sub components ───
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
  return <button onClick={onClick} className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${active ? 'bg-blue-600 text-white font-semibold' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>{label}</button>
}

'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from './EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { getPhaseLabel, getPhaseColor, DB_PHASES } from '@/lib/phases'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { showToast } from '@/components/ui/Toast'
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
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'mine'>('all')
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<'status' | 'phase' | 'case'>('status')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)
  const [dueDateSort, setDueDateSort] = useState<'none' | 'asc' | 'desc'>('none')

  const today = new Date().toISOString().split('T')[0]

  // ステータス正規化: 旧ステータスを新3段階に変換
  const normalizeStatus = (status: string) => {
    if (status === '未着手') return '着手前'
    if (['Wチェック待ち', '差戻し', '保留'].includes(status)) return '対応中'
    if (status === 'キャンセル') return '完了'
    return status // 着手前, 対応中, 完了 はそのまま
  }

  const filtered = useMemo(() => {
    let result = tasks
    if (statusFilter !== 'all') result = result.filter(t => normalizeStatus(t.status) === statusFilter)
    if (phaseFilter !== 'all') result = result.filter(t => t.phase === phaseFilter)
    if (assigneeFilter === 'mine' && currentMemberId) {
      result = result.filter(t => t.started_by === currentMemberId)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(t => {
        const caseName = caseMap[t.case_id]?.deal_name ?? ''
        return t.title.toLowerCase().includes(q) || caseName.toLowerCase().includes(q)
      })
    }
    return result
  }, [tasks, statusFilter, phaseFilter, assigneeFilter, search, caseMap, currentMemberId, today])

  const kpis = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter(t => normalizeStatus(t.status) === '着手前').length,
    doing: tasks.filter(t => normalizeStatus(t.status) === '対応中').length,
    done: tasks.filter(t => normalizeStatus(t.status) === '完了').length,
    urgent: tasks.filter(t => t.priority === '急ぎ').length,
  }), [tasks])

  // 🚨 要対応タスク（期限超過 or 急ぎ、完了以外）— フィルター連動
  const alertTasks = useMemo(() => {
    return tasks.filter(t => {
      const s = normalizeStatus(t.status)
      if (s === '完了') return false
      // ステータスフィルター連動
      if (statusFilter !== 'all' && s !== statusFilter) return false
      // フェーズフィルター連動
      if (phaseFilter !== 'all' && t.phase !== phaseFilter) return false
      // 自分が着手中フィルター連動
      if (assigneeFilter === 'mine' && currentMemberId && t.started_by !== currentMemberId) return false
      const isOverdue = t.due_date && t.due_date < today
      const isUrgent = t.priority === '急ぎ'
      return isOverdue || isUrgent
    })
  }, [tasks, today, statusFilter, phaseFilter, assigneeFilter, currentMemberId])

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
      return TASK_STATUSES.map(s => ({ key: s.key, label: s.key, color: s.color, tasks: sortTasks(filtered.filter(t => normalizeStatus(t.status) === s.key)) })).filter(g => g.tasks.length > 0)
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

  // ─── ステータス進行ボタン ───
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null)

  const handleAdvance = useCallback(async (task: TaskRow) => {
    const current = normalizeStatus(task.status)
    if (current === '完了') return
    if (loadingTaskId) return // 連打防止

    setLoadingTaskId(task.id)

    try {
      const supabase = createClient()
      const memberId = currentMemberId

      if (current === '着手前') {
        const updates: Record<string, unknown> = { status: '対応中' }
        if (memberId) {
          updates.started_by = memberId
          updates.started_at = new Date().toISOString()
        }
        const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
        if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
        if (memberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id, task_id: task.id, member_id: memberId,
            activity_type: 'task_started',
            description: `${task.title} に着手`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast(`「${task.title}」に着手しました`)
      } else {
        const { error } = await supabase.from('tasks').update({ status: '完了' }).eq('id', task.id)
        if (error) { showToast(`エラー: ${error.message}`, 'error'); return }
        if (memberId) {
          await supabase.from('case_activities').insert({
            case_id: task.case_id, task_id: task.id, member_id: memberId,
            activity_type: 'task_completed',
            description: `${task.title} を完了`,
            activity_date: new Date().toISOString().split('T')[0],
          })
        }
        showToast(`「${task.title}」を完了しました`)
      }
      router.refresh()
    } catch {
      showToast('通信エラーが発生しました', 'error')
    } finally {
      setLoadingTaskId(null)
    }
  }, [currentMemberId, loadingTaskId, router])

  const handleDelete = async () => {
    if (!deleteTask) return
    const supabase = createClient()
    await supabase.from('task_assignees').delete().eq('task_id', deleteTask.id)
    await supabase.from('tasks').delete().eq('id', deleteTask.id)
    setDeleteTask(null)
    router.refresh()
  }

  const myTaskCount = currentMemberId ? tasks.filter(t => t.started_by === currentMemberId && normalizeStatus(t.status) !== '完了').length : 0

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
      <div className="grid grid-cols-4 gap-3 mb-4">
        <SummaryCard label="全タスク" value={kpis.total} sub="すべて" active={statusFilter === 'all' && assigneeFilter === 'all'} onClick={() => { setStatusFilter('all'); setAssigneeFilter('all'); setGroupBy('status') }} />
        <SummaryCard label="着手前" value={kpis.todo} sub="着手待ち" color="#6B7280" active={statusFilter === '着手前'} onClick={() => { setStatusFilter('着手前'); setAssigneeFilter('all'); setGroupBy('phase') }} />
        <SummaryCard label="対応中" value={kpis.doing} sub="進行中" color="#2563EB" active={statusFilter === '対応中'} onClick={() => { setStatusFilter('対応中'); setAssigneeFilter('all'); setGroupBy('phase') }} />
        <SummaryCard label="完了" value={kpis.done} sub="完了済み" color="#059669" active={statusFilter === '完了'} onClick={() => { setStatusFilter('完了'); setAssigneeFilter('all'); setGroupBy('phase') }} />
      </div>

      {/* Filter bar — 要対応セクションの上 */}
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
        <div className="flex-1" />
        <div className="flex gap-0.5 bg-white border border-gray-200 rounded-md p-0.5 shadow-sm">
          {statusFilter === 'all' && <GroupTab label="ステータス別" active={groupBy === 'status'} onClick={() => setGroupBy('status')} />}
          <GroupTab label="フェーズ別" active={groupBy === 'phase'} onClick={() => setGroupBy('phase')} />
          <GroupTab label="案件別" active={groupBy === 'case'} onClick={() => setGroupBy('case')} />
        </div>
        <span className="text-xs text-gray-400 font-mono">{filtered.length}件</span>
        <div className="flex gap-0.5 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <button onClick={() => setViewMode('list')} className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="リスト">☰</button>
          <button onClick={() => setViewMode('kanban')} className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${viewMode === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="カンバン">⊞</button>
        </div>
      </div>

      {/* 🚨 要対応セクション — フィルター連動 */}
      {alertTasks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-red-200 flex items-center gap-2 bg-red-100/60">
            <span className="text-sm">🚨</span>
            <h3 className="text-[13px] font-bold text-red-800 flex-1">要対応（期限超過・急ぎ）</h3>
            <span className="text-[10px] font-mono text-red-600 bg-red-200 px-1.5 py-0.5 rounded">{alertTasks.length}件</span>
          </div>
          <div className="grid grid-cols-[minmax(120px,2fr)_minmax(100px,1.5fr)_100px_120px_120px_85px_70px] gap-0 px-4 py-1.5 bg-red-50 border-b border-red-200 text-[10px] font-bold text-red-400 uppercase tracking-wider">
            <div>タスク名</div>
            <div>案件</div>
            <div>進行</div>
            <div>案件担当者</div>
            <div>着手者</div>
            <div>期限</div>
            <div>理由</div>
          </div>
          {alertTasks.map(task => (
            <AlertTaskRow
              key={task.id}
              task={task}
              caseMap={caseMap}
              allMembers={allMembers}
              onAdvance={() => handleAdvance(task)}
              loading={loadingTaskId === task.id}
              today={today}
            />
          ))}
        </div>
      )}

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
                <div className="grid grid-cols-[minmax(120px,2fr)_minmax(100px,1.5fr)_100px_120px_120px_85px_70px] gap-0 px-4 py-1.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <div>タスク名</div>
                  <div>案件</div>
                  <div>進行</div>
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
                  <div>操作</div>
                </div>
                <div>
                  {group.tasks.map(task => (
                    <TaskTableRow
                      key={task.id}
                      task={task}
                      caseMap={caseMap}
                      onEdit={() => setEditTask(task)}
                      onDelete={() => setDeleteTask(task)}
                      onAdvance={() => handleAdvance(task)}
                      loading={loadingTaskId === task.id}
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
        <TaskKanban tasks={filtered} caseMap={caseMap} allMembers={allMembers} onAdvance={handleAdvance} loadingTaskId={loadingTaskId} onDelete={setDeleteTask} today={today} />
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

// ─── 進行ボタン ───
function AdvanceButton({ status, onAdvance, loading }: { status: string; onAdvance: () => void; loading?: boolean }) {
  const norm = (s: string) => {
    if (s === '未着手') return '着手前'
    if (['Wチェック待ち', '差戻し', '保留'].includes(s)) return '対応中'
    if (s === 'キャンセル') return '完了'
    return s
  }
  const current = norm(status)

  const spinner = (
    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
  )

  if (current === '着手前') {
    return (
      <button onClick={e => { e.stopPropagation(); onAdvance() }} disabled={loading}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-all
          ${loading ? 'bg-green-400 cursor-wait scale-95' : 'bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95'}`}>
        {loading ? spinner : '▶'} {loading ? '処理中...' : '着手する'}
      </button>
    )
  }
  if (current === '対応中') {
    return (
      <button onClick={e => { e.stopPropagation(); onAdvance() }} disabled={loading}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-all
          ${loading ? 'bg-blue-400 cursor-wait scale-95' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95'}`}>
        {loading ? spinner : '✅'} {loading ? '処理中...' : '完了にする'}
      </button>
    )
  }
  return <span className="text-[11px] text-green-600 font-semibold">✅ 完了</span>
}

// ─── Table Row ───
function TaskTableRow({ task, caseMap, onEdit, onDelete, onAdvance, loading, today, allMembers }: {
  task: TaskRow; caseMap: Record<string, CaseInfo>
  onEdit: () => void; onDelete: () => void; onAdvance: () => void; loading?: boolean
  today: string; allMembers: MemberRow[]
}) {
  const norm = (s: string) => {
    if (s === '未着手') return '着手前'
    if (['Wチェック待ち', '差戻し', '保留'].includes(s)) return '対応中'
    if (s === 'キャンセル') return '完了'
    return s
  }
  const statusDef = TASK_STATUSES.find(s => s.key === norm(task.status))
  const caseInfo = caseMap[task.case_id]
  const isOverdue = task.due_date && task.due_date < today && norm(task.status) !== '完了'
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null

  return (
    <div className={`grid grid-cols-[minmax(120px,2fr)_minmax(100px,1.5fr)_100px_120px_120px_85px_70px] gap-0 items-center px-4 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors group ${isOverdue ? 'bg-red-50/30' : ''}`}>
      {/* Task name */}
      <div className="min-w-0 pr-2">
        <a href={`/tasks/${task.id}`} className={`text-[13px] font-medium truncate block ${norm(task.status) === '完了' ? 'text-gray-400 line-through' : 'text-gray-800 hover:text-blue-600'}`}>{task.title}</a>
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

      {/* 進行ボタン */}
      <div>
        <AdvanceButton status={task.status} onAdvance={onAdvance} loading={loading} />
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
          <span className="text-[9px] text-gray-300">—</span>
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
        <button onClick={onDelete} className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition" title="削除">🗑</button>
      </div>
    </div>
  )
}

// ─── 要対応タスク行 ───
function AlertTaskRow({ task, caseMap, allMembers, onAdvance, loading, today }: {
  task: TaskRow; caseMap: Record<string, CaseInfo>; allMembers: MemberRow[]
  onAdvance: () => void; loading?: boolean; today: string
}) {
  const norm = (s: string) => {
    if (s === '未着手') return '着手前'
    if (['Wチェック待ち', '差戻し', '保留'].includes(s)) return '対応中'
    if (s === 'キャンセル') return '完了'
    return s
  }
  const caseInfo = caseMap[task.case_id]
  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null
  const isOverdue = task.due_date && task.due_date < today
  const isUrgent = task.priority === '急ぎ'

  return (
    <div className="grid grid-cols-[minmax(120px,2fr)_minmax(100px,1.5fr)_100px_120px_120px_85px_70px] gap-0 items-center px-4 py-2 border-b border-red-100 last:border-b-0 hover:bg-red-100/40 transition-colors">
      <div className="min-w-0 pr-2">
        <a href={`/tasks/${task.id}`} className="text-[13px] font-medium text-red-800 hover:text-red-600 truncate block">{task.title}</a>
      </div>
      <div className="min-w-0">
        {caseInfo ? (
          <a href={`/cases/${task.case_id}`} className="group/link block">
            <div className="text-[11px] font-mono text-gray-400 truncate">{caseInfo.case_number}</div>
            <div className="text-[11px] text-gray-500 truncate group-hover/link:text-blue-600">{caseInfo.deal_name}</div>
          </a>
        ) : <span className="text-[10px] text-gray-300">—</span>}
      </div>
      <div><AdvanceButton status={task.status} onAdvance={onAdvance} loading={loading} /></div>
      <div className="flex items-center gap-1.5">
        {caseInfo?.sales ? <MemberChip name={caseInfo.sales.name} color={caseInfo.sales.avatar_color} label="受注" /> : <span className="text-[9px] text-gray-300">—</span>}
        {caseInfo?.manager && <MemberChip name={caseInfo.manager.name} color={caseInfo.manager.avatar_color} label="管理" />}
      </div>
      <div className="flex items-center gap-1">
        {startedMember ? <MemberChip name={startedMember.name} color={startedMember.avatar_color} label="着手" /> : <span className="text-[9px] text-gray-300">—</span>}
      </div>
      <div>
        {task.due_date ? (
          <span className={`text-[11px] font-mono ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
            {isOverdue && '⚠ '}{task.due_date}
          </span>
        ) : <span className="text-[10px] text-gray-300">—</span>}
      </div>
      <div className="flex gap-1">
        {isOverdue && <span className="text-[9px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold">期限超過</span>}
        {isUrgent && <span className="text-[9px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded font-semibold">急ぎ</span>}
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
function TaskKanban({ tasks, caseMap, allMembers, onAdvance, loadingTaskId, onDelete, today }: {
  tasks: TaskRow[]; caseMap: Record<string, CaseInfo>; allMembers: MemberRow[]
  onAdvance: (task: TaskRow) => void; loadingTaskId: string | null
  onDelete: (task: TaskRow) => void; today: string
}) {
  const norm = (s: string) => {
    if (s === '未着手') return '着手前'
    if (['Wチェック待ち', '差戻し', '保留'].includes(s)) return '対応中'
    if (s === 'キャンセル') return '完了'
    return s
  }
  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {TASK_STATUSES.map(status => {
          const columnTasks = tasks.filter(t => norm(t.status) === status.key)
          return (
            <div key={status.key} className="w-[260px] flex-shrink-0">
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
                  const isOverdue = task.due_date && task.due_date < today && norm(task.status) !== '完了'
                  return (
                    <div key={task.id} className={`bg-white border border-gray-200 rounded-lg p-3 shadow-sm ${task.priority === '急ぎ' ? 'border-l-[3px] border-l-red-500' : ''}`}>
                      <a href={`/tasks/${task.id}`} className={`block text-xs font-semibold mb-1 leading-tight cursor-pointer hover:text-blue-600 ${norm(task.status) === '完了' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</a>
                      {caseInfo && <div className="text-[10px] text-gray-400 mb-1.5">{caseInfo.case_number} {caseInfo.deal_name}</div>}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {startedMember && (
                            <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: startedMember.avatar_color }} title={startedMember.name}>{startedMember.name.charAt(0)}</span>
                          )}
                          <AdvanceButton status={task.status} onAdvance={() => onAdvance(task)} loading={loadingTaskId === task.id} />
                        </div>
                        <div className="flex items-center gap-1">
                          {task.due_date && <span className={`text-[10px] font-mono ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{task.due_date}</span>}
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

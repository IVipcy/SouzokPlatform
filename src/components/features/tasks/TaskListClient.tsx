'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, User, AlertTriangle, X, Play, CheckCircle2, Trash2, ListChecks } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from './EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES, getWorkRoleDef } from '@/lib/constants'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
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

// 事務管理タスク一覧では差戻しを扱わないため「対応中」へ吸収。
// 古い「Wチェック待ち / 保留」も同様に「対応中」へ。
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TaskListClient({ tasks, caseMap, allMembers, currentMemberId: serverMemberId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentMemberId = useCurrentMember(serverMemberId)
  const [statusFilter, setStatusFilter] = useState<string>('着手前')
  const [filterMine, setFilterMine] = useState(searchParams.get('assignee') === 'mine')
  const [filterUrgent, setFilterUrgent] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null)
  // 一括操作用の選択状態
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('assignee') === 'mine') setFilterMine(true)
  }, [searchParams])

  const today = new Date().toISOString().split('T')[0]

  // 事務管理タスク一覧: 事務管理担当（work_role='assistant'）のタスクのみを対象とする
  const assistantTasks = useMemo(() => tasks.filter(t => t.work_role === 'assistant'), [tasks])

  const filtered = useMemo(() => {
    let result = assistantTasks
    if (statusFilter !== 'all') result = result.filter(t => normalizeStatus(t.status) === statusFilter)
    if (filterMine && currentMemberId) {
      result = result.filter(t =>
        t.started_by === currentMemberId ||
        (t.task_assignees ?? []).some(a => a.member_id === currentMemberId && a.role === 'primary'),
      )
    }
    if (filterUrgent) {
      result = result.filter(t => {
        if (normalizeStatus(t.status) === '完了') return false
        return (t.due_date && t.due_date < today) || t.priority === '急ぎ'
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(t => {
        const caseName = caseMap[t.case_id]?.deal_name ?? ''
        const caseNumber = caseMap[t.case_id]?.case_number ?? ''
        return t.title.toLowerCase().includes(q) ||
               caseName.toLowerCase().includes(q) ||
               caseNumber.toLowerCase().includes(q)
      })
    }
    // 自動ソート: 期限超過 → 期限近い順 → 期限なしは末尾
    return [...result].sort((a, b) => {
      const aOver = !!(a.due_date && a.due_date < today && normalizeStatus(a.status) !== '完了')
      const bOver = !!(b.due_date && b.due_date < today && normalizeStatus(b.status) !== '完了')
      if (aOver !== bOver) return aOver ? -1 : 1
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    })
  }, [assistantTasks, statusFilter, filterMine, filterUrgent, search, caseMap, currentMemberId, today])

  const kpis = useMemo(() => ({
    total: assistantTasks.length,
    todo: assistantTasks.filter(t => normalizeStatus(t.status) === '着手前').length,
    doing: assistantTasks.filter(t => normalizeStatus(t.status) === '対応中').length,
    done: assistantTasks.filter(t => normalizeStatus(t.status) === '完了').length,
  }), [assistantTasks])

  const myTaskCount = currentMemberId
    ? assistantTasks.filter(t =>
        normalizeStatus(t.status) !== '完了' && (
          t.started_by === currentMemberId ||
          (t.task_assignees ?? []).some(a => a.member_id === currentMemberId && a.role === 'primary')
        ),
      ).length
    : 0

  const urgentTaskCount = assistantTasks.filter(t => {
    if (normalizeStatus(t.status) === '完了') return false
    return (t.due_date && t.due_date < today) || t.priority === '急ぎ'
  }).length

  const handleAdvance = useCallback(async (task: TaskRow) => {
    const current = normalizeStatus(task.status)
    if (current === '完了') return
    if (loadingTaskId) return

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

  // 一括: 選択切替
  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  // 一括: 表示中の全タスクを選択 / 解除
  const toggleSelectAll = useCallback((visibleIds: string[]) => {
    setSelectedIds(prev => {
      const allSelected = visibleIds.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      }
      const next = new Set(prev)
      visibleIds.forEach(id => next.add(id))
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // 一括: ステータス変更
  const handleBulkStatus = useCallback(async (nextStatus: string) => {
    if (selectedIds.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      const supabase = createClient()
      const ids = Array.from(selectedIds)
      const updates: Record<string, unknown> = { status: nextStatus }
      // 対応中に変更する場合、着手者と着手日時もセット（未セットのものに対して）
      if (nextStatus === '対応中' && currentMemberId) {
        updates.started_by = currentMemberId
        updates.started_at = new Date().toISOString()
      }
      const { error } = await supabase.from('tasks').update(updates).in('id', ids)
      if (error) throw error
      // 活動履歴: 件数が多いとうるさいので一括時は省略
      showToast(`${ids.length} 件のステータスを「${nextStatus}」に変更しました`, 'success')
      clearSelection()
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('一括変更に失敗しました', 'error')
    } finally {
      setBulkBusy(false)
    }
  }, [selectedIds, bulkBusy, currentMemberId, clearSelection, router])

  // 一括: 削除
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      const supabase = createClient()
      const ids = Array.from(selectedIds)
      await supabase.from('task_assignees').delete().in('task_id', ids)
      await supabase.from('task_dependencies').delete().or(`from_task_id.in.(${ids.join(',')}),to_task_id.in.(${ids.join(',')})`)
      const { error } = await supabase.from('tasks').delete().in('id', ids)
      if (error) throw error
      showToast(`${ids.length} 件を削除しました`, 'success')
      clearSelection()
      setBulkDeleteOpen(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('一括削除に失敗しました', 'error')
    } finally {
      setBulkBusy(false)
    }
  }, [selectedIds, bulkBusy, clearSelection, router])

  return (
    <div>
      {/* ===== Sticky top zone ===== */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-3 bg-white border-b border-gray-200 mb-4">
        <PageHeader
          eyebrow="Tasks"
          title="事務管理タスク一覧"
          icon={ListChecks}
          description="事務管理担当のタスクを管理"
          right={
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 w-[260px]">
              <Search className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="タスク名・案件名・番号で検索"
                className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400"
              />
            </div>
          }
        />

        {/* Quick filters: 自分のタスク / 要対応 */}
        <div className="flex gap-2 mb-3 items-center">
          <button
            onClick={() => setFilterMine(v => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all border shadow-sm ${
              filterMine
                ? 'bg-brand-600 text-white border-brand-600 shadow-brand-200'
                : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <User className="w-3.5 h-3.5" strokeWidth={2} />
            自分のタスク
            <span className={`text-[12px] font-mono ml-0.5 ${filterMine ? 'opacity-80' : 'opacity-50'}`}>
              {myTaskCount}
            </span>
          </button>
          <button
            onClick={() => setFilterUrgent(v => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all border shadow-sm ${
              filterUrgent
                ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.25} />
            要対応
            <span className={`text-[12px] font-mono ml-0.5 ${filterUrgent ? 'opacity-80' : 'opacity-50'}`}>
              {urgentTaskCount}
            </span>
          </button>
          {(filterMine || filterUrgent) && (
            <button
              onClick={() => { setFilterMine(false); setFilterUrgent(false) }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[13px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
              クリア
            </button>
          )}
        </div>

        {/* Toolbar: status pills + view mode */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <FilterTab label="すべて"   count={kpis.total}    active={statusFilter === 'all'}    onClick={() => setStatusFilter('all')} />
            <FilterTab label="着手前"   count={kpis.todo}     active={statusFilter === '着手前'} onClick={() => setStatusFilter('着手前')} />
            <FilterTab label="対応中"   count={kpis.doing}    active={statusFilter === '対応中'} onClick={() => setStatusFilter('対応中')} />
            <FilterTab label="完了"     count={kpis.done}     active={statusFilter === '完了'}   onClick={() => setStatusFilter('完了')} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-0.5 bg-gray-50 border border-gray-200 rounded-md p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${
                  viewMode === 'list' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="リスト"
              >☰</button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`w-[30px] h-[26px] rounded flex items-center justify-center text-sm transition-all ${
                  viewMode === 'kanban' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="カンバン"
              >⊞</button>
            </div>
          </div>
        </div>
      </div>

      {/* 一括操作バー（選択数 > 0 時のみ） */}
      {selectedIds.size > 0 && viewMode === 'list' && (
        <BulkActionBar
          count={selectedIds.size}
          busy={bulkBusy}
          onClear={clearSelection}
          onStatus={handleBulkStatus}
          onDelete={() => setBulkDeleteOpen(true)}
        />
      )}

      {/* Content */}
      {viewMode === 'list' ? (
        <ListView
          tasks={filtered}
          caseMap={caseMap}
          allMembers={allMembers}
          today={today}
          onAdvance={handleAdvance}
          loadingTaskId={loadingTaskId}
          onEdit={setEditTask}
          onDelete={setDeleteTask}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      ) : (
        <TaskKanban
          tasks={filtered}
          caseMap={caseMap}
          allMembers={allMembers}
          onAdvance={handleAdvance}
          loadingTaskId={loadingTaskId}
          onDelete={setDeleteTask}
          today={today}
        />
      )}

      {editTask && (
        <EditTaskModal
          isOpen={!!editTask}
          onClose={() => setEditTask(null)}
          task={editTask}
          caseMap={caseMap}
          allMembers={allMembers}
          onSaved={() => { setEditTask(null); router.refresh() }}
        />
      )}
      <DeleteConfirmModal
        isOpen={!!deleteTask}
        onClose={() => setDeleteTask(null)}
        title="タスク削除"
        message={`「${deleteTask?.title}」を削除しますか？この操作は取り消せません。`}
        onConfirm={handleDelete}
      />
      <DeleteConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="タスク一括削除"
        message={`選択した ${selectedIds.size} 件のタスクを削除しますか？この操作は取り消せません。\n紐づけ・担当者割当も同時に削除されます。`}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}

// ─── List View（案件一覧と同じ構造）───
function ListView({
  tasks,
  caseMap,
  allMembers,
  today,
  onAdvance,
  loadingTaskId,
  onEdit: _onEdit,
  onDelete,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  today: string
  onAdvance: (task: TaskRow) => void
  loadingTaskId: string | null
  onEdit: (task: TaskRow) => void
  onDelete: (task: TaskRow) => void
  selectedIds: Set<string>
  onToggleSelect: (taskId: string) => void
  onToggleSelectAll: (visibleIds: string[]) => void
}) {
  const { widths, reset, startResize } = useResizableColumns('taskListColWidths', {
    select: 40, title: 240, status: 100, caseCol: 200, sales: 110, manager: 110, due: 100,
    execResult: 220,
    action: 110, ops: 40,
  })
  const HEADERS: Array<{ key: keyof typeof widths; label: string }> = [
    { key: 'select',     label: '' },
    { key: 'title',      label: 'タスク名' },
    { key: 'status',     label: 'ステータス' },
    { key: 'caseCol',    label: '案件' },
    { key: 'sales',      label: '受注担当' },
    { key: 'manager',    label: '管理担当' },
    { key: 'due',        label: '期限' },
    { key: 'execResult', label: '実施結果' },
    { key: 'action',     label: '操作' },
    { key: 'ops',        label: '' },
  ]

  const visibleIds = tasks.map(t => t.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const someSelected = visibleIds.some(id => selectedIds.has(id))

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-gray-900">タスク一覧</h2>
        <span className="text-[13px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
          {tasks.length}件
        </span>
        <div className="flex-1" />
        <button
          onClick={reset}
          title="列幅をデフォルトに戻す"
          className="text-[13px] text-gray-500 hover:text-brand-600 px-2 py-1 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
        >
          ↔ 列幅リセット
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-gray-400">該当するタスクがありません</div>
      ) : (
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {HEADERS.map(h => <col key={h.key} style={{ width: widths[h.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              {HEADERS.map(h => (
                <th
                  key={h.key}
                  className="relative text-left px-3.5 py-2.5 text-[12px] font-bold text-gray-500 tracking-wider uppercase bg-gray-50 border-b border-gray-200"
                >
                  {h.key === 'select' ? (
                    <input
                      type="checkbox"
                      aria-label="表示中の全タスクを選択"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                      onChange={() => onToggleSelectAll(visibleIds)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400 cursor-pointer"
                    />
                  ) : (
                    <span className="truncate block">{h.label}</span>
                  )}
                  {h.key !== 'ops' && h.key !== 'select' && <ResizeHandle onMouseDown={startResize(h.key)} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                caseMap={caseMap}
                allMembers={allMembers}
                today={today}
                onAdvance={onAdvance}
                loading={loadingTaskId === task.id}
                onDelete={onDelete}
                selected={selectedIds.has(task.id)}
                onToggleSelect={() => onToggleSelect(task.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── 1行 ───
function TaskRow({ task, caseMap, allMembers: _allMembers, today, onAdvance, loading, onDelete, selected, onToggleSelect }: {
  task: TaskRow
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  today: string
  onAdvance: (task: TaskRow) => void
  loading: boolean
  onDelete: (task: TaskRow) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const status = normalizeStatus(task.status)
  const statusDef = TASK_STATUSES.find(s => s.key === status)
  const caseInfo = caseMap[task.case_id]
  const isOverdue = !!(task.due_date && task.due_date < today && status !== '完了')
  const workRole = getWorkRoleDef(task.work_role)
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  return (
    <tr className={`group border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60 transition-colors relative ${
      selected ? 'bg-brand-50/60' : isOverdue ? 'bg-red-50/30' : ''
    }`}>
      {/* チェックボックス */}
      <td className="px-3.5 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`タスク「${task.title}」を選択`}
          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400 cursor-pointer"
        />
      </td>

      {/* タスク名 */}
      <td className="px-3.5 py-2.5 relative">
        {/* 担当区分カラーバー（左端） */}
        {(workRole || isOverdue) && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ backgroundColor: isOverdue ? '#DC2626' : workRole?.bar }}
            title={isOverdue ? '期限超過' : workRole?.label}
          />
        )}
        <div className="flex items-center gap-1.5 min-w-0 pl-1">
          {workRole && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold border flex-shrink-0 ${workRole.pill}`}
              title={workRole.label}
            >
              <workRole.Icon className="w-3 h-3" strokeWidth={2.25} />
              {workRole.shortLabel}
            </span>
          )}
          {task.priority === '急ぎ' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 flex-shrink-0">急ぎ</span>
          )}
          <a
            href={`/tasks/${task.id}`}
            className={`text-[13px] font-medium truncate ${status === '完了' ? 'text-gray-400 line-through' : 'text-gray-800 hover:text-brand-600'}`}
          >
            {task.title}
          </a>
        </div>
      </td>

      {/* ステータス */}
      <td className="px-3.5 py-2.5">
        {statusDef && <Badge label={statusDef.key} color={statusDef.color} />}
      </td>

      {/* 案件 */}
      <td className="px-3.5 py-2.5 min-w-0">
        {caseInfo ? (
          <a href={`/cases/${task.case_id}`} className="block group/link">
            <div className="text-[12px] font-mono text-gray-400 truncate">{caseInfo.case_number}</div>
            <div className="text-[13px] text-gray-600 truncate group-hover/link:text-brand-600 group-hover/link:underline">
              {caseInfo.deal_name}
            </div>
          </a>
        ) : (
          <span className="text-[12px] text-gray-300">—</span>
        )}
      </td>

      {/* 受注担当 */}
      <td className="px-3.5 py-2.5">
        {caseInfo?.sales ? (
          <Link
            href={`/profile/${caseInfo.sales.id}`}
            className="text-[13px] text-gray-700 hover:text-brand-700 hover:underline truncate block"
          >
            {caseInfo.sales.name}
          </Link>
        ) : (
          <span className="text-[12px] text-gray-300">—</span>
        )}
      </td>

      {/* 管理担当 */}
      <td className="px-3.5 py-2.5">
        {caseInfo?.manager ? (
          <Link
            href={`/profile/${caseInfo.manager.id}`}
            className="text-[13px] text-gray-700 hover:text-brand-700 hover:underline truncate block"
          >
            {caseInfo.manager.name}
          </Link>
        ) : (
          <span className="text-[12px] text-gray-300">—</span>
        )}
      </td>

      {/* 期限 */}
      <td className="px-3.5 py-2.5">
        {task.due_date ? (
          <span className={`text-[13px] font-mono inline-flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
            {isOverdue && <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />}
            {task.due_date}
          </span>
        ) : (
          <span className="text-[12px] text-gray-300">—</span>
        )}
      </td>

      {/* 実施結果（ext_data.execution_result） */}
      <td className="px-3.5 py-2.5 align-top">
        {(() => {
          const result = typeof ext.execution_result === 'string' ? ext.execution_result : ''
          if (!result.trim()) return <span className="text-[12px] text-gray-300">—</span>
          return (
            <span
              className="text-[12px] text-gray-700 line-clamp-2 whitespace-pre-line"
              title={result}
            >
              {result}
            </span>
          )
        })()}
      </td>

      {/* 操作（着手/完了ボタン） */}
      <td className="px-3.5 py-2.5">
        <AdvanceButton status={task.status} onAdvance={() => onAdvance(task)} loading={loading} />
      </td>

      {/* 削除（hover時のみ） */}
      <td className="px-3.5 py-2.5">
        <button
          onClick={() => onDelete(task)}
          className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
          title="削除"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  )
}

function AdvanceButton({ status, onAdvance, loading }: { status: string; onAdvance: () => void; loading?: boolean }) {
  const current = normalizeStatus(status)
  const spinner = <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />

  if (current === '着手前') {
    return (
      <button
        onClick={e => { e.stopPropagation(); onAdvance() }}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-60 transition-colors"
      >
        {loading ? spinner : <Play className="w-3 h-3" strokeWidth={2.5} />}
        {loading ? '処理中' : '着手'}
      </button>
    )
  }
  if (current === '対応中') {
    return (
      <button
        onClick={e => { e.stopPropagation(); onAdvance() }}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 hover:border-brand-300 disabled:opacity-60 transition-colors"
      >
        {loading ? spinner : <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />}
        {loading ? '処理中' : '完了'}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
      <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
      完了
    </span>
  )
}

// ─── 一括操作バー ───
function BulkActionBar({ count, busy, onClear, onStatus, onDelete }: {
  count: number
  busy: boolean
  onClear: () => void
  onStatus: (status: string) => void
  onDelete: () => void
}) {
  return (
    <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-3 flex-wrap shadow-sm">
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-800">
        <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />
        {count} 件選択中
      </span>
      <span className="text-[12px] text-gray-500">一括操作:</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {TASK_STATUSES.filter(s => s.key !== '差戻し').map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => onStatus(s.key)}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-white rounded-md border shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: s.color, borderColor: s.color }}
            title={`${s.key} に変更`}
          >
            {s.key}
          </button>
        ))}
        <span className="text-gray-300 mx-1">|</span>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3 h-3" strokeWidth={2} />
          削除
        </button>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[12px] text-gray-500 hover:text-gray-700 hover:bg-white rounded transition-colors"
      >
        <X className="w-3 h-3" />
        選択解除
      </button>
    </div>
  )
}

// ─── Task Kanban ───
function TaskKanban({ tasks, caseMap, allMembers, onAdvance, loadingTaskId, onDelete, today }: {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  onAdvance: (task: TaskRow) => void
  loadingTaskId: string | null
  onDelete: (task: TaskRow) => void
  today: string
}) {
  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {TASK_STATUSES.filter(s => s.key !== '差戻し').map(status => {
          const columnTasks = tasks.filter(t => normalizeStatus(t.status) === status.key)
          return (
            <div key={status.key} className="w-[260px] flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-2 shadow-sm mb-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
                <span className="text-xs font-semibold flex-1">{status.key}</span>
                <span className="text-[12px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{columnTasks.length}</span>
              </div>
              <div className="flex flex-col gap-1.5" style={{ minHeight: 80 }}>
                {columnTasks.length === 0 ? (
                  <div className="text-center text-[13px] text-gray-300 py-5 border border-dashed border-gray-200 rounded-lg">なし</div>
                ) : columnTasks.map(task => {
                  const caseInfo = caseMap[task.case_id]
                  const startedMember = task.started_by ? allMembers.find(m => m.id === task.started_by) ?? task.started_by_member : null
                  const isOverdue = !!(task.due_date && task.due_date < today && normalizeStatus(task.status) !== '完了')
                  const wr = getWorkRoleDef(task.work_role)
                  return (
                    <div
                      key={task.id}
                      className={`bg-white border border-gray-200 rounded-lg p-3 shadow-sm ${task.priority === '急ぎ' ? 'border-l-[3px] border-l-red-500' : ''}`}
                      style={task.priority !== '急ぎ' && task.work_role ? { borderLeft: `3px solid ${wr?.bar ?? '#E5E7EB'}` } : undefined}
                    >
                      {wr && (() => {
                        const WrIcon = wr.Icon
                        return (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold border mb-1 ${wr.pill}`}>
                            <WrIcon className="w-3 h-3" strokeWidth={2.25} />
                            {wr.shortLabel}
                          </span>
                        )
                      })()}
                      <a href={`/tasks/${task.id}`} className={`block text-xs font-semibold mb-1 leading-tight cursor-pointer hover:text-brand-600 ${normalizeStatus(task.status) === '完了' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </a>
                      {caseInfo && <div className="text-[12px] text-gray-400 mb-1.5">{caseInfo.case_number} {caseInfo.deal_name}</div>}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {startedMember && (
                            <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: startedMember.avatar_color }} title={startedMember.name}>
                              {startedMember.name.charAt(0)}
                            </span>
                          )}
                          <AdvanceButton status={task.status} onAdvance={() => onAdvance(task)} loading={loadingTaskId === task.id} />
                        </div>
                        <div className="flex items-center gap-1">
                          {task.due_date && <span className={`text-[12px] font-mono ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{task.due_date}</span>}
                          <button onClick={() => onDelete(task)} className="w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition" title="削除">
                            <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                          </button>
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
function FilterTab({ label, active, onClick, count, accent }: { label: string; active: boolean; onClick: () => void; count?: number; accent?: 'danger' }) {
  const activeCls = accent === 'danger'
    ? 'bg-red-600 text-white font-semibold shadow-sm'
    : 'bg-brand-600 text-white font-semibold shadow-sm'
  const inactiveCls = accent === 'danger' && count && count > 0
    ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${active ? activeCls : inactiveCls}`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1.5 text-[13px] font-mono ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
      )}
    </button>
  )
}

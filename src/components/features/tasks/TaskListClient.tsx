'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, User, AlertTriangle, X, Play, CheckCircle2, Trash2, ListChecks, Tag, Briefcase, Layers, PackageCheck } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import MultiSelectFilter from '@/components/ui/MultiSelectFilter'
import EditTaskModal from './EditTaskModal'
import CompleteTaskModal from './CompleteTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES, getWorkRoleDef } from '@/lib/constants'
import { ORDER_CATEGORIES, GYOMU_ALL } from '@/lib/serviceMaster'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { KoteiBadge, GyomuBadge } from '@/components/ui/KoteiBadge'
import { getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
import { showToast } from '@/components/ui/Toast'
import type { TaskRow, MemberRow } from '@/types'

type CaseMemberInfo = { id: string; name: string; avatar_color: string; avatar_url: string | null }
export type CaseInfo = {
  case_number: string
  deal_name: string
  status: string
  service_category: string | null
  service_category_2: string | null
  expected_completion_date: string | null
  sales?: CaseMemberInfo
  manager?: CaseMemberInfo
}

type Props = {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  currentMemberId: string | null
  /** 受信簿（着手OK＝書類受領の判定に使う・1タスク1行に展開済み） */
  receipts?: ReadinessReceipt[]
}

// 事務管理タスク一覧では差戻しを扱わないため「対応中」へ吸収。
// 古い「Wチェック待ち / 保留」も同様に「対応中」へ。
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

// 業務区分 = task.phase（"PhaseN:" 接頭辞を除く）
const gyomuOf = (t: TaskRow) => (t.phase ?? '').replace(/^Phase\d+[:：]\s*/, '')

export default function TaskListClient({ tasks, caseMap, allMembers, currentMemberId: serverMemberId, receipts = [] }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentMemberId = useCurrentMember(serverMemberId)
  // 既定は「着手前」のみ。月数百件規模になるため、出社→次やる即発見の動線を最優先。
  const [statusFilter, setStatusFilter] = useState<string>('着手前')
  // 自分のタスクは既定OFF。出社直後は未アサインの着手前を拾うのが日常動線。
  const [filterMine, setFilterMine] = useState(searchParams.get('assignee') === 'mine')
  const [koteiFilter, setKoteiFilter] = useState<Set<string>>(new Set())
  // 受注区分（概念が大きいので先）／業務区分 の複数選択フィルタ（OR条件・全空=絞り込みなし）
  const [serviceFilter, setServiceFilter] = useState<Set<string>>(new Set())
  const [gyomuFilter, setGyomuFilter] = useState<Set<string>>(new Set())
  // 「着手OKだけ」トグル（着手前の中の絞り込み。別ステータスではない）
  const [readyOnly, setReadyOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)
  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null)
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null)
  // 一括操作用の選択状態
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('assignee') === 'mine') setFilterMine(true)
  }, [searchParams])

  const today = new Date().toISOString().split('T')[0]

  // 事務管理タスク一覧: 案件タスク（task_kind='case'）を対象とする。
  // 受注/管理担当の初期タスク(task_kind='system')はこの一覧から除外。
  // 互換のため、work_role='assistant' のタスクも拾う（旧データ）。
  const assistantTasks = useMemo(
    () => tasks.filter(t => t.task_kind === 'case' || t.work_role === 'assistant'),
    [tasks],
  )

  const filtered = useMemo(() => {
    let result = assistantTasks
    if (statusFilter !== 'all') result = result.filter(t => normalizeStatus(t.status) === statusFilter)
    if (filterMine && currentMemberId) {
      result = result.filter(t =>
        t.started_by === currentMemberId ||
        (t.task_assignees ?? []).some(a => a.member_id === currentMemberId && a.role === 'primary'),
      )
    }
    // 受注区分（OR）: 案件の service_category / service_category_2 のいずれかが選択集合に含まれる
    if (serviceFilter.size > 0) {
      result = result.filter(t => {
        const c = caseMap[t.case_id]
        return [c?.service_category, c?.service_category_2].some(s => !!s && serviceFilter.has(s))
      })
    }
    // 工程（OR）: task.phase の導出工程が選択集合に含まれる
    if (koteiFilter.size > 0) {
      result = result.filter(t => koteiFilter.has(koteiOf(t.phase)))
    }
    // 業務区分（OR）: task.phase が選択集合に含まれる
    if (gyomuFilter.size > 0) {
      result = result.filter(t => gyomuFilter.has(gyomuOf(t)))
    }
    // 着手OKだけ（着手前の中の絞り込み）
    if (readyOnly) {
      result = result.filter(t => getStartSignal(t, receipts).ready)
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
    // 並び: 工程順 → 業務 → 着手OK → 期限超過 → 期限近い順
    return [...result].sort((a, b) => {
      const kr = koteiRank(koteiOf(a.phase)) - koteiRank(koteiOf(b.phase))
      if (kr !== 0) return kr
      const gr = GYOMU_ALL.indexOf(gyomuOf(a)) - GYOMU_ALL.indexOf(gyomuOf(b))
      if (gr !== 0) return gr
      const aReady = getStartSignal(a, receipts).ready ? 0 : 1
      const bReady = getStartSignal(b, receipts).ready ? 0 : 1
      if (aReady !== bReady) return aReady - bReady
      const aOver = !!(a.due_date && a.due_date < today && normalizeStatus(a.status) !== '完了')
      const bOver = !!(b.due_date && b.due_date < today && normalizeStatus(b.status) !== '完了')
      if (aOver !== bOver) return aOver ? -1 : 1
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    })
  }, [assistantTasks, statusFilter, filterMine, serviceFilter, koteiFilter, gyomuFilter, readyOnly, search, caseMap, currentMemberId, today, receipts])

  const readyCount = useMemo(
    () => assistantTasks.filter(t => getStartSignal(t, receipts).ready).length,
    [assistantTasks, receipts],
  )

  // フィルタ選択肢: 実データに存在するものだけを、正準順序で出す
  const serviceOptions = useMemo(() => {
    const present = new Set<string>()
    for (const t of assistantTasks) {
      const c = caseMap[t.case_id]
      for (const s of [c?.service_category, c?.service_category_2]) if (s) present.add(s)
    }
    return ORDER_CATEGORIES.filter(c => present.has(c))
  }, [assistantTasks, caseMap])
  const gyomuOptions = useMemo(() => {
    const present = new Set<string>()
    for (const t of assistantTasks) { const g = gyomuOf(t); if (g) present.add(g) }
    const ordered = GYOMU_ALL.filter(g => present.has(g))
    // GYOMU_ALL に無い業務（旧データ等）は末尾に
    const extra = [...present].filter(g => !GYOMU_ALL.includes(g))
    let all = [...ordered, ...extra]
    // 工程を選んでいるときは、その工程に紐づく業務だけに絞る
    if (koteiFilter.size > 0) all = all.filter(g => koteiFilter.has(koteiOf(g)))
    return all
  }, [assistantTasks, koteiFilter])
  const koteiOptions = useMemo(() => {
    const present = new Set<string>()
    for (const t of assistantTasks) present.add(koteiOf(t.phase))
    return [...present].sort((a, b) => koteiRank(a) - koteiRank(b))
  }, [assistantTasks])

  // 工程の選択が変わったら、その工程に属さない業務区分の選択は外す
  useEffect(() => {
    if (koteiFilter.size === 0) return
    setGyomuFilter(prev => {
      const next = new Set([...prev].filter(g => koteiFilter.has(koteiOf(g))))
      return next.size === prev.size ? prev : next
    })
  }, [koteiFilter])

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

  const handleAdvance = useCallback(async (task: TaskRow) => {
    const current = normalizeStatus(task.status)
    if (current === '完了') return
    if (loadingTaskId) return

    // 事務管理タスクの完了は完了ゲート（実施結果＋次の着手OK選択）を必ず通す
    if (current === '対応中' && task.task_kind !== 'system') {
      setCompleteTask(task)
      return
    }

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
        // 実施結果・引継ぎ事項が未入力なら完了させない（システムタスクを除く）。一覧では入力できないため詳細へ誘導。
        if (task.task_kind !== 'system') {
          const exec = (task.ext_data as { execution_result?: string } | null)?.execution_result
          if (!exec || !exec.trim()) {
            showToast('実施結果・引継ぎ事項が未入力です。タスク詳細で入力してから完了してください', 'error')
            return
          }
        }
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

        {/* Toolbar: status pills + 受注区分/業務区分 + 自分のタスクトグル */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <FilterTab label="未着手"   count={kpis.todo}     active={statusFilter === '着手前'} onClick={() => setStatusFilter('着手前')} />
            <FilterTab label="対応中"   count={kpis.doing}    active={statusFilter === '対応中'} onClick={() => { setStatusFilter('対応中'); setReadyOnly(false) }} />
            <FilterTab label="完了"     count={kpis.done}     active={statusFilter === '完了'}   onClick={() => { setStatusFilter('完了'); setReadyOnly(false) }} />
            <FilterTab label="すべて"   count={kpis.total}    active={statusFilter === 'all'}    onClick={() => { setStatusFilter('all'); setReadyOnly(false) }} />
          </div>

          {/* 着手OK（今すぐやれるもの）だけ。未着手のときのみ意味があるので未着手選択時に表示 */}
          {statusFilter === '着手前' && (
            <>
              <span className="w-px h-6 bg-gray-200" />
              <button
                onClick={() => setReadyOnly(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors whitespace-nowrap ${
                  readyOnly ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title="書類が届いた等で今すぐ着手できるタスクだけ表示"
              >
                <PackageCheck className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                着手OK
                {readyCount > 0 && <span className="text-[12px] font-mono opacity-70">{readyCount}</span>}
              </button>
            </>
          )}

          <span className="w-px h-6 bg-gray-200" />

          {/* 受注区分（概念が大きいので先） → 工程 → 業務区分 */}
          <MultiSelectFilter label="受注区分" icon={Tag} options={serviceOptions} selected={serviceFilter} onChange={setServiceFilter} width={200} />
          <MultiSelectFilter label="工程" icon={Layers} options={koteiOptions} selected={koteiFilter} onChange={setKoteiFilter} width={200} />
          <MultiSelectFilter label="業務区分" icon={Briefcase} options={gyomuOptions} selected={gyomuFilter} onChange={setGyomuFilter} width={220} />

          {(serviceFilter.size > 0 || koteiFilter.size > 0 || gyomuFilter.size > 0) && (
            <button
              onClick={() => { setServiceFilter(new Set()); setKoteiFilter(new Set()); setGyomuFilter(new Set()) }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[12px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />クリア
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setFilterMine(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all border ${
                filterMine
                  ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-50'
              }`}
              title={filterMine ? '自分のタスクで絞り込み中（クリックで解除）' : '自分が対応中・完了のタスクだけに絞る'}
            >
              <User className="w-3.5 h-3.5" strokeWidth={2} />
              自分のタスク
              <span className={`text-[12px] font-mono ml-0.5 ${filterMine ? 'opacity-80' : 'opacity-50'}`}>
                {myTaskCount}
              </span>
              {filterMine && <X className="w-3 h-3 ml-0.5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>

        {/* 選択中チップ */}
        {(serviceFilter.size > 0 || koteiFilter.size > 0 || gyomuFilter.size > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <span className="text-[12px] text-gray-400">絞り込み中:</span>
            {[...serviceFilter].map(s => (
              <span key={`s-${s}`} className="inline-flex items-center gap-1 text-[12px] text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md">
                <Tag className="w-3 h-3" strokeWidth={2} />{s}
                <button onClick={() => setServiceFilter(prev => { const n = new Set(prev); n.delete(s); return n })} className="hover:text-brand-900"><X className="w-3 h-3" strokeWidth={2.5} /></button>
              </span>
            ))}
            {[...koteiFilter].map(k => (
              <span key={`k-${k}`} className="inline-flex items-center gap-1 text-[12px] text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md">
                <Layers className="w-3 h-3" strokeWidth={2} />{k}
                <button onClick={() => setKoteiFilter(prev => { const n = new Set(prev); n.delete(k); return n })} className="hover:text-brand-900"><X className="w-3 h-3" strokeWidth={2.5} /></button>
              </span>
            ))}
            {[...gyomuFilter].map(g => (
              <span key={`g-${g}`} className="inline-flex items-center gap-1 text-[12px] text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md">
                <Briefcase className="w-3 h-3" strokeWidth={2} />{g}
                <button onClick={() => setGyomuFilter(prev => { const n = new Set(prev); n.delete(g); return n })} className="hover:text-brand-900"><X className="w-3 h-3" strokeWidth={2.5} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <>
      {/* 一括操作バー（選択数 > 0 時のみ） */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          busy={bulkBusy}
          onClear={clearSelection}
          onStatus={handleBulkStatus}
          onDelete={() => setBulkDeleteOpen(true)}
        />
      )}

      {/* 月数百件規模になるためテーブル固定。カンバンは案件詳細タスクタブ側で。 */}
      <ListView
        tasks={filtered}
        caseMap={caseMap}
        allMembers={allMembers}
        today={today}
        receipts={receipts}
        onAdvance={handleAdvance}
        loadingTaskId={loadingTaskId}
        onEdit={setEditTask}
        onDelete={setDeleteTask}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
      />
      </>

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
      {completeTask && (
        <CompleteTaskModal
          task={completeTask}
          onClose={() => setCompleteTask(null)}
          onCompleted={() => { setCompleteTask(null); router.refresh() }}
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
  receipts,
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
  receipts: ReadinessReceipt[]
  onAdvance: (task: TaskRow) => void
  loadingTaskId: string | null
  onEdit: (task: TaskRow) => void
  onDelete: (task: TaskRow) => void
  selectedIds: Set<string>
  onToggleSelect: (taskId: string) => void
  onToggleSelectAll: (visibleIds: string[]) => void
}) {
  const { widths, reset, startResize } = useResizableColumns('taskListColWidths', {
    select: 40, kotei: 104, gyomu: 124, title: 220, status: 96, readyReason: 150, caseCol: 190, sales: 100, manager: 100, due: 100,
    execResult: 200,
    action: 110, ops: 40,
  })
  const HEADERS: Array<{ key: keyof typeof widths; label: string }> = [
    { key: 'select',     label: '' },
    { key: 'kotei',      label: '工程' },
    { key: 'gyomu',      label: '業務区分' },
    { key: 'title',      label: 'タスク名' },
    { key: 'status',     label: 'ステータス' },
    { key: 'readyReason', label: '着手OK理由' },
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
                  className="relative text-left px-3.5 py-2.5 text-[12px] font-bold text-brand-700 tracking-wider uppercase bg-brand-50/60 border-b border-brand-100"
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
                signal={getStartSignal(task, receipts)}
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
function TaskRow({ task, caseMap, allMembers: _allMembers, today, signal, onAdvance, loading, onDelete, selected, onToggleSelect }: {
  task: TaskRow
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  today: string
  signal: { ready: boolean; reason: string | null; source: 'doc' | 'manual' | null }
  onAdvance: (task: TaskRow) => void
  loading: boolean
  onDelete: (task: TaskRow) => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const status = normalizeStatus(task.status)
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

      {/* 工程 */}
      <td className="px-3.5 py-2.5"><KoteiBadge phase={task.phase} /></td>

      {/* 業務区分 */}
      <td className="px-3.5 py-2.5"><GyomuBadge phase={task.phase} /></td>

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

      {/* ステータス（未着手 / 着手OK / 対応中 / 完了） */}
      <td className="px-3.5 py-2.5">
        {status === '完了' ? <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">完了</span>
          : status === '対応中' ? <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">対応中</span>
          : signal.ready ? <span className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"><PackageCheck className="w-3 h-3 flex-shrink-0" strokeWidth={2} />着手OK</span>
          : <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-500 border border-gray-200">未着手</span>}
      </td>

      {/* 着手OK理由 */}
      <td className="px-3.5 py-2.5">
        {signal.ready && signal.reason
          ? <span className="text-[12px] text-amber-800 line-clamp-2" title={signal.reason}>{signal.reason}</span>
          : <span className="text-[12px] text-gray-300">—</span>}
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
        {TASK_STATUSES.map(s => (
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

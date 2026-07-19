'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Plus, Briefcase, Layers, PackageCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SubTabs } from '@/components/ui/SubTabs'
import { Section } from '@/components/ui/InlineFields'
import MultiSelectFilter from '@/components/ui/MultiSelectFilter'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import TaskKanbanView from '@/components/features/tasks/TaskKanbanView'
import CaseTaskTableView from './CaseTaskTableView'
import CompleteTaskModal from '@/components/features/tasks/CompleteTaskModal'
import { LayoutGrid, List } from 'lucide-react'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import TabHeader from './TabHeader'
import { toReadinessReceipts, getStartSignal } from '@/lib/taskReadiness'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { isFinanceFreezeTask } from '@/lib/financeFreeze'
import type { TimelineReceipt } from './CaseTimeline'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
  onBulkGenerate: () => void
  onAddTask: () => void
  documentReceipts?: TimelineReceipt[]
  /** 案件ステータス。対応中以降は事務管理タスクを先頭・既定にする */
  caseStatus?: string
  /** 案件に凍結未確認の金融資産があるか（金融タスクの着手ハード制限） */
  financeFreezeBlocked?: boolean
}

// ステータス正規化（進捗バーの集計用）
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TasksTab({ tasks, currentMemberId: serverMemberId, onBulkGenerate, onAddTask, documentReceipts, caseStatus, financeFreezeBlocked = false }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const currentMemberId = useCurrentMember(serverMemberId)
  // 対応中以降（管理案件フェーズ）は事務管理タスク中心。それ以前は受注/管理担当タスク中心。
  const isManagementPhase = caseStatus === '対応中' || caseStatus === '完了'
  // 区分タブ（受注担当/管理担当＝system / 事務管理＝case）とステータス絞り込み（複数選択・全OFF=全表示）
  const [kind, setKind] = useState<'system' | 'case'>(isManagementPhase ? 'case' : 'system')
  // ステータス絞り込み（/tasks と同じ：単一選択 'all'/着手前/対応中/完了）＋着手OKトグル
  const [statusFilter, setStatusFilter] = useState<'all' | '着手前' | '対応中' | '完了'>('all')
  const [readyOnly, setReadyOnly] = useState(false)
  // 工程／業務区分フィルタ（OR・全空=絞り込みなし）。受注区分は1案件で固定のため出さない。
  const [koteiFilter, setKoteiFilter] = useState<Set<string>>(new Set())
  const [gyomuFilter, setGyomuFilter] = useState<Set<string>>(new Set())
  const [caseView, setCaseView] = useState<'kanban' | 'table'>('table')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null)
  const today = new Date().toISOString().split('T')[0]

  // カンバンの「着手→完了」アクション。事務管理タスクのカード操作用。
  const handleAdvance = async (task: TaskRow) => {
    if (busyId) return
    const current = normalizeStatus(task.status)
    if (current === '完了') return
    // 事務管理タスクの完了は完了ゲートを通す
    if (current === '対応中' && task.task_kind !== 'system') {
      setCompleteTask(task)
      return
    }
    // 金融資産調査・解約タスクは口座凍結が未確認だと着手不可（ハード制限）
    if (current === '着手前' && financeFreezeBlocked && isFinanceFreezeTask(task)) {
      showToast('口座の凍結確認が未完了です。財産調査タブで管理担当が凍結確認すると着手できます', 'error')
      return
    }
    setBusyId(task.id)
    try {
      const supabase = createClient()
      const next = current === '着手前' ? '対応中' : '完了'
      const patch: { status: string; started_by?: string; started_at?: string } = { status: next }
      if (next === '対応中' && currentMemberId && !task.started_by) {
        patch.started_by = currentMemberId
        patch.started_at = new Date().toISOString()
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
      if (error) throw error
      showToast(`「${task.title}」を${next === '対応中' ? '着手' : '完了'}しました`, 'success')
      startTransition(() => router.refresh())
    } catch (e) {
      console.error(e)
      showToast('エラーが発生しました', 'error')
    } finally {
      setBusyId(null)
    }
  }

  // 進捗率
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => normalizeStatus(t.status) === '完了').length
  const doingTasks = tasks.filter(t => normalizeStatus(t.status) === '対応中').length
  const todoTasks = tasks.filter(t => normalizeStatus(t.status) === '着手前').length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const systemCount = tasks.filter(t => t.task_kind === 'system').length
  const caseCount = tasks.filter(t => t.task_kind === 'case').length
  // 対応中以降は事務管理タスクを先頭、それ以前は受注/管理担当タスクを先頭にする
  const caseTab = { key: 'case', label: `事務管理タスク ${caseCount}` }
  const systemTab = { key: 'system', label: `受注担当/管理担当タスク ${systemCount}` }
  const KIND_TABS = isManagementPhase ? [caseTab, systemTab] : [systemTab, caseTab]

  const gyomuOf = (t: TaskRow) => (t.phase ?? '').replace(/^Phase\d+[:：]\s*/, '')
  // 業務区分の選択肢（事務管理タスクに存在するものを正準順序で）
  const gyomuOptions = useMemo(() => {
    const present = new Set<string>()
    for (const t of tasks) { if (t.task_kind !== 'case') continue; const g = gyomuOf(t); if (g) present.add(g) }
    const ordered = GYOMU_ALL.filter(g => present.has(g))
    const extra = [...present].filter(g => !GYOMU_ALL.includes(g))
    let all = [...ordered, ...extra]
    // 工程を選んでいるときは、その工程に紐づく業務だけに絞る
    if (koteiFilter.size > 0) all = all.filter(g => koteiFilter.has(koteiOf(g)))
    return all
  }, [tasks, koteiFilter])
  // 工程の選択肢（事務管理タスクに存在する工程を工程順で）
  const koteiOptions = useMemo(() => {
    const present = new Set<string>()
    for (const t of tasks) { if (t.task_kind === 'case') present.add(koteiOf(t.phase)) }
    return [...present].sort((a, b) => koteiRank(a) - koteiRank(b))
  }, [tasks])

  // 工程の選択が変わったら、その工程に属さない業務区分の選択は外す
  useEffect(() => {
    if (koteiFilter.size === 0) return
    setGyomuFilter(prev => {
      const next = new Set([...prev].filter(g => koteiFilter.has(koteiOf(g))))
      return next.size === prev.size ? prev : next
    })
  }, [koteiFilter])

  const receipts = useMemo(() => toReadinessReceipts(documentReceipts), [documentReceipts])

  const filtered = useMemo(() => tasks.filter(t => {
    if (t.task_kind !== kind) return false
    if (statusFilter !== 'all' && normalizeStatus(t.status) !== statusFilter) return false
    if (readyOnly && !getStartSignal(t, receipts).ready) return false
    if (kind === 'case' && koteiFilter.size > 0 && !koteiFilter.has(koteiOf(t.phase))) return false
    if (kind === 'case' && gyomuFilter.size > 0 && !gyomuFilter.has(gyomuOf(t))) return false
    return true
  }).sort((a, b) => {
    // 事務管理は工程順 → 業務 → sort_order で並べる（テーブルの基本順）
    if (kind !== 'case') return 0
    const kr = koteiRank(koteiOf(a.phase)) - koteiRank(koteiOf(b.phase))
    if (kr !== 0) return kr
    const gr = GYOMU_ALL.indexOf(gyomuOf(a)) - GYOMU_ALL.indexOf(gyomuOf(b))
    if (gr !== 0) return gr
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  }), [tasks, kind, statusFilter, readyOnly, receipts, koteiFilter, gyomuFilter])

  // ステータス別件数・着手OK件数（現在の区分タブのタスクに対して）
  const kindTasks = useMemo(() => tasks.filter(t => t.task_kind === kind), [tasks, kind])
  const counts = useMemo(() => ({
    all: kindTasks.length,
    着手前: kindTasks.filter(t => normalizeStatus(t.status) === '着手前').length,
    対応中: kindTasks.filter(t => normalizeStatus(t.status) === '対応中').length,
    完了: kindTasks.filter(t => normalizeStatus(t.status) === '完了').length,
  }), [kindTasks])
  const readyCount = useMemo(() => kindTasks.filter(t => getStartSignal(t, receipts).ready).length, [kindTasks, receipts])

  // タスク → 紐づく到着物名（受信簿の item_tasks リンク経由）
  const docNamesByTask = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of documentReceipts ?? []) {
      for (const it of (r.items ?? [])) {
        for (const lt of (it.item_tasks ?? [])) {
          const id = lt.task?.id
          if (!id) continue
          const arr = m.get(id) ?? []
          if (!arr.includes(it.item_name)) arr.push(it.item_name)
          m.set(id, arr)
        }
      }
    }
    return m
  }, [documentReceipts])

  return (
    <div className="space-y-3.5">
      <TabHeader
        title="タスク"
        description="この案件のタスク（事務管理・受注／管理担当）の進み具合を見ます。"
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" leftIcon={<ClipboardList className="w-3.5 h-3.5" strokeWidth={2} />} onClick={onBulkGenerate}>
              一括生成
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={onAddTask}>
              タスク追加
            </Button>
          </div>
        }
      />

      {/* 進捗バー */}
      {totalTasks > 0 && (
        <Section title="案件進捗">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">タスク進捗</span>
            <span className="text-sm font-bold text-brand-600">{progressPercent}% <span className="text-gray-400 font-normal text-xs">({completedTasks}/{totalTasks})</span></span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#059669' : progressPercent > 50 ? '#2563EB' : '#D97706',
              }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-[12px] text-gray-500">
            <span>着手前: {todoTasks}</span>
            <span>対応中: {doingTasks}</span>
            <span>完了: {completedTasks}</span>
          </div>
        </Section>
      )}

      {totalTasks === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm mb-3">タスクがありません</p>
          <button onClick={onBulkGenerate} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
            テンプレートからタスクを一括生成
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 区分タブ＋ステータス＋業務区分絞り込み */}
          <div className="flex items-center gap-3 flex-wrap">
            <SubTabs tabs={KIND_TABS} active={kind} onChange={k => setKind(k as 'system' | 'case')} />
            {/* ステータス（/tasks と同じ：単一選択＋件数＋すべて） */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
              {([['着手前', '未着手'], ['対応中', '対応中'], ['完了', '完了'], ['all', 'すべて']] as const).map(([key, label]) => {
                const active = statusFilter === key
                const cnt = counts[key as keyof typeof counts]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setStatusFilter(key); if (key !== '着手前') setReadyOnly(false) }}
                    className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ${active ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  >
                    {label}{cnt > 0 && <span className={`ml-1 text-[11px] font-mono ${active ? 'opacity-80' : 'opacity-60'}`}>{cnt}</span>}
                  </button>
                )
              })}
            </div>
            {/* 着手OK（事務管理タスク・未着手選択時のみ意味がある） */}
            {kind === 'case' && statusFilter === '着手前' && (
              <button
                type="button"
                onClick={() => setReadyOnly(v => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium border transition-colors whitespace-nowrap ${readyOnly ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                title="今すぐ着手できるタスクだけ表示"
              >
                <PackageCheck className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />着手OK
                {readyCount > 0 && <span className="text-[11px] font-mono opacity-70">{readyCount}</span>}
              </button>
            )}
            {/* 工程・業務区分（事務管理タスクのときのみ。受注区分は案件で固定なので出さない） */}
            {kind === 'case' && koteiOptions.length > 0 && (
              <MultiSelectFilter label="工程" icon={Layers} options={koteiOptions} selected={koteiFilter} onChange={setKoteiFilter} width={200} />
            )}
            {kind === 'case' && gyomuOptions.length > 0 && (
              <MultiSelectFilter label="業務区分" icon={Briefcase} options={gyomuOptions} selected={gyomuFilter} onChange={setGyomuFilter} width={220} />
            )}
            {/* カンバン⇄テーブル切替（事務管理タスクのみ） */}
            {kind === 'case' && (
              <div className="ml-auto inline-flex rounded-lg border border-gray-200 overflow-hidden">
                <button type="button" onClick={() => setCaseView('kanban')} className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold ${caseView === 'kanban' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}><LayoutGrid className="w-3.5 h-3.5" />カンバン</button>
                <button type="button" onClick={() => setCaseView('table')} className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold border-l border-gray-200 ${caseView === 'table' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}><List className="w-3.5 h-3.5" />テーブル</button>
              </div>
            )}
          </div>

          {kind === 'case' ? (
            <Section title="タスク（事務管理）">
              {caseView === 'kanban' ? (
                <TaskKanbanView
                  tasks={filtered}
                  today={today}
                  onAdvance={handleAdvance}
                  loadingTaskId={busyId}
                  receipts={receipts}
                  docNamesByTask={docNamesByTask}
                  hideCase
                />
              ) : (
                <CaseTaskTableView
                  tasks={filtered}
                  docNamesByTask={docNamesByTask}
                  today={today}
                  onAdvance={handleAdvance}
                  loadingTaskId={busyId}
                  receipts={receipts}
                  onRefresh={() => startTransition(() => router.refresh())}
                />
              )}
            </Section>
          ) : (
            <SystemTaskList
              tasks={filtered}
              title="タスク一覧"
              showCase={false}
              includeCompleted
              selectable
              hideCategory
              currentMemberId={currentMemberId ?? undefined}
            />
          )}
        </div>
      )}
      {completeTask && (
        <CompleteTaskModal
          task={completeTask}
          onClose={() => setCompleteTask(null)}
          onCompleted={() => { setCompleteTask(null); startTransition(() => router.refresh()) }}
        />
      )}
    </div>
  )
}

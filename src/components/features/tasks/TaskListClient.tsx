'use client'

import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, User, X, CheckCircle2, Trash2, ListChecks, Compass, HelpCircle, ChevronDown, ChevronsUpDown, SlidersHorizontal } from 'lucide-react'
import { HELP_TYPE_LABEL, type HelpType } from '@/lib/managerReviewTask'
import PageHeader from '@/components/ui/PageHeader'
import HelpHint from '@/components/ui/HelpHint'
import { TaskTabHelp } from '@/components/ui/TaskSeverityHelp'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import EditTaskModal from './EditTaskModal'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES, TASK_PRIORITIES, getWorkRoleDef } from '@/lib/constants'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { ASSISTANT_TASK_TABS, tabKeyOfGyomu, isHiddenForAssistant } from '@/lib/assistantTaskTabs'
import { taskSeverity, SEVERITY_RANK, SEVERITY_TAB, SEVERITY_TAB_NOTE, SEVERITY_LABEL, type TaskSeverity } from '@/lib/taskSeverity'
import { bizDaysUntil } from '@/lib/overdue'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { GyomuBadge } from '@/components/ui/KoteiBadge'
import { getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
import { useCurrentMember } from '@/lib/useCurrentMember'
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
  /** サブ管理担当（引継ぎ・応援。いないことが多い） */
  subManager?: CaseMemberInfo
}

type Props = {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  currentMemberId: string | null
  /** 受信簿（着手OK＝書類受領の判定に使う・1タスク1行に展開済み） */
  receipts?: ReadinessReceipt[]
  /** 担当区分スコープ。'assistant'=事務管理タスク一覧（既定）/ 'manager'=管理担当タスク一覧 */
  roleScope?: 'assistant' | 'manager'
  /** 金融凍結が未確認の口座を持つ案件ID（金融タスク着手不可） */
  financeBlockedCaseIds?: string[]
  /** 案件ID→金融資産（機関名・凍結確認）。解約タスクは機関単位で凍結ゲートを判定する。 */
  freezeAssetsByCase?: Record<string, Array<{ institution_name?: string | null; freeze_confirmed?: boolean | null }>>
  /** 事務管理ダッシュボードのタブに埋め込むとき。ページ見出しを出さず、検索欄だけ上に置く。 */
  embedded?: boolean
  /** バナーから飛んできたときの絞り込み指定。key が変わるたびに反映する。 */
  jump?: TaskJump | null
  /**
   * 案件詳細のタスクタブに埋め込むとき。
   * 一覧（事務管理タスク一覧）は「着手できるものだけ」を出すが、案件詳細では
   * この案件で作ったタスクを全部見たいので、着手できない未着手も出す（ステータスに「未着手」を足す）。
   * 案件・受注担当・管理担当の列は案件内で一定なので出さない。
   */
  caseScope?: boolean
  /**
   * 業務タブの「すべて」の右に差し込む追加タブ（事務管理ダッシュボードの郵便）。
   * このタブを開いている間は、タスク用の絞り込み（ステータス・遅れ・優先度）は関係ないので隠す。
   */
  extraTab?: {
    key: string
    label: string
    /** タブに出す件数（未対応の郵便物の数） */
    count: number
    /** タブの色。blue=当日 / green=翌営業日 / orange=2営業日以上そのまま */
    tone: 'blue' | 'green' | 'orange'
    content: ReactNode
  }
}

/** ダッシュボードのバナー →「すべて」タブを指定条件で絞った状態にする指示 */
export type TaskJump = {
  /** 押すたびに変わる値。同じ条件をもう一度押しても効くようにするため。 */
  key: string
  sev?: SevFilter
  priorities?: string[]
}

/** 遅れの絞り込み。タブの点と同じ4段階 */
export type SevFilter = 'all' | TaskSeverity

/**
 * 並び順。
 *   default  … 急ぎ→工程→業務→期限（今までの並び。何を先にやるかの標準）
 *   remain   … 期限までの残り営業日（asc＝ヤバい順。超過がいちばん上）
 *   priority … 優先度（asc＝超急ぎが上）
 */
export type SortKey = 'default' | 'remain' | 'priority'

// 一覧に載せるタスクかどうか（担当区分スコープでの振り分け）。
//   roleScope='manager'   … 管理担当タスク一覧（work_role='manager' のみ）
//   roleScope='assistant' … 事務管理タスク一覧（manager 以外。未分類・旧データもこちら）
// 事務管理ダッシュボードの工程別タブでも同じ判定を使うため、外に出して共有する。
export function isTaskInRoleScope(t: TaskRow, roleScope: 'assistant' | 'manager') {
  // 管理担当ヘルプ（systemタスク・ext_data.manager_review）は管理担当一覧に表示する
  const isManagerHelp = t.task_kind === 'system' && !!(t.ext_data as Record<string, unknown> | null)?.manager_review
  if (isManagerHelp) return roleScope === 'manager'
  if (t.task_kind !== 'case' && t.work_role !== 'assistant' && t.work_role !== 'manager') return false
  if (t.task_kind === 'system') return false
  return roleScope === 'manager' ? t.work_role === 'manager' : t.work_role !== 'manager'
}

// 事務管理タスク一覧では差戻しを扱わないため「対応中」へ吸収。
// 古い「Wチェック待ち / 保留」も同様に「対応中」へ。
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

// 優先度セルの見た目。急ぎ＝黄／超急ぎ＝赤（案件詳細のタスクタブと同じ）。
// 急ぎ・超急ぎだけ太字にして、通常の行に埋もれないようにする。
function priorityCls(p: string | null | undefined) {
  if (p === '超急ぎ') return 'bg-red-100 text-red-800 border-red-300 font-bold'
  if (p === '急ぎ') return 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
  return 'bg-white text-gray-500 border-gray-200 font-medium'
}
// 急ぎ・超急ぎだけを上へ持ち上げる。通常のタスクは今までどおり工程順のまま。
const priorityRank = (p: string | null | undefined) => (p === '超急ぎ' ? 0 : p === '急ぎ' ? 1 : 2)

// 業務区分 = task.phase（"PhaseN:" 接頭辞を除く）
const gyomuOf = (t: TaskRow) => (t.phase ?? '').replace(/^Phase\d+[:：]\s*/, '')

// 遅れの絞り込みチップ。タブの点と同じ4色・同じ判定。
const SEV_CHIPS: TaskSeverity[] = ['blue', 'green', 'orange', 'red']
function SevChip({ sev, on, onClick }: { sev: TaskSeverity; on: boolean; onClick: () => void }) {
  const c = SEVERITY_TAB[sev]
  return (
    <button type="button" onClick={onClick} title={SEVERITY_TAB_NOTE[sev]}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold border transition-colors ${
        on ? `${c.badge} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-none ${c.dot}`} />
      {SEVERITY_LABEL[sev]}
    </button>
  )
}

// 優先度の絞り込みチップ。押すたびにON/OFF。
const CHIP_ON: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  red: 'bg-red-100 text-red-800 border-red-300',
  gray: 'bg-gray-200 text-gray-800 border-gray-300',
}
function Chip({ label, note, tone, on, onClick }: {
  label: string; note?: string; tone: keyof typeof CHIP_ON; on: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold border transition-colors ${
        on ? CHIP_ON[tone] : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700'}`}>
      {label}
      {note && <span className={`text-[10.5px] font-normal ${on ? 'opacity-70' : 'text-gray-400'}`}>{note}</span>}
    </button>
  )
}

// 郵便タブの色。当日=青／翌営業日=緑／2営業日以上そのまま=オレンジ。
const EXTRA_TAB_TONE = {
  blue:   { text: 'text-brand-700',  dot: 'bg-brand-500',  badge: 'bg-brand-100 text-brand-700' },
  green:  { text: 'text-emerald-700', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  orange: { text: 'text-orange-700', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
} as const

export default function TaskListClient({ tasks, caseMap, allMembers, currentMemberId: serverMemberId, receipts = [], roleScope = 'assistant', financeBlockedCaseIds = [], freezeAssetsByCase = {}, embedded = false, jump = null, caseScope = false, extraTab }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentMemberId = useCurrentMember(serverMemberId)

  // 既定は「着手前」のみ。月数百件規模になるため、出社→次やる即発見の動線を最優先。
  const [statusFilter, setStatusFilter] = useState<string>('着手前')
  // 自分のタスクは既定OFF。出社直後は未アサインの着手前を拾うのが日常動線。
  const [filterMine, setFilterMine] = useState(searchParams.get('assignee') === 'mine')
  // 外出タスク（役所・銀行など外で行う作業）だけに絞る
  const [outingOnly, setOutingOnly] = useState(false)
  // 業務タブ（戸籍／不動産調査／…／その他）。'all'＝すべて。
  // 以前は工程(KOTEI)で絞らせていたが、実務と対応しない中間の括りだったので置き換えた。
  const [taskTab, setTaskTab] = useState<string>('all')
  // 遅れ・優先度の絞り込み。業務タブを切り替えても外れない（どのタブでも同じ条件で見たいため）。
  const [sevFilter, setSevFilter] = useState<SevFilter>('all')
  const [priFilter, setPriFilter] = useState<Set<string>>(() => new Set())
  // 並び替え。見出しを押すと切り替わる。同じ列をもう一度押すと昇順⇔降順。
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = useCallback((k: SortKey) => {
    setSortKey(prev => {
      if (prev === k) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return k }
      setSortDir('asc')   // 期限も優先度も「ヤバい順」が既定
      return k
    })
  }, [])
  // 「着手OK」「受領次第OK」トグル（着手前の中の絞り込み）。既定は両方ON＝今やれる/もうすぐやれるものだけ表示。
  const [search, setSearch] = useState('')
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null)
  // 一括操作用の選択状態
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('assignee') === 'mine') setFilterMine(true)
  }, [searchParams])

  // ダッシュボードのバナーから飛んできたら、その条件で絞った「すべて」タブを開く。
  // effect の中で setState すると lint に止められるので、レンダー中に前回値と比べて入れ直す。
  const jumpKey = jump?.key ?? ''
  const [appliedJump, setAppliedJump] = useState(jumpKey)
  if (jumpKey !== appliedJump) {
    setAppliedJump(jumpKey)
    if (jump) {
      setTaskTab('all')
      setStatusFilter('all')   // バナーには対応中のタスクも入るため、着手OK縛りを外す
      setFilterMine(false)
      setSearch('')
      setSevFilter(jump.sev ?? 'all')
      setPriFilter(new Set(jump.priorities ?? []))
    }
  }

  const today = new Date().toISOString().split('T')[0]
  // 追加タブ（郵便）を開いているか。開いている間はタスクの絞り込みを出さない。
  const onExtraTab = !!extraTab && taskTab === extraTab.key

  // 案件タスク（task_kind='case'）を担当区分(work_role)で振り分ける。
  // 受注/管理担当の初期タスク(task_kind='system')はどちらの一覧からも除外。
  // 一覧に載せるのは「着手OK・対応中・完了」だけ。
  // 着手できないタスク（受領待ち・前段が終わっていない）まで並べると、
  // やり残しが山ほどあるように見えて手が止まるため、着手できるものだけを出す。
  const assistantTasks = useMemo(
    () => tasks.filter(t => {
      if (!isTaskInRoleScope(t, roleScope)) return false
      if (caseScope) return true   // 案件詳細＝この案件で作ったタスクを全部出す
      return normalizeStatus(t.status) !== '着手前' || getStartSignal(t, receipts).ready
    }),
    [tasks, roleScope, receipts, caseScope],
  )
  /** 着手前のうち、いま着手できるか。案件詳細では「未着手」と「着手OK」を分けるのに使う。 */
  const isReady = useCallback((t: TaskRow) => getStartSignal(t, receipts).ready, [receipts])

  const filtered = useMemo(() => {
    let result = assistantTasks
    if (statusFilter === 'notReady') result = result.filter(t => normalizeStatus(t.status) === '着手前' && !isReady(t))
    else if (statusFilter === '着手前') result = result.filter(t => normalizeStatus(t.status) === '着手前' && (!caseScope || isReady(t)))
    else if (statusFilter !== 'all') result = result.filter(t => normalizeStatus(t.status) === statusFilter)
    if (filterMine && currentMemberId) {
      result = result.filter(t =>
        t.started_by === currentMemberId ||
        (t.task_assignees ?? []).some(a => a.member_id === currentMemberId && a.role === 'primary'),
      )
    }
    // 相続登記は相続登記チームの持ち場。事務管理の一覧には出さない（案件詳細では出す）。
    if (roleScope === 'assistant' && !caseScope) {
      result = result.filter(t => !isHiddenForAssistant(gyomuOf(t)))
    }
    // 業務タブ（'all' 以外は そのタブに属する業務のタスクだけ）
    if (taskTab !== 'all') {
      result = result.filter(t => tabKeyOfGyomu(gyomuOf(t)) === taskTab)
    }
    // 遅れ・優先度の絞り込み（業務タブに関係なく効く）
    if (sevFilter !== 'all') {
      result = result.filter(t => taskSeverity(t, today) === sevFilter)
    }
    if (priFilter.size > 0) {
      result = result.filter(t => priFilter.has(t.priority || '通常'))
    }
    if (outingOnly) {
      result = result.filter(t => ((t.ext_data ?? {}) as Record<string, unknown>).outing === true)
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
    // 見出しで選んだ並び。期限なしは常に最後（並べる基準がないため）。
    if (sortKey !== 'default') {
      const sign = sortDir === 'asc' ? 1 : -1
      const val = (t: TaskRow) =>
        sortKey === 'remain'
          ? (t.due_date ? bizDaysUntil(t.due_date, today) : null)
          : priorityRank(t.priority)
      return [...result].sort((a, b) => {
        const av = val(a), bv = val(b)
        if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1
        if (av !== bv) return (av - bv) * sign
        // 同じ値のときは期限が近い順で落ち着かせる
        return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
      })
    }
    // 既定の並び: 急ぎ・超急ぎ（未完了のみ）→ 工程順 → 業務 → 着手OK → 期限超過 → 期限近い順
    return [...result].sort((a, b) => {
      // 急ぎ・超急ぎは工程を飛び越えて先頭へ。完了済みは持ち上げない。
      const ap = normalizeStatus(a.status) === '完了' ? 2 : priorityRank(a.priority)
      const bp = normalizeStatus(b.status) === '完了' ? 2 : priorityRank(b.priority)
      if (ap !== bp) return ap - bp
      const kr = koteiRank(koteiOf(a.phase)) - koteiRank(koteiOf(b.phase))
      if (kr !== 0) return kr
      const gr = GYOMU_ALL.indexOf(gyomuOf(a)) - GYOMU_ALL.indexOf(gyomuOf(b))
      if (gr !== 0) return gr
      const aOver = !!(a.due_date && a.due_date < today && normalizeStatus(a.status) !== '完了')
      const bOver = !!(b.due_date && b.due_date < today && normalizeStatus(b.status) !== '完了')
      if (aOver !== bOver) return aOver ? -1 : 1
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    })
  }, [assistantTasks, statusFilter, filterMine, taskTab, search, caseMap, currentMemberId, today, sevFilter, priFilter, outingOnly, sortKey, sortDir, caseScope, isReady])

  // 業務タブごとの件数と重さ。タブの並びは定義どおり固定で、0件でも出す
  // （「そのタブは今やることが無い」ことが分かるほうが探しやすい）。
  //
  // 数字 … 着手OK（いま手をつけられるもの）だけ。対応中は数えない。
  // 色   … そのタブの未完了タスクのいちばん重い段階。判定はダッシュボード上部のバナーと同じ。
  const tabInfo = useMemo(() => {
    const m: Record<string, { ready: number; sev: TaskSeverity }> = {}
    const touch = (k: string) => (m[k] ??= { ready: 0, sev: 'blue' })
    touch('all')
    for (const t of assistantTasks) {
      if (normalizeStatus(t.status) === '完了') continue
      const sev = taskSeverity(t, today)
      const isReady = normalizeStatus(t.status) === '着手前'
      for (const k of [tabKeyOfGyomu(gyomuOf(t)), 'all']) {
        const e = touch(k)
        if (isReady) e.ready += 1
        if (SEVERITY_RANK[sev] < SEVERITY_RANK[e.sev]) e.sev = sev
      }
    }
    return m
  }, [assistantTasks, today])

  const kpis = useMemo(() => {
    const pre = assistantTasks.filter(t => normalizeStatus(t.status) === '着手前')
    return {
      total: assistantTasks.length,
      // 案件詳細では着手前を「未着手（まだ着手できない）」と「着手OK」に割る
      notReady: caseScope ? pre.filter(t => !isReady(t)).length : 0,
      todo: caseScope ? pre.filter(t => isReady(t)).length : pre.length,
      doing: assistantTasks.filter(t => normalizeStatus(t.status) === '対応中').length,
      // 確認中＝タスク詳細から「担当に確認する」で相談を送り、回答待ちのもの
      reviewing: assistantTasks.filter(t => normalizeStatus(t.status) === '確認中').length,
      done: assistantTasks.filter(t => normalizeStatus(t.status) === '完了').length,
    }
  }, [assistantTasks, caseScope, isReady])

  const myTaskCount = currentMemberId
    ? assistantTasks.filter(t =>
        normalizeStatus(t.status) !== '完了' && (
          t.started_by === currentMemberId ||
          (t.task_assignees ?? []).some(a => a.member_id === currentMemberId && a.role === 'primary')
        ),
      ).length
    : 0

  // 優先度は一覧のその場で変えられる（急ぎ・超急ぎは行の色が変わり、先頭に持ち上がる）
  const setPriority = useCallback(async (task: TaskRow, priority: string) => {
    const { error } = await createClient().from('tasks').update({ priority }).eq('id', task.id)
    if (error) { showToast(`優先度の変更に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }, [router])


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
      <div className={embedded ? 'pb-3 mb-3 border-b border-gray-200' : 'sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-3 bg-white border-b border-gray-200 mb-4'}>
        {embedded ? (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 w-[280px] mb-2.5">
            <Search className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="タスク名・案件名・番号で検索"
              className="bg-transparent border-none outline-none text-xs text-gray-700 w-full placeholder:text-gray-400" />
          </div>
        ) : (
        <PageHeader
          eyebrow="Tasks"
          title={roleScope === 'manager' ? '管理担当タスク一覧' : '事務管理タスク一覧'}
          icon={roleScope === 'manager' ? Compass : ListChecks}
          description={roleScope === 'manager' ? '管理担当が行う作業タスクを管理' : '事務管理担当のタスクを管理'}
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
        )}

        {/* Toolbar: 大きいステータス（毎日押す）＋ 絞り込み（遅れ・優先度をたたむ）＋ 自分のタスク */}
        <div className={`flex items-center gap-2.5 flex-wrap ${onExtraTab ? 'hidden' : ''}`}>
          {/* ステータス：よく見る「対応中・着手OK」を左に寄せ、押しやすいよう少し大きく。 */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <FilterTab label="着手OK"   count={kpis.todo}     active={statusFilter === '着手前'} onClick={() => setStatusFilter('着手前')} big />
            <FilterTab label="対応中"   count={kpis.doing}    active={statusFilter === '対応中'} onClick={() => setStatusFilter('対応中')} big />
            <FilterTab label="確認中"   count={kpis.reviewing} active={statusFilter === '確認中'} onClick={() => setStatusFilter('確認中')} big />
            {caseScope && (
              <FilterTab label="未着手" count={kpis.notReady} active={statusFilter === 'notReady'} onClick={() => setStatusFilter('notReady')} big />
            )}
            <FilterTab label="完了"     count={kpis.done}     active={statusFilter === '完了'}   onClick={() => setStatusFilter('完了')} big />
            <FilterTab label="すべて"   count={kpis.total}    active={statusFilter === 'all'}    onClick={() => setStatusFilter('all')} big />
          </div>

          {/* 遅れ・優先度は普段たたんでおく。絞っている数はボタンの青バッジで見える。 */}
          <FilterMenu sevFilter={sevFilter} setSevFilter={setSevFilter} priFilter={priFilter} setPriFilter={setPriFilter} outingOnly={outingOnly} setOutingOnly={setOutingOnly} />

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

        {/* 業務タブ（実務タブ・実施業務と同じ名前で分ける）。左の点＝そのタブでいちばん重いタスク。 */}
        <div className="flex items-center gap-0.5 flex-wrap mt-2.5 border-b border-gray-200 -mb-3">
          {extraTab && (() => {
            const on = taskTab === extraTab.key
            const c = EXTRA_TAB_TONE[extraTab.tone]
            return (
              <button type="button" onClick={() => setTaskTab(extraTab.key)}
                title="未対応の郵便物。当日=青／翌営業日=緑／2営業日以上そのまま=オレンジ"
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors order-1 ${
                  on ? `border-brand-600 ${c.text}` : `border-transparent ${c.text} hover:text-gray-800`}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${c.dot}`} />
                {extraTab.label}
                <span className={`font-mono text-[11.5px] px-1.5 py-0.5 rounded-full ${c.badge}`}>{extraTab.count}</span>
              </button>
            )
          })()}
          {[{ key: 'all', label: 'すべて' }, ...ASSISTANT_TASK_TABS].map((t, i) => {
            const on = taskTab === t.key
            const info = tabInfo[t.key]
            const n = info?.ready ?? 0
            const sev = info?.sev ?? 'blue'
            const c = SEVERITY_TAB[sev]
            return (
              <button key={t.key} type="button" onClick={() => setTaskTab(t.key)}
                title={SEVERITY_TAB_NOTE[sev]}
                style={{ order: i === 0 ? 0 : i + 1 }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
                  on
                    ? `border-brand-600 ${sev === 'blue' ? 'text-brand-700' : c.text}`
                    : `border-transparent ${c.text} hover:text-gray-800`}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${c.dot}`} />
                {t.label}
                <span className={`font-mono text-[11.5px] px-1.5 py-0.5 rounded-full ${
                  sev === 'blue' && on ? 'bg-brand-100 text-brand-700' : c.badge}`}>{n}</span>
              </button>
            )
          })}
          <span className="ml-1.5 self-center">
            <HelpHint title="この数字と色の見かた"><TaskTabHelp /></HelpHint>
          </span>
        </div>
      </div>

      {onExtraTab ? extraTab!.content : (
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
        onEdit={setEditTask}
        onDelete={setDeleteTask}
        onSetPriority={setPriority}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        roleScope={roleScope}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        caseScope={caseScope}
      />
      </>
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
  onEdit: _onEdit,
  onDelete,
  onSetPriority,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  roleScope,
  sortKey,
  sortDir,
  onSort,
  caseScope,
}: {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  today: string
  onEdit: (task: TaskRow) => void
  onDelete: (task: TaskRow) => void
  onSetPriority: (task: TaskRow, priority: string) => void
  selectedIds: Set<string>
  onToggleSelect: (taskId: string) => void
  onToggleSelectAll: (visibleIds: string[]) => void
  roleScope: 'assistant' | 'manager'
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  caseScope: boolean
}) {
  // 列は運用の指定どおり：タスク上げ日／案件番号／依頼者名／業務分類／タスク内容／
  // 優先度／管理担当／タスク起票者／タスク詳細（＋選択・操作・削除）。
  // 担当区分・ステータス・着手OK理由・期限・残り・実施結果・受注担当は出さない
  // （ステータスと着手OK理由は「作った時点で着手OK」の運用でほぼ一定になった）。
  // 列幅は固定。ドラッグでの変更はやめた（人によって幅が変わり、
  // 日付や案件番号が「2026-0…」「2608SD0…」と切れる事故が起きていた）。
  // 幅は中身の実測（日付90px／案件番号101px）＋左右余白24pxで決めている。
  const widths = {
    select: 40, createdAt: 120, caseNo: 132, clientName: 150, gyomu: 110, title: 300,
    priority: 104, manager: 124, creator: 116, work: 284, ops: 40,
  } as const
  // sort を持つ列は見出しを押すと並び替えできる。
  const HEADERS: Array<{ key: keyof typeof widths; label: string; sort?: SortKey }> = [
    { key: 'select',     label: '' },
    { key: 'createdAt',  label: 'タスク起票日' },
    ...(!caseScope ? [
      { key: 'caseNo' as const,     label: '案件番号' },
      { key: 'clientName' as const, label: '依頼者名' },
    ] : []),
    { key: 'gyomu',      label: '業務分類' },
    { key: 'title',      label: 'タスク内容' },
    { key: 'priority',   label: '優先度', sort: 'priority' },
    { key: 'manager',    label: '管理担当' },
    { key: 'creator',    label: 'タスク起票者' },
    { key: 'work',       label: '作業内容' },
    { key: 'ops',        label: '' },
  ]

  const visibleIds = tasks.map(t => t.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const someSelected = visibleIds.some(id => selectedIds.has(id))

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-brand-900">タスク一覧</h2>
        <span className="text-[13px] text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
          {tasks.length}件
        </span>
        <div className="flex-1" />
      </div>

      {tasks.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-gray-400">該当するタスクがありません</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="list-table list-table--task border-collapse" style={{ tableLayout: 'fixed', width: HEADERS.reduce((s, h) => s + widths[h.key], 0) }}>
          <colgroup>
            {HEADERS.map(h => <col key={h.key} style={{ width: widths[h.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              {HEADERS.map(h => (
                <th
                  key={h.key}
                  className="relative text-left px-3.5 py-2.5 text-[12px] font-bold text-gray-600 tracking-wider uppercase bg-gray-50 border-b border-gray-300"
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
                  ) : h.sort ? (
                    <button type="button" onClick={() => onSort(h.sort!)}
                      title={`${h.label}で並び替え`}
                      className={`inline-flex items-center gap-0.5 truncate hover:text-brand-900 ${sortKey === h.sort ? 'text-brand-900' : ''}`}>
                      {h.label}
                      {sortKey === h.sort
                        ? <ChevronDown className={`w-3 h-3 flex-none transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                        : <ChevronsUpDown className="w-3 h-3 flex-none opacity-40" strokeWidth={2.5} />}
                    </button>
                  ) : (
                    <span className="truncate block">{h.label}</span>
                  )}
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
                onDelete={onDelete}
                onSetPriority={onSetPriority}
                selected={selectedIds.has(task.id)}
                onToggleSelect={() => onToggleSelect(task.id)}
                roleScope={roleScope}
                caseScope={caseScope}
              />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

// ─── 1行 ───
function TaskRow({ task, caseMap, allMembers: _allMembers, today, onDelete, onSetPriority, selected, onToggleSelect, roleScope, caseScope }: {
  task: TaskRow
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  today: string
  onDelete: (task: TaskRow) => void
  onSetPriority: (task: TaskRow, priority: string) => void
  selected: boolean
  onToggleSelect: () => void
  roleScope: 'assistant' | 'manager'
  caseScope: boolean
}) {
  const status = normalizeStatus(task.status)
  const caseInfo = caseMap[task.case_id]
  const isOverdue = !!(task.due_date && task.due_date < today && status !== '完了')
  const workRole = getWorkRoleDef(task.work_role)
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  return (
    <tr className={`group border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60 transition-colors relative ${
      selected ? 'bg-brand-50/60'
      : status !== '完了' && task.priority === '超急ぎ' ? 'bg-red-50'
      : status !== '完了' && task.priority === '急ぎ' ? 'bg-amber-50/70'
      : isOverdue ? 'bg-red-50/30' : ''
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

      {/* タスク上げ日（起票日） */}
      <td className="px-3.5 py-2.5">
        <span className="text-[12.5px] font-mono text-gray-500">{task.created_at ? task.created_at.slice(0, 10) : '—'}</span>
      </td>

      {/* 案件番号・依頼者名（案件詳細では全行同じなので出さない） */}
      {!caseScope && (<>
      <td className="px-3.5 py-2.5">
        {caseInfo ? (
          <a href={`/cases/${task.case_id}`} className="text-[12.5px] font-mono text-brand-700 hover:underline truncate block">{caseInfo.case_number}</a>
        ) : <span className="text-[12px] text-gray-300">—</span>}
      </td>
      <td className="px-3.5 py-2.5">
        {caseInfo ? (
          <a href={`/cases/${task.case_id}`} className="text-[13px] text-gray-700 hover:text-brand-600 hover:underline truncate block">{caseInfo.deal_name}</a>
        ) : <span className="text-[12px] text-gray-300">—</span>}
      </td>
      </>)}

      {/* 業務分類 */}
      <td className="px-3.5 py-2.5"><GyomuBadge phase={task.phase} /></td>

      {/* タスク名 */}
      <td className="px-3.5 py-2.5 relative">
        {/* 担当区分カラーバー（左端）。一覧スコープと同じ区分なら自明なので出さない。期限超過の赤バーは常に出す。 */}
        {(isOverdue || (workRole && workRole.key !== roleScope)) && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ backgroundColor: isOverdue ? '#DC2626' : workRole?.bar }}
            title={isOverdue ? '期限超過' : workRole?.label}
          />
        )}
        <div className="flex items-center gap-1.5 min-w-0 pl-1">
          {/* 一覧のスコープと同じ担当区分のバッジは自明なので出さない（例：事務管理タスク一覧で「事務」を出さない）。 */}
          {workRole && workRole.key !== roleScope && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold border flex-shrink-0 ${workRole.pill}`}
              title={workRole.label}
            >
              <workRole.Icon className="w-3 h-3" strokeWidth={2.25} />
              {workRole.shortLabel}
            </span>
          )}
          {ext.outing === true && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 flex-shrink-0" title="外出タスク（役所・銀行など外で行う作業）">外出</span>
          )}
          {!!ext.manager_review && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
              <HelpCircle className="w-3 h-3" strokeWidth={2.25} />ヘルプ{typeof ext.help_type === 'string' ? `・${HELP_TYPE_LABEL[ext.help_type as HelpType] ?? ''}` : ''}
            </span>
          )}
          <a
            href={`/tasks/${task.id}`}
            className={`text-[13px] font-medium truncate ${status === '完了' ? 'text-gray-400 line-through' : 'text-gray-800 hover:text-brand-600'}`}
          >
            {task.title}
          </a>
        </div>
        {/* 管理担当ヘルプ：依頼内容＋元タスクへのリンク */}
        {!!ext.manager_review && (
          <div className="pl-1 mt-0.5 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
            {typeof ext.content === 'string' && ext.content && <span className="truncate max-w-[280px]">「{ext.content}」</span>}
            {typeof ext.from_task_id === 'string' && ext.from_task_id && (
              <a href={`/tasks/${ext.from_task_id}`} className="text-brand-600 hover:underline flex-shrink-0">元タスク：{typeof ext.from_task === 'string' && ext.from_task ? ext.from_task : '開く'}</a>
            )}
          </div>
        )}
      </td>

      {/* 優先度（その場で変えられる）。急ぎ・超急ぎは離れて見ても分かるよう大きめに。 */}
      <td className="px-2.5 py-2.5">
        <select
          value={task.priority ?? '通常'}
          onChange={e => onSetPriority(task, e.target.value)}
          className={`w-full pl-2 pr-5 py-1 rounded-md text-[14px] border outline-none cursor-pointer ${priorityCls(task.priority)}`}
          title="優先度を変える"
        >
          {['通常', '急ぎ', '超急ぎ'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
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
        {/* サブ管理担当（引継ぎ・応援）。列は増やさず主担当の下に小さく出す */}
        {caseInfo?.subManager && (
          <span className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
            <span className="truncate">{caseInfo.subManager.name}</span>
            <span className="px-1 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 flex-none">サブ</span>
          </span>
        )}
      </td>

      {/* タスク起票者。自動生成（created_by なし）は — */}
      <td className="px-3.5 py-2.5">
        {(() => {
          const name = task.created_by_member?.name ?? _allMembers.find(m => m.id === task.created_by)?.name ?? null
          return name
            ? <span className="text-[13px] text-gray-700 truncate block">{name}</span>
            : <span className="text-[12px] text-gray-300" title="自動生成タスク">—</span>
        })()}
      </td>

      {/* 作業内容。長いものはセル内で縦スクロールさせ、行の高さは全行そろえる。 */}
      <td className="px-3.5 py-2.5 align-top">
        {task.procedure_text?.trim() ? (
          <div className="max-h-[58px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-[12px] text-gray-600 pr-1.5">
            {task.procedure_text}
          </div>
        ) : <span className="text-[12px] text-gray-300">—</span>}
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
function FilterTab({ label, active, onClick, count, accent, big }: { label: string; active: boolean; onClick: () => void; count?: number; accent?: 'danger'; big?: boolean }) {
  const activeCls = accent === 'danger'
    ? 'bg-red-600 text-white font-semibold shadow-sm'
    : 'bg-brand-600 text-white font-semibold shadow-sm'
  const inactiveCls = accent === 'danger' && count && count > 0
    ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
  return (
    <button
      onClick={onClick}
      className={`rounded-md font-semibold transition-colors whitespace-nowrap ${big ? 'px-3.5 py-1.5 text-[13px]' : 'px-2.5 py-1 text-[12px]'} ${active ? activeCls : inactiveCls}`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1 font-mono ${big ? 'text-[12px]' : 'text-[11px]'} ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
      )}
    </button>
  )
}

// 遅れ・優先度の絞り込み。普段はたたんでおき、「絞り込み ▼」で開く。
// 毎日押すステータスの邪魔をしないためにまとめた。絞っている数はボタンの青バッジで見える。
function FilterMenu({ sevFilter, setSevFilter, priFilter, setPriFilter, outingOnly, setOutingOnly }: {
  sevFilter: SevFilter
  setSevFilter: (updater: (v: SevFilter) => SevFilter) => void
  priFilter: Set<string>
  setPriFilter: (updater: (prev: Set<string>) => Set<string>) => void
  outingOnly: boolean
  setOutingOnly: (v: boolean | ((prev: boolean) => boolean)) => void
}) {
  const [open, setOpen] = useState(false)
  const activeCount = (sevFilter !== 'all' ? 1 : 0) + priFilter.size + (outingOnly ? 1 : 0)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
          activeCount > 0 ? 'bg-white border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} />
        絞り込み
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[11px] font-bold">{activeCount}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open && (
        <>
          {/* 外側クリックで閉じる */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-20 w-[320px] bg-white border border-gray-200 rounded-xl shadow-lg p-3.5">
            <div className="text-[11.5px] font-semibold text-gray-500 mb-2">遅れ</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SEV_CHIPS.map(s => (
                <SevChip key={s} sev={s} on={sevFilter === s}
                  onClick={() => setSevFilter(v => (v === s ? 'all' : s))} />
              ))}
            </div>
            <div className="text-[11.5px] font-semibold text-gray-500 mb-2">優先度</div>
            <div className="flex flex-wrap gap-1.5">
              {TASK_PRIORITIES.map(p => (
                <Chip key={p.key} label={p.label}
                  tone={p.key === '超急ぎ' ? 'red' : p.key === '急ぎ' ? 'amber' : 'gray'}
                  on={priFilter.has(p.key)}
                  onClick={() => setPriFilter(prev => {
                    const next = new Set(prev)
                    if (next.has(p.key)) next.delete(p.key); else next.add(p.key)
                    return next
                  })} />
              ))}
            </div>
            <div className="text-[11.5px] font-semibold text-gray-500 mt-3 mb-2">種類</div>
            <div className="flex flex-wrap gap-1.5">
              <Chip label="外出タスク" tone="gray" on={outingOnly} onClick={() => setOutingOnly(v => !v)} />
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 mt-3 pt-2.5">
              <span className="text-[11.5px] text-gray-400">{activeCount > 0 ? `${activeCount}件を選択中` : '絞り込みなし'}</span>
              {activeCount > 0 && (
                <button type="button" onClick={() => { setSevFilter(() => 'all'); setPriFilter(() => new Set()); setOutingOnly(false) }}
                  className="text-[12px] font-semibold text-brand-600 hover:text-brand-700">すべて解除</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown, ChevronLeft, Loader2, Plus, X, ListPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { getPhaseLabel, getPhaseColor } from '@/lib/phases'
import { PHASES } from '@/lib/constants'
import type { TaskRow, TaskDependencyRow, TaskTemplateRow } from '@/types'

/**
 * direction='next': 「このタスクが終わったら → 次タスク」を紐づける
 * direction='prev': 「前のタスク → このタスク」を紐づける（前段作業の指定）
 */
type Direction = 'prev' | 'next'

type Props = {
  currentTask: TaskRow
  direction?: Direction
  /** 同一案件の他タスク（候補） */
  candidates: TaskRow[]
  /** 既に紐づいているタスクの ID セット（direction に応じて prev / next 側） */
  linkedIds: Set<string>
  /** 既存の dependency 行（解除用に dep.id を保持） */
  existingDeps: TaskDependencyRow[]
  /** タスクテンプレ（新規タスク作成フォームの候補） */
  taskTemplates?: TaskTemplateRow[]
}

const STATUS_BADGE: Record<string, string> = {
  '着手前': 'bg-gray-100 text-gray-600',
  '対応中': 'bg-blue-100 text-blue-700',
  '完了': 'bg-green-100 text-green-700',
}

type Mode = 'idle' | 'picker' | 'create'

/**
 * 「このタスクが終わったら」セクション
 *
 * 2段表示:
 *   - デフォルト: 紐づけ済みタスクだけリスト表示（解除は × ボタン）
 *   - 操作: 「+ 既存タスクから選ぶ」「+ 新しく作成」ボタン
 *     - ピッカー: 未紐づけのタスクのみチェックボックスで表示（検索付き）
 *     - 作成: タスク名(テンプレ候補 or 自由入力) + Phase の最小フォーム
 */
export default function NextTaskSelector({ currentTask, direction = 'next', candidates, linkedIds, existingDeps, taskTemplates = [] }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState<Mode>('idle')

  const refresh = () => startTransition(() => router.refresh())

  // ラベル類は direction で切り替え
  const isPrev = direction === 'prev'
  const headerLabel = isPrev ? 'このタスクの前のタスク' : 'このタスクが終わったら'
  const HeaderIcon = isPrev ? ChevronLeft : ChevronRight
  // 0件時の表示: スタート/ゴール地点として明示
  const emptyEmoji = isPrev ? '🚩' : '🏁'
  const emptyTitle = isPrev
    ? 'このタスクは案件のスタート地点です'
    : 'このタスクはゴール地点です'
  const emptySub = isPrev ? '前のタスクはありません' : '次のタスクはありません'

  // 紐づけ済みタスクの配列
  //   - next: existingDeps[].to_task
  //   - prev: existingDeps[].from_task
  const linkedTasks = useMemo(() => {
    const pick = (d: TaskDependencyRow) => (isPrev ? d.from_task : d.to_task)
    const fromDeps = existingDeps
      .map(pick)
      .filter((t): t is TaskRow => !!t)
    if (fromDeps.length === existingDeps.length) return fromDeps
    return Array.from(linkedIds)
      .map(id => candidates.find(c => c.id === id))
      .filter((t): t is TaskRow => !!t)
  }, [existingDeps, linkedIds, candidates, isPrev])

  // 候補（紐づいてない、完了済みでない、自分以外）
  const unlinkedCandidates = useMemo(
    () => candidates.filter(t => t.status !== '完了' && !linkedIds.has(t.id)),
    [candidates, linkedIds]
  )

  const handleLink = async (taskId: string) => {
    setBusyId(taskId)
    try {
      const supabase = createClient()
      // direction='next': currentTask → taskId
      // direction='prev': taskId → currentTask
      const payload = isPrev
        ? { case_id: currentTask.case_id, from_task_id: taskId, to_task_id: currentTask.id, condition_type: 'task_completed' as const }
        : { case_id: currentTask.case_id, from_task_id: currentTask.id, to_task_id: taskId, condition_type: 'task_completed' as const }
      const { error } = await supabase.from('task_dependencies').insert(payload)
      if (error) throw error
      showToast('紐づけました', 'success')
      refresh()
    } catch (e) {
      console.error(e)
      showToast('紐づけに失敗しました', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleUnlink = async (taskId: string) => {
    setBusyId(taskId)
    try {
      // 解除対象の dep を direction に応じて検索
      const dep = existingDeps.find(d =>
        isPrev ? d.from_task_id === taskId : d.to_task_id === taskId
      )
      if (!dep) {
        setBusyId(null)
        return
      }
      const supabase = createClient()
      const { error } = await supabase.from('task_dependencies').delete().eq('id', dep.id)
      if (error) throw error
      showToast('紐づけを解除しました', 'success')
      refresh()
    } catch (e) {
      console.error(e)
      showToast('解除に失敗しました', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ヘッダー（折りたたみ可） */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2.5 bg-brand-600 flex items-center gap-2 hover:bg-brand-700 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-white" strokeWidth={2.25} />
          : <HeaderIcon className="w-4 h-4 text-white" strokeWidth={2.25} />}
        <span className="text-white text-[14px] font-bold">{headerLabel}</span>
        {linkedTasks.length > 0 && (
          <span className="ml-auto text-[11px] font-bold text-white bg-white/30 px-2 py-0.5 rounded-full">
            {linkedTasks.length} 件紐づけ済
          </span>
        )}
      </button>

      {expanded && (
        <>
          {/* 紐づけ済みリスト */}
          {linkedTasks.length === 0 ? (
            <div className="px-3 py-5 text-center bg-gradient-to-b from-brand-50/40 to-transparent">
              <div className="text-[28px] leading-none mb-1.5" aria-hidden="true">{emptyEmoji}</div>
              <div className="text-[12px] font-bold text-gray-700 leading-tight">
                {emptyTitle}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {emptySub}
              </div>
              <div className="text-[10px] text-gray-400 mt-2 leading-tight">
                {isPrev ? '前に' : '次に'}紐づけたい場合は下のボタンから追加
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {linkedTasks.map(t => {
                const isBusy = busyId === t.id
                return (
                  <li key={t.id} className="flex items-stretch group">
                    <Link
                      href={`/tasks/${t.id}`}
                      className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2.5 hover:bg-brand-50/40 transition-colors"
                    >
                      <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center bg-brand-100 mt-0.5">
                        {isPrev
                          ? <ChevronLeft className="w-3 h-3 text-brand-600" strokeWidth={2.5} />
                          : <ChevronRight className="w-3 h-3 text-brand-600" strokeWidth={2.5} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate group-hover:text-brand-700">
                          {t.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: getPhaseColor(t.phase) }}
                          >
                            {getPhaseLabel(t.phase)}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {t.status}
                          </span>
                          {t.category && (
                            <span className="text-[10px] text-gray-500 truncate">{t.category}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleUnlink(t.id)}
                      disabled={isBusy}
                      className="px-2 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="紐づけを解除"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* 操作エリア */}
          <div className="border-t border-gray-100">
            {mode === 'idle' && (
              <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
                <button
                  type="button"
                  onClick={() => setMode('picker')}
                  disabled={unlinkedCandidates.length === 0}
                  className="px-2 py-2 inline-flex items-center justify-center gap-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 transition-colors disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  既存から選ぶ
                  {unlinkedCandidates.length > 0 && (
                    <span className="text-[10px] text-gray-400">({unlinkedCandidates.length})</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('create')}
                  className="px-2 py-2 inline-flex items-center justify-center gap-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新規作成
                </button>
              </div>
            )}

            {mode === 'picker' && (
              <ExistingTaskPicker
                candidates={unlinkedCandidates}
                busyId={busyId}
                onLink={handleLink}
                onClose={() => setMode('idle')}
                onSwitchCreate={() => setMode('create')}
              />
            )}

            {mode === 'create' && (
              <CreateTaskForm
                currentTask={currentTask}
                direction={direction}
                taskTemplates={taskTemplates}
                onClose={() => setMode('idle')}
                onCreated={() => {
                  setMode('idle')
                  refresh()
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

// =================== 既存タスクピッカー ===================
function ExistingTaskPicker({
  candidates,
  busyId,
  onLink,
  onClose,
  onSwitchCreate,
}: {
  candidates: TaskRow[]
  busyId: string | null
  onLink: (taskId: string) => void
  onClose: () => void
  onSwitchCreate: () => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q) ||
      getPhaseLabel(t.phase).toLowerCase().includes(q)
    )
  }, [candidates, query])

  return (
    <div className="bg-brand-50/40 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="タスク名・カテゴリ・Phaseで検索"
          className="flex-1 px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400 bg-white"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-1"
        >
          閉じる
        </button>
      </div>

      <div className="max-h-[280px] overflow-y-auto rounded border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12px] text-gray-400">
            {query ? '該当するタスクはありません' : '候補のタスクはありません'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(t => {
              const isBusy = busyId === t.id
              return (
                <li key={t.id}>
                  <label
                    className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-brand-50/50 transition-colors ${isBusy ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={isBusy}
                      onChange={() => onLink(t.id)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-800 truncate">{t.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: getPhaseColor(t.phase) }}
                        >
                          {getPhaseLabel(t.phase)}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {t.status}
                        </span>
                        {t.category && (
                          <span className="text-[10px] text-gray-500 truncate">{t.category}</span>
                        )}
                      </div>
                    </div>
                    {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600 flex-shrink-0 mt-1" />}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onSwitchCreate}
        className="w-full text-[11px] text-brand-700 hover:text-brand-800 font-semibold"
      >
        候補にない？ + 新しいタスクを作成
      </button>
    </div>
  )
}

// =================== 新規タスク作成フォーム ===================
function CreateTaskForm({
  currentTask,
  direction,
  taskTemplates,
  onClose,
  onCreated,
}: {
  currentTask: TaskRow
  direction: Direction
  taskTemplates: TaskTemplateRow[]
  onClose: () => void
  onCreated: () => void
}) {
  const isPrev = direction === 'prev'
  const [title, setTitle] = useState('')
  const [phase, setPhase] = useState<string>(currentTask.phase ?? PHASES[0].key)
  const [busy, setBusy] = useState(false)
  const datalistId = `task-template-titles-${currentTask.id}`

  const matchedTemplate = useMemo(() => {
    const t = title.trim()
    if (!t) return null
    return taskTemplates.find(tpl => tpl.label === t) ?? null
  }, [title, taskTemplates])

  const handleTitleChange = (next: string) => {
    setTitle(next)
    const tpl = taskTemplates.find(t => t.label === next)
    if (tpl?.phase) setPhase(tpl.phase)
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      showToast('タスク名を入力してください', 'error')
      return
    }
    setBusy(true)
    try {
      const supabase = createClient()

      const newTask: Record<string, unknown> = {
        case_id: currentTask.case_id,
        title: trimmedTitle,
        phase,
        status: '着手前',
        priority: '通常',
        sort_order: 0,
      }
      if (matchedTemplate) {
        newTask.template_key = matchedTemplate.key
        newTask.category = matchedTemplate.category ?? null
        newTask.procedure_text = matchedTemplate.procedure_text ?? null
        if (matchedTemplate.default_role) {
          newTask.work_role = matchedTemplate.default_role
        }
      }
      const { data: inserted, error: insErr } = await supabase
        .from('tasks')
        .insert(newTask)
        .select('id')
        .single()
      if (insErr || !inserted) throw insErr ?? new Error('insert failed')

      // direction='next': currentTask → 新規, direction='prev': 新規 → currentTask
      const depPayload = isPrev
        ? { case_id: currentTask.case_id, from_task_id: inserted.id, to_task_id: currentTask.id, condition_type: 'task_completed' as const }
        : { case_id: currentTask.case_id, from_task_id: currentTask.id, to_task_id: inserted.id, condition_type: 'task_completed' as const }
      const { error: depErr } = await supabase.from('task_dependencies').insert(depPayload)
      if (depErr) throw depErr

      showToast(`「${trimmedTitle}」を作成して紐づけました`, 'success')
      setTitle('')
      onCreated()
    } catch (e) {
      console.error(e)
      showToast('作成に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-3 py-2.5 bg-brand-50/40 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-brand-800">
          新しいタスクを作成して{isPrev ? '前のタスクに' : '次のタスクに'}紐づける
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          title="閉じる"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">タスク名</label>
        <input
          type="text"
          list={datalistId}
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="リストから選択、または自由入力"
          disabled={busy}
          className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400 disabled:opacity-50 bg-white"
        />
        <datalist id={datalistId}>
          {taskTemplates.map(t => (
            <option key={t.id} value={t.label}>{t.phase} / {t.category}</option>
          ))}
        </datalist>
        {matchedTemplate && (
          <div className="text-[11px] text-green-700 mt-0.5">
            ✓ テンプレ「{matchedTemplate.label}」を使用（カテゴリ・作業手順を自動セット）
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Phase</label>
        <select
          value={phase}
          onChange={e => setPhase(e.target.value)}
          disabled={busy}
          className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400 disabled:opacity-50 bg-white"
        >
          {PHASES.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex-1 px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !title.trim()}
          className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[12px] font-bold text-white rounded shadow-sm ${
            busy || !title.trim()
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          作成して紐づける
        </button>
      </div>
      <div className="text-[11px] text-gray-400">
        担当区分・期限・詳細は作成後にタスク詳細から設定してください。
      </div>
    </div>
  )
}

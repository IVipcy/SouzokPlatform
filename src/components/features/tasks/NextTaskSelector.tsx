'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown, Loader2, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { getPhaseLabel, getPhaseColor } from '@/lib/phases'
import { PHASES } from '@/lib/constants'
import type { TaskRow, TaskDependencyRow, TaskTemplateRow } from '@/types'

type Props = {
  currentTask: TaskRow
  /** 同一案件の他タスク（候補） */
  candidates: TaskRow[]
  /** 既に「次タスク」として紐づいているタスクの ID セット */
  linkedIds: Set<string>
  /** 既存の next dependency 行（解除用に dep.id を保持） */
  existingDeps: TaskDependencyRow[]
  /** タスクテンプレ（新規タスク作成フォームの候補） */
  taskTemplates?: TaskTemplateRow[]
}

const STATUS_BADGE: Record<string, string> = {
  '着手前': 'bg-gray-100 text-gray-600',
  '対応中': 'bg-blue-100 text-blue-700',
  '完了': 'bg-green-100 text-green-700',
  '差戻し': 'bg-red-100 text-red-700',
}

/**
 * 「このタスクが終わったら」セクション
 * - 案件内の他タスク（自分以外、完了済み除く）を1つのチェックボックスリストで表示
 * - 既に紐づいているタスクは ON 状態（再度クリックで紐づけ解除）
 * - チェックの ON/OFF で task_dependencies の insert/delete が走る
 * - 追加と解除が同じ操作（チェック）で完結する双方向UI
 */
export default function NextTaskSelector({ currentTask, candidates, linkedIds, existingDeps, taskTemplates = [] }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  // 紐づけ対象になり得るタスク: 自分以外 + 完了済み以外
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidates
      .filter(t => t.status !== '完了')
      .filter(t => {
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) ||
          (t.category ?? '').toLowerCase().includes(q) ||
          getPhaseLabel(t.phase).toLowerCase().includes(q)
        )
      })
      // 紐づけ済みを上に表示
      .sort((a, b) => {
        const aL = linkedIds.has(a.id) ? 0 : 1
        const bL = linkedIds.has(b.id) ? 0 : 1
        if (aL !== bL) return aL - bL
        return 0
      })
  }, [candidates, query, linkedIds])

  const refresh = () => startTransition(() => router.refresh())

  const handleToggle = async (taskId: string, currentlyLinked: boolean) => {
    setBusyId(taskId)
    try {
      const supabase = createClient()
      if (currentlyLinked) {
        // 解除
        const dep = existingDeps.find(d => d.to_task_id === taskId)
        if (!dep) {
          setBusyId(null)
          return
        }
        const { error } = await supabase.from('task_dependencies').delete().eq('id', dep.id)
        if (error) throw error
        showToast('紐づけを解除しました', 'success')
      } else {
        // 追加
        const { error } = await supabase.from('task_dependencies').insert({
          case_id: currentTask.case_id,
          from_task_id: currentTask.id,
          to_task_id: taskId,
          condition_type: 'task_completed',
        })
        if (error) throw error
        showToast('次タスクとして紐づけました', 'success')
      }
      refresh()
    } catch (e) {
      console.error(e)
      showToast('操作に失敗しました', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const linkedCount = linkedIds.size

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
          : <ChevronRight className="w-4 h-4 text-white" strokeWidth={2.25} />}
        <span className="text-white text-[14px] font-bold">このタスクが終わったら</span>
        {linkedCount > 0 && (
          <span className="ml-auto text-[11px] font-bold text-white bg-white/30 px-2 py-0.5 rounded-full">
            {linkedCount} 件紐づけ済
          </span>
        )}
      </button>

      {expanded && (
        <>
          {/* 検索 */}
          {candidates.length > 6 && (
            <div className="px-3 pt-2.5 pb-1">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="タスク名・カテゴリ・Phaseで検索"
                className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400"
              />
            </div>
          )}

          {/* チェックボックスリスト */}
          <div className="max-h-[360px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-gray-400">
                {query ? '該当するタスクはありません' : '紐づけ可能なタスクがありません'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visible.map(t => {
                  const isLinked = linkedIds.has(t.id)
                  const isBusy = busyId === t.id
                  return (
                    <li key={t.id}>
                      <label
                        className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                          isLinked ? 'bg-brand-50/60 hover:bg-brand-50' : 'hover:bg-gray-50'
                        } ${isBusy ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isLinked}
                          disabled={isBusy}
                          onChange={() => handleToggle(t.id, isLinked)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] truncate ${isLinked ? 'font-bold text-brand-800' : 'font-medium text-gray-800'}`}>
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
                        {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600 flex-shrink-0 mt-1" />}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {/* 新規タスク作成（折りたたみフォーム） */}
          <div className="border-t border-gray-100">
            {!createOpen ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="w-full px-3 py-2 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新しいタスクを作成して紐づける
              </button>
            ) : (
              <CreateTaskForm
                currentTask={currentTask}
                taskTemplates={taskTemplates}
                onClose={() => setCreateOpen(false)}
                onCreated={() => {
                  setCreateOpen(false)
                  refresh()
                }}
              />
            )}
          </div>

          <div className="px-3 py-2 bg-gray-50/40 border-t border-gray-100 text-[11px] text-gray-500">
            チェックで「次タスク」として紐づけ、外すと解除されます。
          </div>
        </>
      )}
    </div>
  )
}

// =================== 新規タスク作成フォーム ===================
function CreateTaskForm({
  currentTask,
  taskTemplates,
  onClose,
  onCreated,
}: {
  currentTask: TaskRow
  taskTemplates: TaskTemplateRow[]
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [phase, setPhase] = useState<string>(currentTask.phase ?? PHASES[0].key)
  const [busy, setBusy] = useState(false)
  // datalist 経由で「タスク名から選択 or フリー入力」を実現
  const datalistId = `task-template-titles-${currentTask.id}`

  // 選択されたタスク名がテンプレに一致する場合はそのテンプレ情報を利用
  const matchedTemplate = useMemo(() => {
    const t = title.trim()
    if (!t) return null
    return taskTemplates.find(tpl => tpl.label === t) ?? null
  }, [title, taskTemplates])

  // テンプレが一致したら Phase を自動同期
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

      // 1) 新規タスクを insert
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
        // work_role は default_role を流用（'sales' などが入っていれば）
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

      // 2) task_dependencies で「このタスク → 新規タスク」を紐づけ
      const { error: depErr } = await supabase.from('task_dependencies').insert({
        case_id: currentTask.case_id,
        from_task_id: currentTask.id,
        to_task_id: inserted.id,
        condition_type: 'task_completed',
      })
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
        <div className="text-[12px] font-semibold text-brand-800">新しいタスクを作成</div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          title="閉じる"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* タスク名（datalist でテンプレ候補表示 + フリー入力可） */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">タスク名</label>
        <input
          type="text"
          list={datalistId}
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="リストから選択、または自由入力"
          disabled={busy}
          className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400 disabled:opacity-50"
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

      {/* Phase */}
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

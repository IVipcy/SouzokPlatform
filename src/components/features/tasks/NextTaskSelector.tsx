'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { getPhaseLabel, getPhaseColor } from '@/lib/phases'
import type { TaskRow, TaskDependencyRow } from '@/types'

type Props = {
  currentTask: TaskRow
  /** 同一案件の他タスク（候補） */
  candidates: TaskRow[]
  /** 既に「次タスク」として紐づいているタスクの ID セット */
  linkedIds: Set<string>
  /** 既存の next dependency 行（解除用に dep.id を保持） */
  existingDeps: TaskDependencyRow[]
}

const STATUS_BADGE: Record<string, string> = {
  '着手前': 'bg-gray-100 text-gray-600',
  '対応中': 'bg-blue-100 text-blue-700',
  '完了': 'bg-green-100 text-green-700',
  '差戻し': 'bg-red-100 text-red-700',
}

export default function NextTaskSelector({ currentTask, candidates, linkedIds, existingDeps }: Props) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  // ピッカーに出すのは「未着手 or 対応中」のタスクのみ。完了済みは候補から外す。
  const pickable = useMemo(
    () => candidates.filter(t => t.status !== '完了'),
    [candidates]
  )

  const linkedTasks = useMemo(
    () => existingDeps
      .map(d => d.to_task)
      .filter((t): t is TaskRow => !!t),
    [existingDeps]
  )

  const refresh = () => startTransition(() => router.refresh())

  const handleLink = async (taskId: string) => {
    setBusyId(taskId)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('task_dependencies').insert({
        case_id: currentTask.case_id,
        from_task_id: currentTask.id,
        to_task_id: taskId,
        condition_type: 'task_completed',
      })
      if (error) throw error
      showToast('次タスクとして紐づけました', 'success')
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
      const dep = existingDeps.find(d => d.to_task_id === taskId)
      if (!dep) return
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
      <div className="px-3 py-2.5 bg-brand-600 flex items-center gap-2">
        <ChevronRight className="w-4 h-4 text-white" strokeWidth={2.25} />
        <span className="text-white text-[14px] font-bold">このタスクが終わったら</span>
      </div>

      {/* 紐づけ済みの次タスク */}
      <div className="divide-y divide-gray-100">
        {linkedTasks.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-gray-400">
            次のタスクは未設定です
          </div>
        ) : (
          linkedTasks.map(t => (
            <div key={t.id} className="flex items-stretch group">
              <Link
                href={`/tasks/${t.id}`}
                className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-brand-100">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-600" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate group-hover:text-brand-600">
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
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => handleUnlink(t.id)}
                disabled={busyId === t.id}
                className="px-2 text-gray-300 hover:text-red-500 text-[12px] disabled:opacity-50"
                title="紐づけを解除"
              >
                {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '×'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* 追加ボタン or ピッカー */}
      <div className="border-t border-gray-100 bg-gray-50/40">
        {!pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full px-3 py-2 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            次タスクを選択
          </button>
        ) : (
          <NextTaskPicker
            pickable={pickable}
            linkedIds={linkedIds}
            busyId={busyId}
            onLink={handleLink}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

function NextTaskPicker({
  pickable,
  linkedIds,
  busyId,
  onLink,
  onClose,
}: {
  pickable: TaskRow[]
  linkedIds: Set<string>
  busyId: string | null
  onLink: (taskId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pickable.filter(t => {
      if (linkedIds.has(t.id)) return false
      if (!q) return true
      return (
        t.title.toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q) ||
        getPhaseLabel(t.phase).toLowerCase().includes(q)
      )
    })
  }, [pickable, linkedIds, query])

  return (
    <div className="p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="タスク名・カテゴリ・Phaseで検索"
          className="flex-1 px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-gray-500 hover:text-gray-700 font-semibold px-1"
        >
          閉じる
        </button>
      </div>
      <div className="max-h-[260px] overflow-y-auto rounded border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-2 py-4 text-center text-[12px] text-gray-400">
            候補のタスクはありません
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(t => {
              const isBusy = busyId === t.id
              return (
                <li key={t.id}>
                  <label className={`flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-brand-50/50 ${isBusy ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={isBusy}
                      onChange={() => onLink(t.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
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
                          <span className="text-[10px] text-gray-500">{t.category}</span>
                        )}
                      </div>
                    </div>
                    {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-gray-400 px-0.5">
        チェックすると即座に「次タスク」として紐づけられます。
      </p>
    </div>
  )
}

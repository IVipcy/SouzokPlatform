'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
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

/**
 * 「このタスクが終わったら」セクション
 * - 案件内の他タスク（自分以外、完了済み除く）を1つのチェックボックスリストで表示
 * - 既に紐づいているタスクは ON 状態（再度クリックで紐づけ解除）
 * - チェックの ON/OFF で task_dependencies の insert/delete が走る
 * - 追加と解除が同じ操作（チェック）で完結する双方向UI
 */
export default function NextTaskSelector({ currentTask, candidates, linkedIds, existingDeps }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [query, setQuery] = useState('')

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
          <div className="px-3 py-2 bg-gray-50/40 border-t border-gray-100 text-[11px] text-gray-500">
            チェックで「次タスク」として紐づけ、外すと解除されます。
          </div>
        </>
      )}
    </div>
  )
}

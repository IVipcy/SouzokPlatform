'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bot, CheckCircle2, Play, Loader2, AlertTriangle, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { TaskRow } from '@/types'

type Props = {
  /** 表示対象のタスク（既に system タスクに絞られた配列） */
  tasks: TaskRow[]
  /** セクション見出し */
  title?: string
  /** 0件時に表示するテキスト */
  emptyText?: string
  /** 案件カラムを出すか（案件詳細では非表示にする） */
  showCase?: boolean
  /** 完了タスクを表示するか（既定: 未完了のみ） */
  includeCompleted?: boolean
  /** 最大表示件数（超過時は「すべて見る」リンク） */
  limit?: number
  /** 「すべて見る」のリンク先 */
  seeAllHref?: string
}

const STATUS_BADGE: Record<string, string> = {
  '着手前': 'bg-gray-100 text-gray-600 border-gray-200',
  '対応中': 'bg-sky-50  text-sky-700  border-sky-200',
  '完了':   'bg-green-50 text-green-700 border-green-200',
  '差戻し': 'bg-red-50  text-red-700  border-red-200',
}

const CATEGORY_BADGE: Record<string, string> = {
  '面談':       'bg-amber-50  text-amber-700  border-amber-200',
  '契約':       'bg-purple-50 text-purple-700 border-purple-200',
  '初期対応':   'bg-sky-50    text-sky-700    border-sky-200',
  '定期進捗連絡': 'bg-pink-50  text-pink-700   border-pink-200',
}

const normalizeStatus = (s: string) => {
  if (s === '未着手') return '着手前'
  if (['Wチェック待ち', '保留'].includes(s)) return '対応中'
  if (s === 'キャンセル') return '完了'
  return s
}

/**
 * システムタスク用のフラットなリスト表示。
 * 案件タスクと違って前後関係を持たないので、シンプルなリストで OK。
 * クリックでタスク詳細へ、行内に着手/完了ボタンあり。
 */
export default function SystemTaskList({
  tasks,
  title = '🤖 システムタスク',
  emptyText = 'システムタスクはありません',
  showCase = true,
  includeCompleted = false,
  limit,
  seeAllHref,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const today = new Date().toISOString().split('T')[0]

  const visible = useMemo(() => {
    const filtered = includeCompleted
      ? tasks
      : tasks.filter(t => normalizeStatus(t.status) !== '完了')
    // ソート: 期限超過 → 期限近い順 → なし末尾
    return [...filtered].sort((a, b) => {
      const aOver = !!(a.due_date && a.due_date < today)
      const bOver = !!(b.due_date && b.due_date < today)
      if (aOver !== bOver) return aOver ? -1 : 1
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    })
  }, [tasks, includeCompleted, today])

  const shown = limit ? visible.slice(0, limit) : visible

  const handleAdvance = async (task: TaskRow) => {
    if (busyId) return
    const current = normalizeStatus(task.status)
    if (current === '完了') return
    setBusyId(task.id)
    try {
      const supabase = createClient()
      const next = current === '着手前' ? '対応中' : '完了'
      const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
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

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <Bot className="w-4 h-4 text-purple-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
        <span className="text-[12px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {visible.length}
        </span>
        {limit && visible.length > limit && seeAllHref && (
          <Link href={seeAllHref} className="ml-auto text-[12px] font-semibold text-brand-600 hover:text-brand-700">
            すべて見る →
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-gray-400">{emptyText}</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map(task => {
            const status = normalizeStatus(task.status)
            const isOverdue = !!(task.due_date && task.due_date < today && status !== '完了')
            const caseData = task.cases
            const isBusy = busyId === task.id
            return (
              <li key={task.id} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50/60 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                {/* カテゴリ */}
                {task.category && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${CATEGORY_BADGE[task.category] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {task.category}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/tasks/${task.id}`}
                    className={`text-[13px] font-semibold truncate block hover:text-brand-600 hover:underline ${status === '完了' ? 'text-gray-400 line-through' : 'text-gray-800'}`}
                  >
                    {task.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                    {showCase && caseData && (
                      <Link
                        href={`/cases/${caseData.id}`}
                        className="inline-flex items-center gap-0.5 text-gray-500 hover:text-brand-600 hover:underline truncate max-w-[200px]"
                      >
                        <Briefcase className="w-3 h-3" strokeWidth={2} />
                        {caseData.deal_name}
                      </Link>
                    )}
                    {task.due_date && (
                      <span className={`font-mono ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                        {isOverdue && <AlertTriangle className="w-3 h-3 inline mr-0.5" strokeWidth={2.25} />}
                        {task.due_date}
                      </span>
                    )}
                  </div>
                </div>
                {/* ステータスバッジ */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0 ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                  {status}
                </span>
                {/* 着手/完了ボタン */}
                {status !== '完了' && (
                  <button
                    type="button"
                    onClick={() => handleAdvance(task)}
                    disabled={isBusy}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold flex-shrink-0 disabled:opacity-50 transition-colors ${
                      status === '着手前'
                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                        : 'text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100'
                    }`}
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> :
                      status === '着手前' ? <Play className="w-3 h-3" strokeWidth={2.5} /> : <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />}
                    {status === '着手前' ? '着手' : '完了'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

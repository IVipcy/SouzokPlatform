'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SubTabs } from '@/components/ui/SubTabs'
import { Section } from '@/components/ui/InlineFields'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import TaskKanbanView from '@/components/features/tasks/TaskKanbanView'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import TabHeader from './TabHeader'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
  onBulkGenerate: () => void
  onAddTask: () => void
}

// ステータス正規化（進捗バーの集計用）
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

const STATUS_PILLS = ['着手前', '対応中', '完了'] as const
const STATUS_LABEL: Record<string, string> = { '着手前': '未着手', '対応中': '対応中', '完了': '完了' }

export default function TasksTab({ tasks, currentMemberId: serverMemberId, onBulkGenerate, onAddTask }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const currentMemberId = useCurrentMember(serverMemberId)
  // 区分タブ（受注担当/管理担当＝system / 事務管理＝case）とステータス絞り込み（複数選択・全OFF=全表示）
  const [kind, setKind] = useState<'system' | 'case'>('case')
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const today = new Date().toISOString().split('T')[0]

  // カンバンの「着手→完了」アクション。事務管理タスクのカード操作用。
  const handleAdvance = async (task: TaskRow) => {
    if (busyId) return
    const current = normalizeStatus(task.status)
    if (current === '完了') return
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
  const KIND_TABS = [
    { key: 'case', label: `事務管理タスク ${caseCount}` },
    { key: 'system', label: `受注担当/管理担当タスク ${systemCount}` },
  ]

  const filtered = useMemo(() => tasks.filter(t => {
    if (t.task_kind !== kind) return false
    if (statuses.size > 0 && !statuses.has(normalizeStatus(t.status))) return false
    return true
  }), [tasks, kind, statuses])

  return (
    <div className="space-y-3.5">
      <TabHeader
        title="タスク"
        description="案件のタスク（事務管理・受注/管理担当）の進捗管理"
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
          {/* 区分タブ＋ステータス絞り込み */}
          <div className="flex items-center gap-3 flex-wrap">
            <SubTabs tabs={KIND_TABS} active={kind} onChange={k => setKind(k as 'system' | 'case')} />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-semibold text-gray-500">ステータス</span>
              {STATUS_PILLS.map(s => {
                const on = statuses.has(s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatuses(prev => {
                      const next = new Set(prev)
                      if (next.has(s)) next.delete(s); else next.add(s)
                      return next
                    })}
                    className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </div>

          {kind === 'case' ? (
            <Section title="タスク（事務管理）">
              <TaskKanbanView
                tasks={filtered}
                today={today}
                onAdvance={handleAdvance}
                loadingTaskId={busyId}
                hideCase
              />
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
    </div>
  )
}

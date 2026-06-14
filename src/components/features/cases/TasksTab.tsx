'use client'

import { useState, useMemo } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SubTabs } from '@/components/ui/SubTabs'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import { useCurrentMember } from '@/lib/useCurrentMember'
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

const STATUS_PILLS = ['all', '着手前', '対応中', '完了'] as const
const STATUS_LABEL: Record<string, string> = { all: 'すべて', '着手前': '未着手', '対応中': '対応中', '完了': '完了' }

export default function TasksTab({ tasks, currentMemberId: serverMemberId, onBulkGenerate, onAddTask }: Props) {
  const currentMemberId = useCurrentMember(serverMemberId)
  // 区分タブ（初期対応＝system / 事務管理＝case）とステータス絞り込み
  const [kind, setKind] = useState<'all' | 'system' | 'case'>('all')
  const [status, setStatus] = useState<'all' | '着手前' | '対応中' | '完了'>('all')

  // 進捗率
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => normalizeStatus(t.status) === '完了').length
  const doingTasks = tasks.filter(t => normalizeStatus(t.status) === '対応中').length
  const todoTasks = tasks.filter(t => normalizeStatus(t.status) === '着手前').length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const systemCount = tasks.filter(t => t.task_kind === 'system').length
  const caseCount = tasks.filter(t => t.task_kind === 'case').length
  const KIND_TABS = [
    { key: 'all', label: `すべて ${totalTasks}` },
    { key: 'system', label: `初期対応タスク ${systemCount}` },
    { key: 'case', label: `事務管理タスク ${caseCount}` },
  ]

  const filtered = useMemo(() => tasks.filter(t => {
    if (kind !== 'all' && t.task_kind !== kind) return false
    if (status !== 'all' && normalizeStatus(t.status) !== status) return false
    return true
  }), [tasks, kind, status])

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-900 flex-1">タスク管理</h2>
        <Button variant="secondary" size="sm" leftIcon={<ClipboardList className="w-3.5 h-3.5" strokeWidth={2} />} onClick={onBulkGenerate}>
          一括生成
        </Button>
        <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={onAddTask}>
          タスク追加
        </Button>
      </div>

      {/* 進捗バー */}
      {totalTasks > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">案件進捗</span>
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
        </div>
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
            <SubTabs tabs={KIND_TABS} active={kind} onChange={k => setKind(k as 'all' | 'system' | 'case')} />
            <div className="flex items-center gap-1.5 flex-wrap ml-auto">
              <span className="text-[12px] font-semibold text-gray-500">ステータス</span>
              {STATUS_PILLS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${status === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <SystemTaskList
            tasks={filtered}
            title="タスク一覧"
            showCase={false}
            includeCompleted
            selectable
            hideCategory
            currentMemberId={currentMemberId ?? undefined}
          />
        </div>
      )}
    </div>
  )
}

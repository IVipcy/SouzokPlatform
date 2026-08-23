'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SubTabs } from '@/components/ui/SubTabs'
import { Section } from '@/components/ui/InlineFields'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import TaskListClient from '@/components/features/tasks/TaskListClient'
import CompleteTaskModal from '@/components/features/tasks/CompleteTaskModal'
import { useCurrentMember } from '@/lib/useCurrentMember'
import TabHeader from './TabHeader'
import { toReadinessReceipts } from '@/lib/taskReadiness'
import type { TimelineReceipt } from './CaseTimeline'
import type { TaskRow, MemberRow } from '@/types'

type Props = {
  tasks: TaskRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
  onAddTask: () => void
  documentReceipts?: TimelineReceipt[]
  /** 案件ステータス。対応中以降は事務管理タスクを先頭・既定にする */
  caseStatus?: string
  /** 金融資産（凍結ゲート判定用）。解約タスクは機関単位で凍結確認済みかを見る。 */
  financeAssets?: Array<{ institution_name?: string | null; freeze_confirmed?: boolean | null }>
  /** 管理担当の閲覧時：事務管理タスク(case)を隠し、受注担当/管理担当タスク(system)のみ表示する。 */
  hideCaseTasks?: boolean
}

// ステータス正規化（進捗バーの集計用）
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

export default function TasksTab({ tasks, allMembers, currentMemberId: serverMemberId, onAddTask, documentReceipts, caseStatus, financeAssets = [], hideCaseTasks = false }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const currentMemberId = useCurrentMember(serverMemberId)
  // 対応中以降（管理案件フェーズ）は事務管理タスク中心。それ以前は受注/管理担当タスク中心。
  // ただし管理担当の閲覧時は常に system（事務管理は非表示）。
  const isManagementPhase = caseStatus === '対応中' || caseStatus === '完了'
  // 区分タブ（受注担当/管理担当＝system / 事務管理＝case）とステータス絞り込み（複数選択・全OFF=全表示）
  const [kind, setKind] = useState<'system' | 'case'>(hideCaseTasks ? 'system' : isManagementPhase ? 'case' : 'system')
  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null)


  // 進捗率。管理担当ビュー(hideCaseTasks)は受注担当/管理担当タスク(system)のみで集計する。それ以外は全タスク。
  const progressTasks = hideCaseTasks ? tasks.filter(t => t.task_kind === 'system') : tasks
  const totalTasks = progressTasks.length
  const completedTasks = progressTasks.filter(t => normalizeStatus(t.status) === '完了').length
  const doingTasks = progressTasks.filter(t => normalizeStatus(t.status) === '対応中').length
  const todoTasks = progressTasks.filter(t => normalizeStatus(t.status) === '着手前').length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  // 空状態・区分タブ等の構造判定は全タスクで（管理担当でsystemが0でも一覧構造は維持）
  const hasAnyTask = tasks.length > 0

  const caseId = tasks[0]?.case_id ?? null
  const systemTasks = tasks.filter(t => t.task_kind === 'system')
  const systemCount = systemTasks.length
  const caseCount = tasks.filter(t => t.task_kind === 'case').length
  // 対応中以降は事務管理タスクを先頭、それ以前は受注/管理担当タスクを先頭にする
  const caseTab = { key: 'case', label: `事務管理タスク ${caseCount}` }
  const systemTab = { key: 'system', label: `受注担当/管理担当タスク ${systemCount}` }
  const KIND_TABS = hideCaseTasks ? [systemTab] : isManagementPhase ? [caseTab, systemTab] : [systemTab, caseTab]

  const receipts = useMemo(() => toReadinessReceipts(documentReceipts), [documentReceipts])

  return (
    <div className="space-y-3.5">
      <TabHeader
        title="タスク"
        description="この案件のタスク（事務管理・受注／管理担当）の進み具合を見ます。"
        right={
          <div className="flex items-center gap-2">
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

      {!hasAnyTask ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm mb-3">タスクがありません</p>
          <button onClick={onAddTask} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
            タスクを作成する
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 区分タブ。中身は事務管理タスク一覧／マイページと同じ部品にそろえてある。 */}
          <SubTabs tabs={KIND_TABS} active={kind} onChange={k => setKind(k as 'system' | 'case')} />

          {kind === 'case' ? (
            // 事務管理タスク一覧と同じ表。案件詳細では着手できない未着手も出す（caseScope）。
            <Section title="タスク（事務管理）">
              <TaskListClient
                embedded
                caseScope
                tasks={tasks}
                caseMap={{}}
                allMembers={allMembers}
                currentMemberId={currentMemberId}
                receipts={receipts}
                freezeAssetsByCase={caseId ? { [caseId]: financeAssets } : {}}
                roleScope="assistant"
              />
            </Section>
          ) : (
            // マイページのタスクタブと同じ表（業務／その他のサブタブ付き）。
            <SystemTaskList
              tasks={systemTasks}
              title="タスク"
              showCase={false}
              includeCompleted
              selectable
              hideCategory={false}
              showMeta
              groupTabs
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

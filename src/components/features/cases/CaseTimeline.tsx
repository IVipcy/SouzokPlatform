'use client'

import Link from 'next/link'
import { Flag, Trophy } from 'lucide-react'
import { getPhaseDefinition } from '@/lib/phases'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { CaseRow, TaskRow, RealEstatePropertyRow } from '@/types'

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  properties?: RealEstatePropertyRow[]
}

// ───────── タスクの状態正規化（CaseProgressPanel と統一） ─────────
type TaskState = 'done' | 'active' | 'returned' | 'overdue' | 'pending'

function classifyTask(t: TaskRow, todayYmd: string): TaskState {
  if (t.status === '完了') return 'done'
  if (t.status === '差戻し') return 'returned'
  const overdue = !!(t.due_date && t.due_date < todayYmd)
  if (t.status === '対応中' || t.status === 'Wチェック待ち') return overdue ? 'overdue' : 'active'
  return overdue ? 'overdue' : 'pending'
}

const NODE_CLS: Record<TaskState, string> = {
  done:     'bg-brand-600 border-brand-600',
  active:   'bg-sky-500 border-sky-500 ring-2 ring-sky-100',
  returned: 'bg-purple-600 border-purple-600 ring-2 ring-purple-100',
  overdue:  'bg-red-500 border-red-500 ring-2 ring-red-100',
  pending:  'bg-white border-gray-300',
}
const CONNECTOR_CLS: Record<TaskState, string> = {
  done: 'bg-brand-600', active: 'bg-sky-500', returned: 'bg-purple-600', overdue: 'bg-red-300', pending: 'bg-gray-200',
}
const LABEL_CLS: Record<TaskState, string> = {
  done: 'text-brand-700', active: 'text-sky-700 font-semibold', returned: 'text-purple-700 font-semibold',
  overdue: 'text-red-600 font-semibold', pending: 'text-gray-600',
}

// タスクの代表日 / 担当者名
function taskDate(t: TaskRow): string | null {
  return (t.completed_at?.slice(0, 10)) ?? t.started_at?.slice(0, 10) ?? t.due_date ?? t.expected_completion_date ?? null
}
function taskAssignee(t: TaskRow): string | null {
  if (t.started_by_member?.name) return t.started_by_member.name
  const primary = t.task_assignees?.find(a => a.role === 'primary') ?? t.task_assignees?.[0]
  return primary?.members?.name ?? null
}

// ───────── マイルストーン軸 ─────────
const STATUS_ORDER = ['架電案件化', '面談設定済', '検討中', '検討中（契約書待ち）', '受注', '対応中', '保留・長期', '完了', '失注', '紹介のみ']

const PHASE_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']

export default function CaseTimeline({ caseData, tasks, properties = [] }: Props) {
  const todayYmd = todayJstYmd(new Date())
  const currentIdx = STATUS_ORDER.indexOf(caseData.status)

  const caseTasks = tasks.filter(t => t.task_kind !== 'system')
  const systemTasks = tasks.filter(t => t.task_kind === 'system')
  const visibleProperties = properties.filter(p => p.appraisal_status !== '不要')

  // 対応開始日 = 最初に着手された案件タスクの着手日（無ければ null）
  const firstStarted = caseTasks
    .map(t => t.started_at?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort()[0] ?? null

  const milestones: { key: string; label: string; date: string | null; reachedIdx: number }[] = [
    { key: 'meeting',  label: '面談',         date: caseData.meeting_executed_date ?? caseData.meeting_date ?? null, reachedIdx: 1 },
    { key: 'response', label: '検討結果回答', date: caseData.client_response_due_date ?? null,                       reachedIdx: 2 },
    { key: 'order',    label: '受注',         date: caseData.order_received_date ?? caseData.order_date ?? null,    reachedIdx: 4 },
    { key: 'start',    label: '対応開始',     date: firstStarted,                                                   reachedIdx: 5 },
    { key: 'goal',     label: '完了予定',     date: caseData.completion_date ?? caseData.expected_completion_date ?? null, reachedIdx: 7 },
  ]

  // フェーズ別の案件タスク
  const tasksByPhase = new Map<string, TaskRow[]>()
  for (const t of caseTasks) {
    const k = t.phase || 'phase1'
    if (!tasksByPhase.has(k)) tasksByPhase.set(k, [])
    tasksByPhase.get(k)!.push(t)
  }
  const orderedPhases = PHASE_ORDER
    .filter(p => (tasksByPhase.get(p)?.length ?? 0) > 0)
    .map(p => ({ key: p, label: getPhaseDefinition(p)?.label ?? p, tasks: [...tasksByPhase.get(p)!].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) }))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[15px] font-semibold text-gray-900">案件タイムライン</h3>
        <Legend />
      </div>

      {/* ① マイルストーン軸 */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch min-w-[760px]">
          {/* START フラグ */}
          <div className="flex flex-col items-center justify-start pt-1 pr-1 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-sm">
              <Flag className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <span className="mt-1.5 text-[11px] font-bold text-gray-500 tracking-wider">START</span>
          </div>

          {milestones.map((m, i) => {
            const reached = currentIdx >= m.reachedIdx
            const isCurrent = (() => {
              // 現在地 = reached のうち最も右
              const reachedList = milestones.filter(x => currentIdx >= x.reachedIdx)
              return reached && reachedList[reachedList.length - 1]?.key === m.key
            })()
            return (
              <div key={m.key} className="flex items-start flex-1 min-w-[140px]">
                {/* 左側コネクタ */}
                <div className={`flex-1 h-[3px] mt-[18px] rounded-full ${reached ? 'bg-brand-500' : 'bg-gray-200'}`} />
                {/* ノード */}
                <div className="flex flex-col items-center px-1 flex-shrink-0" style={{ width: 96 }}>
                  <div
                    className={`rounded-full flex items-center justify-center transition-all ${
                      isCurrent
                        ? 'w-[18px] h-[18px] bg-brand-600 ring-4 ring-brand-100'
                        : reached
                          ? 'w-3.5 h-3.5 bg-brand-600'
                          : 'w-3.5 h-3.5 bg-white border-2 border-gray-300'
                    }`}
                  />
                  <span className={`mt-2 text-[12px] text-center leading-tight ${reached ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
                    {m.label}
                  </span>
                  <span className="text-[11px] font-mono text-gray-400 mt-0.5">{m.date ?? '—'}</span>
                </div>
                {/* 右側コネクタ（最後だけ伸ばす） */}
                {i === milestones.length - 1 && (
                  <div className={`flex-1 h-[3px] mt-[18px] rounded-full ${currentIdx >= 7 ? 'bg-brand-500' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}

          {/* GOAL フラグ */}
          <div className="flex flex-col items-center justify-start pt-1 pl-1 flex-shrink-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${currentIdx >= 7 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
              <Trophy className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <span className="mt-1.5 text-[11px] font-bold text-gray-500 tracking-wider">GOAL</span>
          </div>
        </div>
      </div>

      {/* ② 受注後の初期対応（系統タスク） */}
      {systemTasks.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">受注後の初期対応</h4>
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex items-start gap-0">
              {systemTasks
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((t, idx, arr) => (
                  <TaskNode key={t.id} task={t} todayYmd={todayYmd} isLast={idx === arr.length - 1} />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ③ フェーズ別タスク（対応中の作業） */}
      {orderedPhases.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100 space-y-4">
          <h4 className="text-[13px] font-bold text-gray-800">対応中の作業（フェーズ別）</h4>
          {orderedPhases.map(p => {
            const total = p.tasks.length
            const done = p.tasks.filter(t => t.status === '完了').length
            return (
              <div key={p.key} className="flex gap-3 items-start">
                <div className="w-32 flex-shrink-0 pt-1">
                  <div className="text-[13px] font-bold text-gray-800 leading-tight">{p.label}</div>
                  <span className="inline-flex items-center mt-1 text-[11px] font-mono px-2 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200">
                    {done}/{total}
                  </span>
                </div>
                <div className="flex-1 overflow-x-auto pb-1">
                  <div className="inline-flex items-start gap-0 min-w-full">
                    {p.tasks.map((t, idx) => (
                      <TaskNode key={t.id} task={t} todayYmd={todayYmd} isLast={idx === p.tasks.length - 1} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ④ 不動産査定 */}
      {visibleProperties.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">不動産査定</h4>
          <div className="space-y-3">
            {visibleProperties.map((p, i) => (
              <PropertyRow key={p.id} property={p} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {orderedPhases.length === 0 && systemTasks.length === 0 && visibleProperties.length === 0 && (
        <div className="mt-5 bg-gray-50 border border-gray-200 rounded-lg p-5 text-center text-[13px] text-gray-500">
          タスクが登録されていません。タスク一括生成から登録すると、ここに作業の進捗が表示されます。
        </div>
      )}
    </div>
  )
}

// ───────── 不動産査定（3ステップ） ─────────
function PropertyRow({ property, index }: { property: RealEstatePropertyRow; index: number }) {
  const status = property.appraisal_status ?? '未対応'
  const steps: Array<'未対応' | '対応中' | '完了'> = ['未対応', '対応中', '完了']
  const currentIdx = steps.indexOf(status as '未対応' | '対応中' | '完了')
  const safeIdx = currentIdx === -1 ? 0 : currentIdx
  const label = property.address
    ? `物件${index}：${property.address}${property.lot_number ? ` ${property.lot_number}` : ''}`
    : `物件${index}`

  return (
    <div className="flex gap-3 items-center">
      <div className="w-44 flex-shrink-0 text-[13px] text-gray-800 truncate" title={label}>{label}</div>
      <div className="flex-1 max-w-md flex items-center">
        {steps.map((step, idx) => {
          const reached = idx <= safeIdx
          const isLast = idx === steps.length - 1
          return (
            <div key={step} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center" style={{ minWidth: 80 }}>
                <span className={`w-4 h-4 rounded-full border-2 ${reached ? 'bg-brand-600 border-brand-600' : 'bg-white border-gray-300'}`} />
                <span className={`mt-1.5 text-[12px] ${reached ? 'text-brand-700 font-semibold' : 'text-gray-400'}`}>{step}</span>
              </div>
              {!isLast && <span className={`flex-1 h-[2px] ${idx < safeIdx ? 'bg-brand-600' : 'bg-gray-200'}`} style={{ marginBottom: 22 }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────── タスクノード（ドット＋タイトル＋日付＋担当者） ─────────
function TaskNode({ task, todayYmd, isLast }: { task: TaskRow; todayYmd: string; isLast: boolean }) {
  const state = classifyTask(task, todayYmd)
  const date = taskDate(task)
  const assignee = taskAssignee(task)
  return (
    <div className="flex items-start" style={{ minWidth: 132 }}>
      <div className="flex flex-col items-center" style={{ width: 132 }}>
        <div className="flex items-center w-full">
          <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 ${NODE_CLS[state]}`} title={`${task.title}（${task.status}）`} />
          {!isLast && <span className={`flex-1 h-[2px] ${CONNECTOR_CLS[state]}`} />}
        </div>
        <Link
          href={`/tasks/${task.id}`}
          className={`mt-2 text-[12px] text-center leading-snug w-full px-1.5 hover:underline ${LABEL_CLS[state]}`}
          style={{ wordBreak: 'break-word' }}
          title={`「${task.title}」を開く`}
        >
          {task.title}
        </Link>
        {date && <span className="text-[11px] font-mono text-gray-400 mt-0.5">{date}</span>}
        {assignee && <span className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[120px]">{assignee}</span>}
      </div>
    </div>
  )
}

function Legend() {
  const items: { cls: string; label: string }[] = [
    { cls: 'bg-brand-600', label: '完了' },
    { cls: 'bg-sky-500 ring-2 ring-sky-100', label: '対応中' },
    { cls: 'bg-purple-600 ring-2 ring-purple-100', label: '差戻し' },
    { cls: 'bg-red-500 ring-2 ring-red-100', label: '期限超過' },
    { cls: 'bg-white border border-gray-300', label: '未着手' },
  ]
  return (
    <span className="text-[12px] text-gray-500 ml-auto flex items-center gap-3 flex-wrap">
      {items.map(it => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${it.cls}`} />{it.label}
        </span>
      ))}
    </span>
  )
}

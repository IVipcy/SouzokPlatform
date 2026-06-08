'use client'

import Link from 'next/link'
import { Flag, Trophy, FileText } from 'lucide-react'
import { getPhaseDefinition } from '@/lib/phases'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { CaseRow, TaskRow, RealEstatePropertyRow } from '@/types'

// 書類受信簿（タイムライン差し込み用の最小形）
export type TimelineReceipt = {
  id: string
  received_date: string | null
  started_by_member?: { name: string } | null
  items?: { item_name: string; sort_order: number }[] | null
}
// ステータス遷移履歴
export type TimelineStatusEvent = { new_value: string | null; created_at: string }

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  properties?: RealEstatePropertyRow[]
  statusHistory?: TimelineStatusEvent[]
  documentReceipts?: TimelineReceipt[]
}

// ───────── タスクの状態正規化（差戻しは廃止） ─────────
type TaskState = 'done' | 'active' | 'overdue' | 'pending'

function classifyTask(t: TaskRow, todayYmd: string): TaskState {
  if (t.status === '完了') return 'done'
  const overdue = !!(t.due_date && t.due_date < todayYmd)
  if (t.status === '対応中' || t.status === 'Wチェック待ち') return overdue ? 'overdue' : 'active'
  return overdue ? 'overdue' : 'pending'
}

const NODE_CLS: Record<TaskState, string> = {
  done:    'bg-brand-600 border-brand-600',
  active:  'bg-sky-500 border-sky-500 ring-2 ring-sky-100',
  overdue: 'bg-red-500 border-red-500 ring-2 ring-red-100',
  pending: 'bg-white border-gray-300',
}
const CONNECTOR_CLS: Record<TaskState, string> = {
  done: 'bg-brand-600', active: 'bg-sky-500', overdue: 'bg-red-300', pending: 'bg-gray-200',
}
const LABEL_CLS: Record<TaskState, string> = {
  done: 'text-brand-700', active: 'text-sky-700 font-semibold', overdue: 'text-red-600 font-semibold', pending: 'text-gray-600',
}

function ymd(d: string | null | undefined): string | null {
  return d ? d.slice(0, 10) : null
}
function overdueDays(t: TaskRow, todayYmd: string): number | null {
  if (t.status === '完了' || !t.due_date || t.due_date >= todayYmd) return null
  const days = Math.floor((new Date(todayYmd + 'T00:00:00').getTime() - new Date(t.due_date + 'T00:00:00').getTime()) / 86_400_000)
  return days > 0 ? days : null
}
function taskAssignee(t: TaskRow): string | null {
  if (t.started_by_member?.name) return t.started_by_member.name
  const primary = t.task_assignees?.find(a => a.role === 'primary') ?? t.task_assignees?.[0]
  return primary?.members?.name ?? null
}

const STATUS_ORDER = ['架電案件化', '面談設定済', '検討中', '検討中（契約書待ち）', '受注', '対応中', '保留・長期', '完了', '失注', '紹介のみ']
const PHASE_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']

// マイルストーン定義（実際に通過したステータスのみ表示）
// historyOnly=true のものは「ステータス遷移の実履歴に該当ステータスがある場合のみ」表示する
// （= 推測フォールバックでは出さない）。スキップされ得る「検討中」は実履歴必須にして、
//   面談設定済→受託 のように検討中を踏まなかった案件で誤って出ないようにする。
const MILESTONE_DEFS: { statuses: string[]; label: string; historyOnly?: boolean; dateOf: (c: CaseRow, firstStarted: string | null) => string | null }[] = [
  { statuses: ['面談設定済'], label: '面談',         dateOf: c => ymd(c.meeting_executed_date) ?? ymd(c.meeting_date) },
  { statuses: ['検討中', '検討中（契約書待ち）'], label: '検討結果回答', historyOnly: true, dateOf: c => ymd(c.client_response_due_date) },
  { statuses: ['受注'],       label: '受注',         dateOf: c => ymd(c.order_received_date) ?? ymd(c.order_date) },
  { statuses: ['対応中'],     label: '対応開始',     dateOf: (_c, fs) => fs },
  { statuses: ['完了'],       label: '完了',         dateOf: c => ymd(c.completion_date) },
]

export default function CaseTimeline({ caseData, tasks, properties = [], statusHistory = [], documentReceipts = [] }: Props) {
  const todayYmd = todayJstYmd(new Date())
  const currentIdx = STATUS_ORDER.indexOf(caseData.status)

  const caseTasks = tasks.filter(t => t.task_kind !== 'system')
  const systemTasks = tasks.filter(t => t.task_kind === 'system')
  const visibleProperties = properties.filter(p => p.appraisal_status !== '不要')

  const firstStarted = caseTasks
    .map(t => ymd(t.started_at))
    .filter((d): d is string => !!d)
    .sort()[0] ?? null

  // ステータス履歴 → 到達ステータス集合 + 各ステータスの実遷移日
  const histDate = new Map<string, string>()
  for (const h of statusHistory) {
    if (h.new_value && !histDate.has(h.new_value)) histDate.set(h.new_value, ymd(h.created_at) ?? '')
  }
  const hasHistory = statusHistory.length > 0
  // 標準フロー（面談/受注/対応開始/完了）: 履歴があれば履歴、無ければ現ステータスまでの順序で推測
  const reached = (status: string) =>
    hasHistory
      ? histDate.has(status)
      : STATUS_ORDER.indexOf(status) !== -1 && STATUS_ORDER.indexOf(status) <= currentIdx
  // 実履歴必須（検討結果回答など）: 遷移ログに該当ステータスが記録されている場合のみ
  const reachedStrict = (status: string) => histDate.has(status)

  // 実際に通過したマイルストーンのみ
  const milestones = MILESTONE_DEFS
    .filter(d => d.statuses.some(s => (d.historyOnly ? reachedStrict(s) : reached(s))))
    .map(d => {
      const fromHist = d.statuses.map(s => histDate.get(s)).find(Boolean) ?? null
      return { label: d.label, date: d.dateOf(caseData, firstStarted) ?? fromHist }
    })
  const showGoalTarget = caseData.status !== '完了'

  // フェーズ別タスク
  const tasksByPhase = new Map<string, TaskRow[]>()
  for (const t of caseTasks) {
    const k = t.phase || 'phase1'
    if (!tasksByPhase.has(k)) tasksByPhase.set(k, [])
    tasksByPhase.get(k)!.push(t)
  }
  const orderedPhases = PHASE_ORDER
    .filter(p => (tasksByPhase.get(p)?.length ?? 0) > 0)
    .map(p => ({ key: p, label: getPhaseDefinition(p)?.label ?? p, tasks: [...tasksByPhase.get(p)!].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) }))

  // 書類到着（実績）
  const receipts = documentReceipts
    .filter(r => r.received_date)
    .sort((a, b) => (a.received_date ?? '').localeCompare(b.received_date ?? ''))

  const sortedSystem = systemTasks.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[15px] font-semibold text-gray-900">案件タイムライン</h3>
        <Legend />
      </div>

      {/* ① マイルストーン軸（実際に通過したステータスのみ） */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start min-w-[640px]">
          {/* START */}
          <div className="flex flex-col items-center justify-start pt-1 pr-1 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-sm">
              <Flag className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <span className="mt-1.5 text-[11px] font-bold text-gray-500 tracking-wider">START</span>
          </div>

          {milestones.map((m, i) => {
            const isCurrent = i === milestones.length - 1 && caseData.status !== '完了'
            return (
              <div key={m.label + i} className="flex items-start flex-1 min-w-[130px]">
                <div className="flex-1 h-[3px] mt-[18px] rounded-full bg-brand-500" />
                <div className="flex flex-col items-center px-1 flex-shrink-0" style={{ width: 96 }}>
                  <div className={`rounded-full bg-brand-600 ${isCurrent ? 'w-[18px] h-[18px] ring-4 ring-brand-100' : 'w-3.5 h-3.5'}`} />
                  <span className="mt-2 text-[12px] text-center leading-tight text-gray-900 font-semibold">{m.label}</span>
                  <span className="text-[11px] font-mono text-gray-400 mt-0.5">{m.date ?? '—'}</span>
                </div>
              </div>
            )
          })}

          {/* 完了予定（未完了時のみ・未来の目標） */}
          {showGoalTarget && (
            <div className="flex items-start flex-1 min-w-[130px]">
              <div className="flex-1 h-[3px] mt-[18px] rounded-full bg-gray-200" />
              <div className="flex flex-col items-center px-1 flex-shrink-0" style={{ width: 96 }}>
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-gray-300" />
                <span className="mt-2 text-[12px] text-center leading-tight text-gray-400">完了予定</span>
                <span className="text-[11px] font-mono text-gray-400 mt-0.5">{ymd(caseData.expected_completion_date) ?? '—'}</span>
              </div>
            </div>
          )}

          {/* GOAL */}
          <div className="flex items-start flex-shrink-0">
            <div className={`flex-1 h-[3px] mt-[18px] rounded-full ${caseData.status === '完了' ? 'bg-brand-500' : 'bg-gray-200'} min-w-[24px]`} />
            <div className="flex flex-col items-center justify-start pt-1 pl-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${caseData.status === '完了' ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
                <Trophy className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <span className="mt-1.5 text-[11px] font-bold text-gray-500 tracking-wider">GOAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* ② 受注後の初期対応（系統タスク） */}
      {sortedSystem.length > 0 && (
        <TaskLane title="受注後の初期対応" tasks={sortedSystem} todayYmd={todayYmd} />
      )}

      {/* ③ 書類到着（実績ベース） */}
      {receipts.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">書類到着（実績）</h4>
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex items-start gap-0">
              {receipts.map((r, idx) => {
                const names = (r.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map(it => it.item_name)
                const title = names.length > 0 ? names.join('・') : '書類一式'
                return (
                  <div key={r.id} className="flex items-start" style={{ minWidth: 140 }}>
                    <div className="flex flex-col items-center" style={{ width: 140 }}>
                      <div className="flex items-center w-full">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center text-emerald-600">
                          <FileText className="w-3 h-3" strokeWidth={2.25} />
                        </span>
                        {idx < receipts.length - 1 && <span className="flex-1 h-[2px] bg-emerald-200" />}
                      </div>
                      <span className="mt-2 text-[12px] text-center leading-snug text-gray-800 px-1.5" style={{ wordBreak: 'break-word' }} title={title}>{title}</span>
                      <span className="text-[11px] font-mono text-gray-400 mt-0.5">{r.received_date}</span>
                      {r.started_by_member?.name && <span className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[130px]">{r.started_by_member.name}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ④ フェーズ別タスク */}
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
                  <span className="inline-flex items-center mt-1 text-[11px] font-mono px-2 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200">{done}/{total}</span>
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

      {/* ⑤ 不動産査定 */}
      {visibleProperties.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">不動産査定</h4>
          <div className="space-y-3">
            {visibleProperties.map((p, i) => <PropertyRow key={p.id} property={p} index={i + 1} />)}
          </div>
        </div>
      )}

      {orderedPhases.length === 0 && sortedSystem.length === 0 && receipts.length === 0 && visibleProperties.length === 0 && (
        <div className="mt-5 bg-gray-50 border border-gray-200 rounded-lg p-5 text-center text-[13px] text-gray-500">
          タスク・書類がまだありません。タスク一括生成や書類受信簿への登録で、ここに実績が表示されます。
        </div>
      )}
    </div>
  )
}

// ───────── タスクレーン（横並び） ─────────
function TaskLane({ title, tasks, todayYmd }: { title: string; tasks: TaskRow[]; todayYmd: string }) {
  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <h4 className="text-[13px] font-bold text-gray-800 mb-3">{title}</h4>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex items-start gap-0">
          {tasks.map((t, idx) => <TaskNode key={t.id} task={t} todayYmd={todayYmd} isLast={idx === tasks.length - 1} />)}
        </div>
      </div>
    </div>
  )
}

// ───────── タスクノード（名前・着手日・着手者・完了日・超過日数） ─────────
function TaskNode({ task, todayYmd, isLast }: { task: TaskRow; todayYmd: string; isLast: boolean }) {
  const state = classifyTask(task, todayYmd)
  const started = ymd(task.started_at)
  const completed = ymd(task.completed_at)
  const assignee = taskAssignee(task)
  const od = overdueDays(task, todayYmd)
  return (
    <div className="flex items-start" style={{ minWidth: 144 }}>
      <div className="flex flex-col items-center" style={{ width: 144 }}>
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
        <div className="mt-0.5 flex flex-col items-center gap-0">
          {state === 'done' && completed
            ? <span className="text-[11px] font-mono text-brand-600">完了 {completed}</span>
            : started
              ? <span className="text-[11px] font-mono text-gray-400">着手 {started}</span>
              : task.due_date
                ? <span className="text-[11px] font-mono text-gray-400">期限 {task.due_date}</span>
                : null}
          {assignee && <span className="text-[11px] text-gray-500 truncate max-w-[132px]">{assignee}</span>}
          {od !== null && <span className="text-[11px] font-bold text-red-600">{od}日超過</span>}
        </div>
      </div>
    </div>
  )
}

// ───────── 不動産査定（3ステップ） ─────────
function PropertyRow({ property, index }: { property: RealEstatePropertyRow; index: number }) {
  const status = property.appraisal_status ?? '未対応'
  const steps: Array<'未対応' | '対応中' | '完了'> = ['未対応', '対応中', '完了']
  const idxCur = steps.indexOf(status as '未対応' | '対応中' | '完了')
  const safeIdx = idxCur === -1 ? 0 : idxCur
  const label = property.address
    ? `物件${index}：${property.address}${property.lot_number ? ` ${property.lot_number}` : ''}`
    : `物件${index}`
  return (
    <div className="flex gap-3 items-center">
      <div className="w-44 flex-shrink-0 text-[13px] text-gray-800 truncate" title={label}>{label}</div>
      <div className="flex-1 max-w-md flex items-center">
        {steps.map((step, idx) => {
          const r = idx <= safeIdx
          const isLast = idx === steps.length - 1
          return (
            <div key={step} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center" style={{ minWidth: 80 }}>
                <span className={`w-4 h-4 rounded-full border-2 ${r ? 'bg-brand-600 border-brand-600' : 'bg-white border-gray-300'}`} />
                <span className={`mt-1.5 text-[12px] ${r ? 'text-brand-700 font-semibold' : 'text-gray-400'}`}>{step}</span>
              </div>
              {!isLast && <span className={`flex-1 h-[2px] ${idx < safeIdx ? 'bg-brand-600' : 'bg-gray-200'}`} style={{ marginBottom: 22 }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend() {
  const items: { cls: string; label: string }[] = [
    { cls: 'bg-brand-600', label: '完了' },
    { cls: 'bg-sky-500 ring-2 ring-sky-100', label: '対応中' },
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

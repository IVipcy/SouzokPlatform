'use client'

import Link from 'next/link'
import { Flag, Trophy, FileText, MessagesSquare, Handshake, Play, ClipboardCheck, type LucideIcon } from 'lucide-react'
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
  /** full=全部 / milestones=マイルストーン軸のみ（タブ上部用） / detail=作業の線表のみ（案件進捗タブ用） */
  variant?: 'full' | 'milestones' | 'detail'
}

// ───────── タスクの状態正規化（差戻しは廃止） ─────────
type TaskState = 'done' | 'active' | 'overdue' | 'pending'

function classifyTask(t: TaskRow, todayYmd: string): TaskState {
  if (t.status === '完了') return 'done'
  const overdue = !!(t.due_date && t.due_date < todayYmd)
  if (t.status === '対応中' || t.status === 'Wチェック待ち') return overdue ? 'overdue' : 'active'
  return overdue ? 'overdue' : 'pending'
}

// ノードの状態色（ブランド基調＋赤=要対応のみ。リングは「対応中」だけ控えめに）
const NODE_CLS: Record<TaskState, string> = {
  done:    'bg-brand-600 border-brand-600',
  active:  'bg-brand-500 border-brand-500 ring-4 ring-brand-100',
  overdue: 'bg-red-500 border-red-500',
  pending: 'bg-white border-gray-300',
}
// 連結線は淡いグレーで統一（情報過多を避ける）
const CONNECTOR = 'bg-gray-200'
// タスク名の色: 既定はニュートラル、超過のみ赤、対応中は強調、完了は淡く
function titleCls(state: TaskState): string {
  if (state === 'overdue') return 'text-red-600 font-semibold'
  if (state === 'active') return 'text-gray-900 font-semibold'
  if (state === 'done') return 'text-gray-400'
  return 'text-gray-700'
}
const NODE_COL_W = 152

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
const MILESTONE_DEFS: { statuses: string[]; label: string; historyOnly?: boolean; Icon: LucideIcon; dateOf: (c: CaseRow, firstStarted: string | null) => string | null }[] = [
  { statuses: ['面談設定済'], label: '面談実施日',   Icon: MessagesSquare, dateOf: c => ymd(c.meeting_executed_date) ?? ymd(c.meeting_date) },
  { statuses: ['検討中', '検討中（契約書待ち）'], label: '検討結果回答', historyOnly: true, Icon: ClipboardCheck, dateOf: c => ymd(c.client_response_due_date) },
  { statuses: ['受注'],       label: '受注',         Icon: Handshake, dateOf: c => ymd(c.order_received_date) ?? ymd(c.order_date) },
  { statuses: ['対応中'],     label: '対応開始',     Icon: Play, dateOf: (_c, fs) => fs },
  { statuses: ['完了'],       label: '完了',         Icon: Trophy, dateOf: c => ymd(c.completion_date) },
]

export default function CaseTimeline({ caseData, tasks, properties = [], statusHistory = [], documentReceipts = [], variant = 'full' }: Props) {
  const showMilestones = variant !== 'detail'
  const showDetail = variant !== 'milestones'
  const cardTitle = variant === 'detail' ? '作業の進捗（タスク・書類）' : '案件タイムライン'
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
      return { label: d.label, date: d.dateOf(caseData, firstStarted) ?? fromHist, Icon: d.Icon }
    })
  const showGoalTarget = caseData.status !== '完了'

  // マイルストーン軸ノード（START/GOAL は廃止し、先頭=面談実施日 / 末尾=完了予定 を端点に）
  const axisNodes: { label: string; date: string | null; state: 'reached' | 'current' | 'future'; Icon: LucideIcon }[] = [
    ...milestones.map((m, i) => ({
      label: m.label,
      date: m.date,
      Icon: m.Icon,
      state: (i === milestones.length - 1 && caseData.status !== '完了' ? 'current' : 'reached') as 'reached' | 'current',
    })),
    ...(showGoalTarget ? [{ label: '完了予定', date: ymd(caseData.expected_completion_date), state: 'future' as const, Icon: Flag }] : []),
  ]

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

  // detail セクションの区切り線: マイルストーン非表示時は先頭セクションだけ上線・余白なし
  const detailKeys: string[] = []
  if (sortedSystem.length > 0) detailKeys.push('system')
  if (receipts.length > 0) detailKeys.push('receipts')
  if (orderedPhases.length > 0) detailKeys.push('phases')
  if (visibleProperties.length > 0) detailKeys.push('props')
  const sepCls = (key: string) =>
    (!showMilestones && detailKeys[0] === key) ? '' : 'mt-6 pt-4 border-t border-gray-100'
  const allEmpty = detailKeys.length === 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[15px] font-semibold text-gray-900">{cardTitle}</h3>
        {showDetail && <Legend />}
      </div>

      {/* ① マイルストーン軸（大きめアイコン円。先頭=面談実施日 / 末尾=完了予定） */}
      {showMilestones && (
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start min-w-[520px] px-1">
          {axisNodes.map((n, i) => {
            const isFirst = i === 0
            const isLast = i === axisNodes.length - 1
            const leftReached = i > 0 && axisNodes[i - 1].state !== 'future'
            const rightReached = n.state !== 'future'
            const circleCls = n.state === 'future'
              ? 'bg-white text-gray-400 border-2 border-gray-300'
              : 'bg-brand-700 text-white'
            const ring = n.state === 'current' ? 'ring-4 ring-brand-100' : ''
            return (
              <div key={n.label + i} className="flex flex-col items-center flex-1 min-w-[110px]">
                {/* アイコン円 ＋ 左右の連結線（円の中心で接続） */}
                <div className="flex items-center w-full">
                  <span className={`flex-1 h-[3px] rounded-full ${isFirst ? 'opacity-0' : leftReached ? 'bg-brand-500' : 'bg-gray-200'}`} />
                  <span className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${circleCls} ${ring}`}>
                    <n.Icon className="w-[22px] h-[22px]" strokeWidth={2} />
                  </span>
                  <span className={`flex-1 h-[3px] rounded-full ${isLast ? 'opacity-0' : rightReached ? 'bg-brand-500' : 'bg-gray-200'}`} />
                </div>
                <span className={`mt-2 text-[13px] text-center font-semibold ${n.state === 'future' ? 'text-gray-400' : 'text-gray-900'}`}>{n.label}</span>
                <span className="text-[11px] font-mono text-gray-400 mt-0.5">{n.date ?? '—'}</span>
              </div>
            )
          })}
        </div>
      </div>
      )}

      {showDetail && (<>
      {/* ② 受注後の初期対応（系統タスク） */}
      {sortedSystem.length > 0 && (
        <TaskLane title="受注後の初期対応" tasks={sortedSystem} todayYmd={todayYmd} sepCls={sepCls('system')} />
      )}

      {/* ③ 書類到着（実績ベース） */}
      {receipts.length > 0 && (
        <div className={sepCls('receipts')}>
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">書類到着（実績）</h4>
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex items-start gap-0">
              {receipts.map((r, idx) => {
                const names = (r.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map(it => it.item_name)
                const title = names.length > 0 ? names.join('・') : '書類一式'
                return (
                  <div key={r.id} className="flex flex-col items-center flex-shrink-0" style={{ width: NODE_COL_W }}>
                    <div className="flex items-center w-full">
                      <span className={`flex-1 h-[2px] ${idx === 0 ? 'opacity-0' : CONNECTOR}`} />
                      <span className="w-6 h-6 rounded-full bg-brand-50 border-2 border-brand-300 flex items-center justify-center text-brand-600 flex-shrink-0">
                        <FileText className="w-3 h-3" strokeWidth={2.25} />
                      </span>
                      <span className={`flex-1 h-[2px] ${idx === receipts.length - 1 ? 'opacity-0' : CONNECTOR}`} />
                    </div>
                    <div className="mt-2.5 px-2 text-center w-full">
                      <div className="text-[12px] leading-snug text-gray-700" style={{ wordBreak: 'break-word' }} title={title}>{title}</div>
                      <div className="mt-1 flex flex-col items-center gap-0.5">
                        <span className="text-[11px] text-gray-400">{r.received_date}</span>
                        {r.started_by_member?.name && <span className="text-[11px] text-gray-500 truncate max-w-[140px]">{r.started_by_member.name}</span>}
                      </div>
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
        <div className={`${sepCls('phases')} space-y-4`}>
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
                      <TaskNode key={t.id} task={t} todayYmd={todayYmd} isFirst={idx === 0} isLast={idx === p.tasks.length - 1} />
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
        <div className={sepCls('props')}>
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">不動産査定</h4>
          <div className="space-y-3">
            {visibleProperties.map((p, i) => <PropertyRow key={p.id} property={p} index={i + 1} />)}
          </div>
        </div>
      )}

      {allEmpty && (
        <div className={`${showMilestones ? 'mt-5' : ''} bg-gray-50 border border-gray-200 rounded-lg p-5 text-center text-[13px] text-gray-500`}>
          タスク・書類がまだありません。タスク一括生成や書類受信簿への登録で、ここに実績が表示されます。
        </div>
      )}
      </>)}
    </div>
  )
}

// ───────── タスクレーン（横並び） ─────────
function TaskLane({ title, tasks, todayYmd, sepCls }: { title: string; tasks: TaskRow[]; todayYmd: string; sepCls: string }) {
  return (
    <div className={sepCls}>
      <h4 className="text-[13px] font-bold text-gray-800 mb-3">{title}</h4>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex items-start gap-0">
          {tasks.map((t, idx) => <TaskNode key={t.id} task={t} todayYmd={todayYmd} isFirst={idx === 0} isLast={idx === tasks.length - 1} />)}
        </div>
      </div>
    </div>
  )
}

// ───────── タスクノード（ドット中央・中央下にタスク名/日付/担当/超過） ─────────
function TaskNode({ task, todayYmd, isFirst, isLast }: { task: TaskRow; todayYmd: string; isFirst: boolean; isLast: boolean }) {
  const state = classifyTask(task, todayYmd)
  const started = ymd(task.started_at)
  const completed = ymd(task.completed_at)
  const assignee = taskAssignee(task)
  const od = overdueDays(task, todayYmd)
  // 日付ラベル（完了 > 着手 > 期限 の優先）。各メタ行は固定高さで揃える。
  const dateText = (state === 'done' && completed) ? `完了 ${completed}`
    : started ? `着手 ${started}`
    : task.due_date ? `期限 ${task.due_date}`
    : ''
  return (
    <div className="flex flex-col items-center flex-shrink-0" style={{ width: NODE_COL_W }}>
      {/* ノード行: ドットを中央に、左右へ連結線 */}
      <div className="flex items-center w-full">
        <span className={`flex-1 h-[2px] ${isFirst ? 'opacity-0' : CONNECTOR}`} />
        <span className={`w-[14px] h-[14px] rounded-full border-2 flex-shrink-0 ${NODE_CLS[state]}`} title={`${task.title}（${task.status}）`} />
        <span className={`flex-1 h-[2px] ${isLast ? 'opacity-0' : CONNECTOR}`} />
      </div>
      {/* ラベル: ドット中央下。タイトル/日付/担当は固定高さで横一直線に揃える */}
      <div className="mt-2.5 px-2 text-center w-full">
        <Link
          href={`/tasks/${task.id}`}
          className={`block text-[12px] leading-[16px] line-clamp-2 h-8 hover:underline ${titleCls(state)}`}
          title={`「${task.title}」を開く`}
        >
          {task.title}
        </Link>
        <div className="mt-1.5">
          <div className="h-[15px] leading-[15px] text-[11px] text-gray-400 truncate">{dateText}</div>
          <div className="h-[15px] leading-[15px] text-[11px] text-gray-500 truncate">{assignee ?? ''}</div>
          <div className="h-[20px] flex items-start justify-center">
            {od !== null && (
              <span className="inline-block text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{od}日超過</span>
            )}
          </div>
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
    { cls: 'bg-brand-500 ring-2 ring-brand-100', label: '対応中' },
    { cls: 'bg-red-500', label: '期限超過' },
    { cls: 'bg-white border border-gray-300', label: '未着手' },
  ]
  return (
    <span className="text-[11px] text-gray-400 ml-auto flex items-center gap-3 flex-wrap">
      {items.map(it => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${it.cls}`} />{it.label}
        </span>
      ))}
    </span>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Flag, Trophy, FileText, MessagesSquare, Handshake, Play, ClipboardCheck, Check, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import { SectionHeading } from '@/components/ui/InlineFields'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { systemTaskGroup } from '@/lib/systemTaskGroup'
import type { CaseRow, TaskRow, RealEstatePropertyRow } from '@/types'


// 業務区分の正規化: "PhaseN:" 接頭辞を除き、旧Phase値(phase1..6)や空は「未分類」に寄せる。
function normGyomu(phase: string | null | undefined): string {
  const g = (phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()
  if (!g || /^phase\d+$/i.test(g)) return '未分類'
  return g
}

// 書類受信簿（タイムライン差し込み用の最小形）
export type TimelineReceipt = {
  id: string
  received_date: string | null
  started_by_member?: { name: string } | null
  started_task_id?: string | null
  items?: {
    id?: string
    item_name: string
    sort_order: number
    uploaded_at?: string | null
    link_not_required?: boolean | null
    settlement_reflect?: boolean | null
    settlement_amount?: number | null
    linked_id?: string | null
    linked_kind?: string | null
    linked_field?: string | null
    // 受領ファイル（受信簿で添付したものを case_documents に保存。migration 082の case_document_id 経由）
    case_document_id?: string | null
    case_document?: { received_file_path: string | null; received_file_bucket: string | null; received_file_name: string | null } | null
    // 到着物ごとに結ばれたタスク（多対多。migration 111）
    item_tasks?: { task: { id: string; title: string } | null }[] | null
  }[] | null
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
  /** 親側でフラットなセクションに埋め込むとき（白カード枠を外し、見出しを下線スタイルに） */
  embedded?: boolean
}

// ───────── タスクの状態正規化（差戻しは廃止） ─────────
type TaskState = 'done' | 'active' | 'overdue' | 'pending'

function classifyTask(t: TaskRow, todayYmd: string): TaskState {
  if (t.status === '完了') return 'done'
  const overdue = !!(t.due_date && t.due_date < todayYmd)
  if (t.status === '対応中' || t.status === 'Wチェック待ち') return overdue ? 'overdue' : 'active'
  return overdue ? 'overdue' : 'pending'
}

// ノード丸（書類到着と統一）の状態色。text-* は中のアイコン/ドット色。
// 形と大きさは変えず、色みだけ担当区分で分ける。事務管理＝ピンク／管理担当＝みどり。
// 期限超過だけは両方とも赤。誰の担当かより「遅れている」ことを先に見せたいため。
type NodeRole = 'assistant' | 'manager'
const NODE_CIRCLE: Record<NodeRole, Record<TaskState, string>> = {
  assistant: {
    done:    'bg-pink-600 border-pink-600 text-white',
    active:  'bg-white border-pink-500 text-pink-500 ring-4 ring-pink-100',
    overdue: 'bg-white border-red-500 text-red-500',
    pending: 'bg-white border-pink-200 text-pink-200',
  },
  manager: {
    done:    'bg-emerald-600 border-emerald-600 text-white',
    active:  'bg-white border-emerald-500 text-emerald-500 ring-4 ring-emerald-100',
    overdue: 'bg-white border-red-500 text-red-500',
    pending: 'bg-white border-emerald-200 text-emerald-200',
  },
}
/** その丸を誰の色で塗るか。管理担当タスク(system)はみどり、それ以外はピンク。 */
const roleOfTask = (t: TaskRow): NodeRole => (t.task_kind === 'system' ? 'manager' : 'assistant')
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

const STATUS_ORDER = ['面談設定済', '検討中', '検討中（契約書待ち）', '受注', '戻り受注', '対応中', '完了', '失注', '紹介のみ']

// マイルストーン定義（実際に通過したステータスのみ表示）
// historyOnly=true のものは「ステータス遷移の実履歴に該当ステータスがある場合のみ」表示する
// （= 推測フォールバックでは出さない）。スキップされ得る「検討中」は実履歴必須にして、
//   面談設定済→受託 のように検討中を踏まなかった案件で誤って出ないようにする。
const MILESTONE_DEFS: { statuses: string[]; label: string; historyOnly?: boolean; Icon: LucideIcon; dateOf: (c: CaseRow, firstStarted: string | null) => string | null }[] = [
  { statuses: ['面談設定済'], label: '面談実施日',   Icon: MessagesSquare, dateOf: c => ymd(c.meeting_executed_date) ?? ymd(c.meeting_date) },
  { statuses: ['検討中', '検討中（契約書待ち）'], label: '検討結果回答', historyOnly: true, Icon: ClipboardCheck, dateOf: c => ymd(c.client_response_due_date) },
  { statuses: ['受注', '戻り受注'], label: '受注',   Icon: Handshake, dateOf: c => ymd(c.order_received_date) ?? ymd(c.order_date) },
  { statuses: ['対応中'],     label: '対応開始',     Icon: Play, dateOf: (_c, fs) => fs },
  { statuses: ['完了'],       label: '完了',         Icon: Trophy, dateOf: c => ymd(c.completion_date) },
]

// 受注後の稼働中案件（受注→現在→業務完了予定 の3点軸を表示する対象）
const ACTIVE_AXIS_STATUSES = new Set(['受注', '戻り受注', '作業着手準備', '対応中'])

// 2日付の「Xヶ月Y日」差分（from<=to 前提。負なら 0 扱い）
function monthDayDiff(from: Date, to: Date): { months: number; days: number; totalDays: number } {
  const totalDays = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000))
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  let days = to.getDate() - from.getDate()
  if (days < 0) { months -= 1; days += new Date(to.getFullYear(), to.getMonth(), 0).getDate() }
  if (months < 0) { months = 0; days = 0 }
  return { months, days, totalDays }
}
const fmtMonthDay = (d: { months: number; days: number }) => d.months > 0 ? `${d.months}ヶ月${d.days}日` : `${d.days}日`

// 受注後の稼働中案件の帯タイムライン（矢羽根）。
// 受注→現在を「進んだ量」としてロイヤルブルーで塗り、まだ来ていない区間はクリームの帯。
// 予定を過ぎた案件は、予定を越えたぶんだけ赤になる（遅れの大きさが帯の長さで見える）。
// 数字（残り/超過）は帯の上、ノード名と日付は帯の下1段。丸ノードにアイコンを置く。
//
// 以前は 受注→現在 の線を最終接触の鮮度で青/黄/赤に塗り分けていたが、
// 鮮度は案件フラグ・アラートで見えるためここでは畳み、帯の色は進捗の意味に一本化した。
const AXIS_C = {
  blue: '#2F5AD9', blueDark: '#24449C', blueRing: '#DDE5FA',
  cream: '#F4EDE3', creamEdge: '#D9CDB9', creamText: '#8A7B60', creamTick: '#E3D9C9',
  red: '#CE3B3B', redDark: '#B02E2E', redRing: '#F9E2E2',
}
// 帯の丸ノード＋下のラベル（名前・日付）。レンダー中に部品を作らないようモジュールレベルに置く。
function AxisNode({ compact, leftPct, Icon, label, date, tone, big }: {
  compact: boolean; leftPct: number; Icon: LucideIcon; label: string; date: string | null
  tone: 'blue' | 'red' | 'cream' | 'redOutline'; big?: boolean
}) {
  const nodePx = compact ? 26 : 32
  const sz = big ? nodePx + 4 : nodePx
  const style: React.CSSProperties =
    tone === 'blue' ? { background: AXIS_C.blue, color: '#fff', border: '2px solid #fff', boxShadow: big ? `0 0 0 4px ${AXIS_C.blueRing}` : undefined }
    : tone === 'red' ? { background: AXIS_C.red, color: '#fff', border: '2px solid #fff', boxShadow: big ? `0 0 0 4px ${AXIS_C.redRing}` : undefined }
    : tone === 'redOutline' ? { background: '#fff', color: AXIS_C.red, border: `2px solid ${AXIS_C.red}` }
    : { background: AXIS_C.cream, color: AXIS_C.creamText, border: `2px solid ${AXIS_C.creamEdge}` }
  return (
    <>
      <span className="absolute z-10 rounded-full flex items-center justify-center" style={{ left: `${leftPct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: sz, height: sz, ...style }}>
        <Icon className={compact ? 'w-[13px] h-[13px]' : 'w-4 h-4'} strokeWidth={2.1} />
      </span>
      <div className="absolute text-center whitespace-nowrap" style={{ left: `${leftPct}%`, top: nodePx / 2 + 10, transform: 'translateX(-50%)' }}>
        <div className={`${compact ? 'text-[11px]' : 'text-[12.5px]'} font-semibold leading-tight`} style={{ color: tone === 'redOutline' ? AXIS_C.redDark : tone === 'cream' ? '#6b7280' : '#111827' }}>{label}</div>
        <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-mono`} style={{ color: tone === 'redOutline' ? AXIS_C.redDark : '#9ca3af' }}>{date ?? '—'}</div>
      </div>
    </>
  )
}
// 帯の上に出す数字（残り/超過）。月ラベルよりさらに上の段。
function AxisCaption({ compact, leftPct, head, value, color }: { compact: boolean; leftPct: number; head: string; value: string; color: string }) {
  return (
    <div className="absolute whitespace-nowrap" style={{ left: `${leftPct}%`, top: -36, transform: 'translateX(-50%)', color }}>
      <span className="text-[10.5px] mr-1">{head}</span>
      <span className={`${compact ? 'text-[14px]' : 'text-[15px]'} font-bold`}>{value}</span>
    </div>
  )
}
function ActiveMilestoneAxis({ caseData, compact }: { caseData: CaseRow; compact: boolean }) {
  const parse = (s: string | null | undefined) => { if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d }
  const orderYmd = ymd(caseData.order_received_date) ?? ymd(caseData.order_date)
  const goalYmd = ymd(caseData.expected_completion_date)
  const orderDate = parse(orderYmd)
  const goalDate = parse(goalYmd)
  const now = new Date()
  const todayStr = now.toLocaleDateString('sv-SE')
  const over = !!goalDate && goalDate.getTime() < now.getTime()

  const remainDiff = goalDate && !over ? monthDayDiff(now, goalDate) : null
  const overDiff = goalDate && over ? monthDayDiff(goalDate, now) : null
  const elapsedDays = orderDate ? Math.max(1, monthDayDiff(orderDate, now).totalDays) : null
  const plannedDays = orderDate && goalDate ? Math.max(1, monthDayDiff(orderDate, goalDate).totalDays) : null

  // 折り返し点（通常=現在、超過=業務完了予定）の位置。日数比だが、
  // 端に寄りすぎるとラベル同士が重なるので 15〜85% に収める。
  const clamp = (r: number) => Math.min(0.85, Math.max(0.15, r))
  const midRatio = over
    ? clamp(plannedDays && elapsedDays ? plannedDays / elapsedDays : 0.5)
    : clamp(plannedDays && elapsedDays ? elapsedDays / plannedDays : 0.5)
  const midPct = midRatio * 100
  const tailPct = (midRatio + 1) / 2 * 100   // 後半区間（残り/超過）の中央

  // 月目盛り：帯の全期間（受注→予定、超過時は受注→現在）に入る各月1日。
  const spanStart = orderDate
  const spanEnd = over ? now : goalDate
  const monthTicks: { label: string; ratio: number }[] = []
  if (spanStart && spanEnd && spanEnd.getTime() > spanStart.getTime()) {
    const span = spanEnd.getTime() - spanStart.getTime()
    const startYear = spanStart.getFullYear()
    const d = new Date(spanStart.getFullYear(), spanStart.getMonth() + 1, 1)
    while (d.getTime() < spanEnd.getTime()) {
      const m = d.getMonth() + 1
      const label = (d.getFullYear() !== startYear && m === 1) ? `${d.getFullYear()}/1月` : `${m}月`
      monthTicks.push({ label, ratio: (d.getTime() - spanStart.getTime()) / span })
      d.setMonth(d.getMonth() + 1)
    }
  }
  const tickStep = monthTicks.length > 10 ? 2 : 1

  const nodePx = compact ? 26 : 32

  return (
    <div style={{ padding: `40px ${compact ? 44 : 56}px ${nodePx / 2 + 42}px` }}>
      <div className="relative" style={{ height: 7 }}>
        {/* 月目盛り（クリーム系の細線＋小さな月ラベル） */}
        {monthTicks.filter((_, i) => i % tickStep === 0).map((t, i) => (
          <div key={i} className="absolute pointer-events-none" style={{ left: `${t.ratio * 100}%` }}>
            <div className="absolute" style={{ top: -5, width: 1, height: 14, background: AXIS_C.creamTick }} />
            <div className="absolute text-[9px] leading-none text-gray-400 whitespace-nowrap" style={{ top: -17, transform: 'translateX(-50%)' }}>{t.label}</div>
          </div>
        ))}
        {/* 帯の下地（クリーム）＝これから先の区間の色 */}
        <div className="absolute inset-0 rounded-full" style={{ background: AXIS_C.cream }} />
        {/* 進んだ量（青）と、予定を越えたぶん（赤） */}
        <div className="absolute rounded-l-full" style={{ left: 0, top: 0, height: 7, width: `${midPct}%`, background: AXIS_C.blue }} />
        {over && <div className="absolute rounded-r-full" style={{ left: `${midPct}%`, top: 0, height: 7, width: `${100 - midPct}%`, background: AXIS_C.red }} />}
        {/* 数字（完了予定が未設定なら出さない。「残り —」は情報が無い） */}
        {goalDate && (over
          ? <AxisCaption compact={compact} leftPct={tailPct} head="超過" value={overDiff ? fmtMonthDay(overDiff) : '—'} color={AXIS_C.redDark} />
          : <AxisCaption compact={compact} leftPct={tailPct} head="残り" value={remainDiff ? fmtMonthDay(remainDiff) : '—'} color={AXIS_C.blueDark} />)}
        {/* ノード（時系列どおりの並び。超過時は旗を通り過ぎて赤い区間を進んでいる） */}
        <AxisNode compact={compact} leftPct={0} Icon={Handshake} label="受注" date={orderYmd} tone="blue" />
        {over ? (
          <>
            <AxisNode compact={compact} leftPct={midPct} Icon={Flag} label="業務完了予定" date={goalYmd} tone="redOutline" />
            <AxisNode compact={compact} leftPct={100} Icon={Play} label="現在" date={todayStr} tone="red" big />
          </>
        ) : (
          <>
            <AxisNode compact={compact} leftPct={midPct} Icon={Play} label="現在" date={todayStr} tone="blue" big />
            <AxisNode compact={compact} leftPct={100} Icon={Flag} label="完了予定" date={goalYmd} tone="cream" />
          </>
        )}
      </div>
    </div>
  )
}

// ───────── マイルストーン軸（独立コンポーネント。ヘッダーに compact で埋め込み可能） ─────────
export function MilestoneAxis({ caseData, tasks, statusHistory = [], compact = false }: {
  caseData: CaseRow
  tasks: TaskRow[]
  statusHistory?: TimelineStatusEvent[]
  compact?: boolean
}) {
  // 受注後の稼働中案件は 受注→現在→業務完了予定 の3点軸で表示する。
  if (ACTIVE_AXIS_STATUSES.has(caseData.status)) {
    return <ActiveMilestoneAxis caseData={caseData} compact={compact} />
  }
  const currentIdx = STATUS_ORDER.indexOf(caseData.status)
  const caseTasks = tasks.filter(t => t.task_kind !== 'system')
  const firstStarted = caseTasks.map(t => ymd(t.started_at)).filter((d): d is string => !!d).sort()[0] ?? null

  const histDate = new Map<string, string>()
  for (const h of statusHistory) {
    if (h.new_value && !histDate.has(h.new_value)) histDate.set(h.new_value, ymd(h.created_at) ?? '')
  }
  const hasHistory = statusHistory.length > 0
  const reached = (status: string) =>
    hasHistory ? histDate.has(status) : (STATUS_ORDER.indexOf(status) !== -1 && STATUS_ORDER.indexOf(status) <= currentIdx)
  const reachedStrict = (status: string) => histDate.has(status)

  const milestones = MILESTONE_DEFS
    .filter(d => d.statuses.some(s => (d.historyOnly ? reachedStrict(s) : reached(s))))
    .map(d => {
      const fromHist = d.statuses.map(s => histDate.get(s)).find(Boolean) ?? null
      return { label: d.label, date: d.dateOf(caseData, firstStarted) ?? fromHist, Icon: d.Icon }
    })
  const showGoalTarget = caseData.status !== '完了'
  const axisNodes: { label: string; date: string | null; state: 'reached' | 'current' | 'future'; Icon: LucideIcon }[] = [
    ...milestones.map((m, i) => ({
      label: m.label, date: m.date, Icon: m.Icon,
      state: (i === milestones.length - 1 && caseData.status !== '完了' ? 'current' : 'reached') as 'reached' | 'current',
    })),
    ...(showGoalTarget ? [{ label: '完了予定', date: ymd(caseData.expected_completion_date), state: 'future' as const, Icon: Flag }] : []),
  ]

  // サイズ（compact=ヘッダー埋め込み用に小さく）
  const circle = compact ? 'w-8 h-8' : 'w-12 h-12'
  const iconSz = compact ? 'w-[15px] h-[15px]' : 'w-[22px] h-[22px]'
  const ring = compact ? 'ring-2 ring-brand-100' : 'ring-4 ring-brand-100'
  const labelCls = compact ? 'mt-1 text-[11px]' : 'mt-2 text-[13px]'
  const dateCls = compact ? 'text-[10px]' : 'text-[11px] mt-0.5'
  const colMin = compact ? 'min-w-[84px]' : 'min-w-[110px]'
  const minW = compact ? 'min-w-[260px]' : 'min-w-[520px]'

  return (
    <div className="overflow-x-auto">
      <div className={`flex items-start ${minW}`}>
        {axisNodes.map((n, i) => {
          const isFirst = i === 0
          const isLast = i === axisNodes.length - 1
          const leftReached = i > 0 && axisNodes[i - 1].state !== 'future'
          const rightReached = n.state !== 'future'
          const circleCls = n.state === 'future' ? 'bg-white text-gray-400 border-2 border-gray-300' : 'bg-brand-700 text-white'
          return (
            <div key={n.label + i} className={`flex flex-col items-center flex-1 ${colMin}`}>
              <div className="flex items-center w-full">
                <span className={`flex-1 h-[2px] rounded-full ${isFirst ? 'opacity-0' : leftReached ? 'bg-brand-500' : 'bg-gray-200'}`} />
                <span className={`${circle} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${circleCls} ${n.state === 'current' ? ring : ''}`}>
                  <n.Icon className={iconSz} strokeWidth={2} />
                </span>
                <span className={`flex-1 h-[2px] rounded-full ${isLast ? 'opacity-0' : rightReached ? 'bg-brand-500' : 'bg-gray-200'}`} />
              </div>
              <span className={`${labelCls} text-center font-semibold leading-tight ${n.state === 'future' ? 'text-gray-400' : 'text-gray-900'}`}>{n.label}</span>
              <span className={`${dateCls} font-mono text-gray-400`}>{n.date ?? '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CaseTimeline({ caseData, tasks, properties = [], statusHistory = [], documentReceipts = [], variant = 'full', embedded = false }: Props) {
  const showMilestones = variant !== 'detail'
  const showDetail = variant !== 'milestones'
  const cardTitle = variant === 'detail' ? '作業の進捗（タスク・書類）' : '案件タイムライン'
  const todayYmd = todayJstYmd(new Date())

  // 業務のタスクだけを1本のレーンにまとめる。
  //   事務管理担当タスク（case）＋ 管理担当タスク（system のうち業務区分が入っているもの）
  // 「その他」の随時タスク（お客様連絡・引継ぎ 等）は案件の進み具合と別なのでここには出さない。
  const caseTasks = tasks.filter(t => t.task_kind !== 'system' || systemTaskGroup(t) === 'gyomu')
  const visibleProperties = properties.filter(p => p.appraisal_status !== '不要')

  // 業務区分別タスク（Phase概念は廃止。task.phase を業務区分として扱う）
  const tasksByGyomu = new Map<string, TaskRow[]>()
  for (const t of caseTasks) {
    const k = normGyomu(t.phase)
    if (!tasksByGyomu.has(k)) tasksByGyomu.set(k, [])
    tasksByGyomu.get(k)!.push(t)
  }
  // 業務内は「完了 → 対応中/超過 → 未着手」でまとめる。
  const statusRank = (t: TaskRow): number => {
    const s = classifyTask(t, todayYmd)
    return s === 'done' ? 0 : s === 'pending' ? 2 : 1
  }
  // 業務区分の表示順: GYOMU_ALL の順 → それ以外 → 「未分類」を最後に
  const GYOMU_ORDER = [...GYOMU_ALL]
  const presentGyomu = [...tasksByGyomu.keys()]
  const orderedKeys = [
    ...GYOMU_ORDER.filter(g => tasksByGyomu.has(g)),
    ...presentGyomu.filter(g => g !== '未分類' && !GYOMU_ORDER.includes(g)),
    ...(tasksByGyomu.has('未分類') ? ['未分類'] : []),
  ]
  const orderedPhases = orderedKeys.map(g => ({
    key: g,
    label: g,
    tasks: [...tasksByGyomu.get(g)!].sort((a, b) => statusRank(a) - statusRank(b) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }))
  // 工程 ＞ 業務 でグループ化（矢羽根の3階層）。工程は業務区分から導出。
  type GyomuGroup = (typeof orderedPhases)[number]
  const koteiGroups = (() => {
    const m = new Map<string, GyomuGroup[]>()
    for (const p of orderedPhases) {
      const k = koteiOf(p.key)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(p)
    }
    return [...m.entries()]
      .sort((a, b) => koteiRank(a[0]) - koteiRank(b[0]))
      .map(([kotei, gyomus]) => ({ kotei, gyomus }))
  })()

  // 書類到着（実績）
  const receipts = documentReceipts
    .filter(r => r.received_date)
    .sort((a, b) => (a.received_date ?? '').localeCompare(b.received_date ?? ''))

  // detail セクションの区切り線: マイルストーン非表示時は先頭セクションだけ上線・余白なし
  const detailKeys: string[] = []
  if (receipts.length > 0) detailKeys.push('receipts')
  if (orderedPhases.length > 0) detailKeys.push('phases')
  if (visibleProperties.length > 0) detailKeys.push('props')
  const sepCls = (key: string) =>
    (!showMilestones && detailKeys[0] === key) ? '' : 'mt-6 pt-4 border-t border-gray-100'
  const allEmpty = detailKeys.length === 0

  return (
    <div className={embedded ? '' : 'bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm'}>
      {/* embedded（Section内に置かれるケース）では親の Section ヘッダーがタイトルを担うので
          ここではタイトルを出さず、必要なら凡例だけ右上に出す。 */}
      {embedded ? (
        showDetail && (
          <div className="flex items-center justify-end mb-2.5">
            <Legend />
          </div>
        )
      ) : (
        <div className="mb-5">
          <SectionHeading title={cardTitle} right={showDetail ? <Legend /> : undefined} />
        </div>
      )}

      {/* ① マイルストーン軸 */}
      {showMilestones && (
        <div className="pb-2">
          <MilestoneAxis caseData={caseData} tasks={tasks} statusHistory={statusHistory} />
        </div>
      )}

      {showDetail && (<>
      {/* ③ 書類到着（実績ベース） */}
      {receipts.length > 0 && (
        <div className={sepCls('receipts')}>
          <LaneHeading title="書類到着（実績）" />
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

      {/* ④ 業務ごとのタスク（工程 ＞ 業務 ＞ 作業の3階層）。事務管理＝ピンク／管理担当＝みどりの丸で見分ける。 */}
      {koteiGroups.length > 0 && (
        <div className={`${sepCls('phases')} space-y-5`}>
          <LaneHeading title="業務ごとのタスク" />
          {koteiGroups.map(kg => {
            const allTasks = kg.gyomus.flatMap(g => g.tasks)
            const koteiDone = allTasks.filter(t => t.status === '完了').length
            return (
              <div key={kg.kotei} className="space-y-3">
                {/* 工程見出し（中・青） */}
                <div className="flex items-center gap-2">
                  <span className="inline-block w-[3px] h-3.5 bg-brand-500 rounded-[1px]" />
                  <span className="text-[13px] font-bold text-brand-800">{kg.kotei}</span>
                  <span className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded border bg-brand-50 text-brand-700 border-brand-100">{koteiDone}/{allTasks.length}</span>
                </div>
                {kg.gyomus.map(p => {
                  const total = p.tasks.length
                  const done = p.tasks.filter(t => t.status === '完了').length
                  return (
                    <div key={p.key} className="pl-3">
                      {/* 業務見出し（小・ドット） */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-300" />
                        <span className="text-[12px] font-semibold text-gray-700 leading-tight">{p.label}</span>
                        <span className="inline-flex items-center text-[11px] font-mono px-1.5 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200">{done}/{total}</span>
                      </div>
                      <div className="overflow-x-auto pb-1">
                        <div className="inline-flex items-start gap-0">
                          {p.tasks.map((t, idx) => (
                            <TaskNode key={t.id} task={t} todayYmd={todayYmd} isFirst={idx === 0} isLast={idx === p.tasks.length - 1} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ⑤ 不動産査定 */}
      {visibleProperties.length > 0 && (
        <div className={sepCls('props')}>
          <LaneHeading title="不動産査定" />
          <div className="space-y-3">
            {visibleProperties.map((p, i) => <PropertyRow key={p.id} property={p} index={i + 1} />)}
          </div>
        </div>
      )}

      {allEmpty && (
        <div className={`${showMilestones ? 'mt-5' : ''} bg-gray-50 border border-gray-200 rounded-lg p-5 text-center text-[13px] text-gray-500`}>
          タスク・書類がまだありません。タスクの作成や書類受信簿への登録で、ここに実績が表示されます。
        </div>
      )}
      </>)}
    </div>
  )
}

// ───────── レーン見出し（青・左バー） ─────────
function LaneHeading({ title, count, collapsible, collapsed, onToggle }: { title: string; count?: string; collapsible?: boolean; collapsed?: boolean; onToggle?: () => void }) {
  const inner = (
    <>
      <span className="inline-block w-1 h-4 bg-brand-600 rounded-[1px]" />
      <h4 className="text-[14px] font-bold text-brand-900">{title}</h4>
      {count && <span className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded border bg-brand-50 text-brand-700 border-brand-100">{count}</span>}
    </>
  )
  if (collapsible) {
    return (
      <button type="button" onClick={onToggle} className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80">
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        {inner}
      </button>
    )
  }
  return <div className="flex items-center gap-2 mb-3">{inner}</div>
}


// ───────── タスクノード（ドット中央・中央下にタスク名/日付/担当/超過） ─────────
function TaskNode({ task, todayYmd, isFirst, isLast }: { task: TaskRow; todayYmd: string; isFirst: boolean; isLast: boolean }) {
  const [resultOpen, setResultOpen] = useState(false)
  const state = classifyTask(task, todayYmd)
  const ext = (task.ext_data ?? {}) as Record<string, unknown>
  const hasResult = typeof ext.execution_result === 'string' && ext.execution_result.trim() !== ''
  const started = ymd(task.started_at)
  const completed = ymd(task.completed_at)
  const assignee = taskAssignee(task)
  const od = overdueDays(task, todayYmd)
  // 日付ラベル（完了 > 着手 > 期限 の優先）。各メタ行は固定高さで揃える。
  // 見出し（完了/着手/期限）は小さいまま、日付だけ大きく太くする。線表で一番追いたいのが日付のため。
  const dateKind = (state === 'done' && completed) ? '完了' : started ? '着手' : task.due_date ? '期限' : ''
  const dateValue = (state === 'done' && completed) ? completed : started ? started : task.due_date ?? ''
  const dateText = (state === 'done' && completed) ? `完了 ${completed}`
    : started ? `着手 ${started}`
    : task.due_date ? `期限 ${task.due_date}`
    : ''
  return (
    <div className="flex flex-col items-center flex-shrink-0" style={{ width: NODE_COL_W }}>
      {/* ノード行: アイコン丸を中央に、左右へ連結線（書類到着と統一） */}
      <div className="flex items-center w-full">
        <span className={`flex-1 h-[2px] ${isFirst ? 'opacity-0' : CONNECTOR}`} />
        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${NODE_CIRCLE[roleOfTask(task)][state]}`} title={`${task.title}（${task.status}）`}>
          {state === 'done'
            ? <Check className="w-3.5 h-3.5" strokeWidth={2.75} />
            : <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />}
        </span>
        <span className={`flex-1 h-[2px] ${isLast ? 'opacity-0' : CONNECTOR}`} />
      </div>
      {/* ラベル: ドット中央下。タイトル/日付/担当は固定高さで横一直線に揃える */}
      <div className="mt-2.5 px-2 text-center w-full">
        <Link
          href={`/tasks/${task.id}`}
          className={`block text-[12px] leading-[16px] line-clamp-2 h-8 hover:underline ${titleCls(state)}`}
          title={hasResult ? `「${task.title}」を開く（実施結果あり）` : `「${task.title}」を開く`}
        >
          {task.title}
          {hasResult && <FileText className="inline-block w-3 h-3 ml-0.5 text-brand-500 align-[-1px]" />}
        </Link>
        <div className="mt-1.5">
          <div className="h-[18px] leading-[18px] truncate" title={dateText}>
            {dateValue && (
              <>
                <span className="text-[10.5px] text-gray-400 mr-1">{dateKind}</span>
                <span className={`text-[13px] font-semibold tabular-nums ${state === 'overdue' ? 'text-red-600' : 'text-gray-700'}`}>{dateValue}</span>
              </>
            )}
          </div>
          <div className="h-[15px] leading-[15px] text-[11px] text-gray-500 truncate">{assignee ?? ''}</div>
          <div className="h-[20px] flex items-start justify-center">
            {od !== null && (
              <span className="inline-block text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{od}日超過</span>
            )}
          </div>
          {/* 実施結果（進捗メモ）。既定は2行省略、クリックで全文展開 */}
          {hasResult && (
            <button
              type="button"
              onClick={() => setResultOpen(o => !o)}
              className={`mt-1 w-full text-left text-[10.5px] leading-[14px] text-gray-600 bg-gray-50 border border-gray-100 rounded px-1.5 py-1 hover:bg-gray-100 transition-colors ${resultOpen ? '' : 'line-clamp-2'}`}
              title={resultOpen ? 'クリックで折りたたむ' : 'クリックで全文表示'}
            >
              {(ext.execution_result as string).trim()}
            </button>
          )}
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
    { cls: 'bg-pink-600', label: '事務管理' },
    { cls: 'bg-emerald-600', label: '管理担当' },
    { cls: 'bg-white border-2 border-pink-500 ring-2 ring-pink-100', label: '対応中' },
    { cls: 'bg-white border-2 border-red-500', label: '期限超過' },
    { cls: 'bg-white border-2 border-pink-200', label: '未着手' },
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

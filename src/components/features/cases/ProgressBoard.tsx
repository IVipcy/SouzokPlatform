'use client'

// 管理担当向け 案件進捗ボード。業務グループ＋対象別サブ項目。上部にルールベース即時サマリー＋「AI進捗要約」(Sonnet 5)。
// サブタブ：進捗サマリー（このボード）／案件報告（確認依頼の履歴）／報連相・メモ。
import { useState, type ReactNode } from 'react'
import { Check, Sparkles, Wand2 } from 'lucide-react'
import { SubTabs } from '@/components/ui/SubTabs'
import HistoryTab from './HistoryTab'
import ComplaintsTab from './ComplaintsTab'
import type { ProgressBoard as Board, ItemStatus } from '@/lib/caseProgressBoard'
import type { CaseRow, TaskRow, MemberRow } from '@/types'

const STATUS_LABEL: Record<ItemStatus, string> = { done: '完了', prog: '進行中', todo: '未着手' }
const DONE = '#1D9E75', PROG = '#EF9F27', TODO = '#D8D5CD'
const LBL_COLOR: Record<ItemStatus, string> = { done: '#1D9E75', prog: '#B5651D', todo: '#9a978f' }

// 進み具合（時間軸）をAIへ渡すための計測。着手からの経過・期限超過・長期停滞をタスクから算出。
const dayDiff = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000)
export function buildTiming(caseData: CaseRow, tasks: TaskRow[]) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const startStr = caseData.management_started_at || caseData.order_received_date || caseData.created_at || null
  const elapsedDays = startStr ? dayDiff(today, new Date(startStr)) : null
  const active = tasks.filter(t => t.status !== '完了' && t.status !== 'キャンセル')
  // 期限超過：未完了で due_date を過ぎているタスク（超過日数の多い順）
  const overdue = active
    .filter(t => t.due_date && t.due_date < todayStr)
    .map(t => ({ name: t.title, days: dayDiff(today, new Date(`${t.due_date}T00:00:00`)) }))
    .sort((a, b) => b.days - a.days).slice(0, 8)
  // 直近の動き：全タスクの updated_at 最大からの経過日数
  const lastAct = tasks.reduce<string | null>((mx, t) => (t.updated_at && (!mx || t.updated_at > mx) ? t.updated_at : mx), null)
  const daysSinceLastActivity = lastAct ? dayDiff(today, new Date(lastAct)) : null
  // 長期停滞：着手済み・未完了で、最終更新から14日以上動いていないタスク
  const stalled = active
    .filter(t => t.started_at && !t.completed_at && t.updated_at)
    .map(t => ({ name: t.title, idleDays: dayDiff(today, new Date(t.updated_at)) }))
    .filter(x => x.idleDays >= 14)
    .sort((a, b) => b.idleDays - a.idleDays).slice(0, 8)
  return { startDate: startStr, elapsedDays, overdue, daysSinceLastActivity, stalled }
}

function Dot({ st }: { st: ItemStatus }) {
  if (st === 'done') return <span className="w-[15px] h-[15px] rounded-full flex items-center justify-center flex-none" style={{ background: DONE }}><Check className="w-2.5 h-2.5 text-white" strokeWidth={3} /></span>
  if (st === 'prog') return <span className="w-[15px] h-[15px] rounded-full bg-white flex-none" style={{ border: `2px solid ${PROG}`, boxShadow: '0 0 0 3px #FBE7C4' }} />
  return <span className="w-[15px] h-[15px] rounded-full bg-white flex-none" style={{ border: `2px solid ${TODO}` }} />
}

type ProgressBoardProps = {
  board: Board
  dealName: string
  // 進捗報告・メモ（サブタブ）用。
  caseData: CaseRow
  tasks: TaskRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
  salesMemberId?: string | null
  canRequestReview?: boolean
  // 管理担当ビューのみ：案件報告タブ内に「事務管理進捗」(案件進捗=BasicInfoTab)をサブタブとして差し込む。
  renderOfficeProgress?: () => ReactNode
  /** URL ?sub= から復元する初期サブタブ（通知遷移で 'report' | 'memo' | 'complaint' 指定される） */
  initialSub?: 'board' | 'office' | 'report' | 'memo' | 'complaint'
  /** 通知遷移で確認モーダルを自動オープンするための ID（progress_reports か case_reports） */
  openReportId?: string | null
}

export default function ProgressBoard({ board, dealName, caseData, tasks, allMembers, currentMemberId, salesMemberId = null, canRequestReview = false, renderOfficeProgress, initialSub, openReportId }: ProgressBoardProps) {
  const [sub, setSub] = useState<'board' | 'office' | 'report' | 'memo' | 'complaint'>(initialSub ?? 'board')
  const [aiOverall, setAiOverall] = useState<string | null>(null)
  const [aiByKotei, setAiByKotei] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const SUBTABS = [
    { key: 'board', label: '進捗サマリー' },
    ...(renderOfficeProgress ? [{ key: 'office', label: '事務管理進捗' }] : []),
    { key: 'report', label: '案件報告' },
    { key: 'memo', label: '報連相・メモ' },
    { key: 'complaint', label: '不満・クレーム' },
  ]

  // 業務が少ない案件は1列、多い案件は2列（案件詳細は横幅があるため）。
  const gridCols = board.total <= 5 ? '1fr' : 'repeat(2, minmax(0, 1fr))'

  const runAi = async () => {
    setBusy(true); setErr('')
    try {
      const items = board.koteiGroups.flatMap(kg => kg.groups.flatMap(g =>
        g.items.map(i => ({ kotei: kg.kotei, name: g.count ? `${g.title}・${i.name}` : i.name, status: STATUS_LABEL[i.status], note: i.note })),
      ))
      const res = await fetch('/api/progress-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, dealName, timing: buildTiming(caseData, tasks) }) })
      const j = (await res.json()) as { overall?: string; byKotei?: Record<string, string>; error?: string }
      if (!res.ok) { setErr(j.error ?? '生成に失敗しました'); return }
      setAiOverall(j.overall || '（要約できませんでした）')
      setAiByKotei(j.byKotei ?? {})
    } catch {
      setErr('通信に失敗しました')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <SubTabs tabs={SUBTABS} active={sub} onChange={k => setSub(k as 'board' | 'office' | 'report' | 'memo' | 'complaint')} />

      {sub === 'office' ? (
        <div>{renderOfficeProgress?.()}</div>
      ) : sub === 'complaint' ? (
        <ComplaintsTab caseData={caseData} currentMemberId={currentMemberId} salesMemberId={salesMemberId} allMembers={allMembers} />
      ) : sub === 'report' || sub === 'memo' ? (
        <HistoryTab
          section={sub}
          openReportId={openReportId ?? undefined}
          caseData={caseData}
          allMembers={allMembers}
          currentMemberId={currentMemberId}
          salesMemberId={salesMemberId}
          canRequestReview={canRequestReview}
          tasks={tasks.filter(t => t.task_kind !== 'system').map(t => ({ id: t.id, status: t.status }))}
        />
      ) : (
      <div className="space-y-4">
      {/* 全体サマリー（AI overall／未生成時はルールベース）＋進捗バー */}
      <div className="rounded-2xl border border-[#D5E4FB] bg-[#F4F8FF] px-4 py-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-[#378ADD]" strokeWidth={2} />
          <span className="text-[11.5px] font-semibold text-[#185FA5] tracking-wide">全体サマリー</span>
          <span className="text-[10px] text-[#7FA8D9] bg-[#E6F1FB] px-1.5 py-0.5 rounded">{aiOverall ? 'AI生成' : '自動'}</span>
          <span className="ml-auto text-[20px] font-medium text-[#0C447C] leading-none">{board.percent}%</span>
          <span className="text-[11px] text-[#7FA8D9]">{board.done}/{board.total}</span>
          <button type="button" onClick={runAi} disabled={busy} className="inline-flex items-center gap-1 text-[11.5px] text-[#185FA5] hover:text-[#0C447C] disabled:opacity-50">
            <Wand2 className="w-3.5 h-3.5" />{busy ? '生成中…' : 'AI進捗要約'}
          </button>
        </div>
        <p className={`text-[13.5px] leading-relaxed whitespace-pre-wrap mb-2.5 ${aiOverall ? 'text-blue-700 font-medium' : 'text-[#0C447C]'}`}>{aiOverall ?? board.ruleSummary}</p>
        <div className="h-1.5 rounded-full bg-[#D9E7F8] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${board.percent}%`, background: DONE }} />
        </div>
        {err && <p className="mt-1.5 text-[11.5px] text-red-600">{err}</p>}
      </div>

      {/* 工程グループ（1相続人調査→2財産調査→…）。少数案件は1列・多い案件は2列。 */}
      <div className="grid gap-2.5 items-start" style={{ gridTemplateColumns: gridCols }}>
        {board.koteiGroups.map((kg, ki) => {
          const leaves = kg.groups.flatMap(g => g.items)
          const aiLine = aiByKotei[kg.kotei]
          return (
            <div key={ki} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* 工程ヘッダー：番号バッジ＋名称＋n/m＋セグメントバー */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-gray-50 border-b border-gray-100">
                {kg.number != null
                  ? <span className="w-[18px] h-[18px] rounded-[5px] text-[11px] font-medium inline-flex items-center justify-center flex-none" style={{ background: kg.color.bg, color: kg.color.text }}>{kg.number}</span>
                  : <span className="w-1.5 h-1.5 rounded-[2px] flex-none" style={{ background: kg.color.text }} />}
                <span className="text-[12.5px] font-medium" style={{ color: kg.color.text }}>{kg.kotei}</span>
                <span className="text-[11px] text-gray-400">{kg.done}/{kg.total}</span>
                <div className="ml-auto flex gap-0.5 w-[52px]">
                  {leaves.map((i, ii) => <span key={ii} className="flex-1 h-[3px] rounded-full" style={{ background: i.status === 'done' ? DONE : i.status === 'prog' ? PROG : '#E4E1D9' }} />)}
                </div>
              </div>

              {/* 工程のAIひとこと（生成後のみ） */}
              {aiLine && (
                <div className="flex gap-1.5 px-3.5 py-2 bg-blue-50/60 border-b border-gray-100">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500 flex-none mt-[1px]" strokeWidth={2} />
                  <span className="text-[11.5px] text-blue-700 font-medium leading-relaxed">{aiLine}</span>
                </div>
              )}

              {/* 業務行。金融資産・解約は業務見出し＋対象別サブ行、それ以外は1行。 */}
              {kg.groups.map((g, gi) => (
                <div key={gi} className={gi > 0 ? 'border-t border-gray-100' : ''}>
                  {g.count && (
                    <div className="flex items-center gap-2 px-3.5 pt-2 pb-0.5">
                      <span className="text-[12px] font-medium text-gray-600">{g.title}</span>
                      <span className="text-[10.5px] text-gray-400">{g.count}</span>
                    </div>
                  )}
                  {g.items.map((it, ii) => (
                    <div key={ii} className={`flex items-center gap-2 px-3.5 ${g.count ? 'py-1' : 'py-1.5'} ${ii > 0 ? 'border-t border-gray-50' : ''}`}>
                      <Dot st={it.status} />
                      <span className={`text-[13px] ${it.status === 'todo' ? 'text-gray-400' : 'text-gray-800'}`}>{it.name}</span>
                      {it.note && <span className="text-[11.5px] text-gray-400 truncate">{it.note}</span>}
                      <span className="ml-auto text-[10.5px] flex-none" style={{ color: LBL_COLOR[it.status] }}>{STATUS_LABEL[it.status]}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      </div>
      )}
    </div>
  )
}

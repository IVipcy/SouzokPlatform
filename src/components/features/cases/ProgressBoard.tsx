'use client'

// 管理担当向け 案件進捗ボード。業務グループ＋対象別サブ項目。上部にルールベース即時サマリー＋「AI進捗要約」(Sonnet 5)。
// サブタブ：進捗サマリー（このボード）／案件報告（確認依頼の履歴）／報連相・メモ。
import { useState, type ReactNode } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { SubTabs } from '@/components/ui/SubTabs'
import HistoryTab from './HistoryTab'
import ComplaintsTab from './ComplaintsTab'
import ProgressDetail from './ProgressDetail'
import type { ProgressDetail as Detail } from '@/lib/caseProgressDetail'
import type { ProgressBoard as Board, ItemStatus } from '@/lib/caseProgressBoard'
import type { CaseRow, TaskRow, MemberRow } from '@/types'

// AIへ渡す進捗の言い換え（画面表示はProgressDetail側の「済/待ち/対応中」を使う）
const STATUS_LABEL: Record<ItemStatus, string> = { done: '完了', prog: '進行中', todo: '未着手' }
const DONE = '#1D9E75'

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


type ProgressBoardProps = {
  board: Board
  /** 実務タブの入力から作る明細（誰の戸籍・どの銀行・どの市区町村が今どこまで進んだか） */
  detail: Detail
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
  /** 承認通知(approve=1)から遷移した時：自分が承認すべき依頼中の報告を自動オープン */
  autoOpenPending?: boolean
}

export default function ProgressBoard({ board, detail, dealName, caseData, tasks, allMembers, currentMemberId, salesMemberId = null, canRequestReview = false, renderOfficeProgress, initialSub, openReportId, autoOpenPending = false }: ProgressBoardProps) {
  const [sub, setSub] = useState<'board' | 'office' | 'report' | 'memo' | 'complaint'>(initialSub ?? 'board')
  const [aiOverall, setAiOverall] = useState<string | null>(null)
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
          autoOpenPending={autoOpenPending}
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

      {/* 明細：各実務タブのTOPを見に行かないと分からなかった中身をここに出す。 */}
      <ProgressDetail detail={detail} />

      </div>
      )}
    </div>
  )
}

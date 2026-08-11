'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Briefcase, Trash2 } from 'lucide-react'
import { ALERT_CHIP_CLS, type ManagerAlertChip } from '@/lib/managerAlerts'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { cascadeDeleteCase } from '@/lib/caseDelete'
import { getCaseStatusLabel } from '@/lib/constants'
import { bizDaysOverdue } from '@/lib/overdue'

type CaseFlag = 'purple' | 'red' | 'yellow' | 'blue' | null

export type MyCaseRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  deceased_name: string | null
  expected_completion_date: string | null
  completion_date: string | null
  has_complaint?: boolean | null
  last_opened_at?: string | null
  created_at?: string | null
  client_name?: string | null
  sales_name?: string | null
  manager_name?: string | null
  /** 担当チーム名（受注担当の所属チーム。検索用） */
  team_name?: string | null
  /** 受注内容（手続区分） */
  procedure_type?: string[] | null
  /** オーダーシート完成日時（作成済判定） */
  order_sheet_completed_at?: string | null
  /** 進捗: 次の未完了タスク + 完了/総数 */
  nextTaskId?: string | null
  nextTaskTitle?: string | null
  progressDone?: number
  progressTotal?: number
  /** task_kind別 進捗（事務管理タスク/受注管理タスク） */
  progressCaseDone?: number
  progressCaseTotal?: number
  progressSystemDone?: number
  progressSystemTotal?: number
  /** task_kind別 次の未完了タスク（遅延なし時に表示する1件） */
  nextCaseTaskId?: string | null
  nextCaseTaskTitle?: string | null
  nextSystemTaskId?: string | null
  nextSystemTaskTitle?: string | null
  /** task_kind別 遅延中の未完了タスク（あれば全件表示）。severity=null は 1〜4営業日超過(軽微) */
  overdueCaseTasks?: Array<{ id: string; title: string; due_date: string; over: number; severity: 'kakunin' | 'chui' | null }>
  overdueSystemTasks?: Array<{ id: string; title: string; due_date: string; over: number; severity: 'kakunin' | 'chui' | null }>
  /** 期限超過タスクあり(進捗バーを赤で表示) */
  hasOverdueTask?: boolean
  /** 案件再オープン回数 (progress_reports.kind='case_reopen' の件数)。>0 かつ status=対応中/業務完了申請中 なら「再オープン中」バッジ */
  reopenCount?: number
  /** 週次報告状況 */
  weeklyStatus?: '未対応' | '依頼中' | '確認済'
  /** 直近お客様報告 */
  lastCommDate?: string | null
  lastCommDetail?: string | null
  /** 最終更新日 */
  updated_at?: string | null
  /** 管理担当向けアラート（色＝重大度・クリックで該当箇所へ） */
  alertChips?: ManagerAlertChip[]
  /** 進捗管理ダッシュボード経由で計算済の場合 */
  flag?: CaseFlag
}

const WEEKLY_BADGE: Record<string, string> = {
  '未対応': 'bg-gray-100 text-gray-600 border-gray-200',
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

type Props = {
  memberId: string
  cases: MyCaseRow[]
  /** ヘッダーや「↗ 全件見る」など最小表示にする */
  compact?: boolean
  /** 案件管理ページ用。チェックボックス選択・一括削除を有効化 */
  selectable?: boolean
  /** 完了案件ビュー: 鮮度フラグの代わりに「完了」バッジを出し、フラグなし行も表示する */
  showCompleted?: boolean
  /** ステータス絞り込みタブ（作業進行中 / 業務完了 / 納品完了）を表示する。マイページの管理案件一覧向け */
  withStatusFilter?: boolean
}

const FLAG_LABEL: Record<NonNullable<CaseFlag>, string> = {
  purple: '紫',
  red:    '赤',
  yellow: '黄',
  blue:   '青',
}
const FLAG_BG: Record<NonNullable<CaseFlag>, string> = {
  purple: 'bg-purple-600 text-white',
  red:    'bg-red-500 text-white',
  yellow: 'bg-yellow-400 text-gray-900',
  blue:   'bg-blue-600 text-white',
}

const FLAG_RANK: Record<NonNullable<CaseFlag>, number> = {
  purple: 0, red: 1, yellow: 2, blue: 3,
}

// 鮮度フラグの付与対象 = 稼働中（対応中・業務完了申請中）。完了・相談案件・個別管理案件にはフラグを出さない。
// ※ 一覧の行の絞り込みは呼び出し側 or 下記ステータスタブで実施。ここはフラグ判定スコープのみ。
const MANAGEMENT_ACTIVE = new Set(['対応中', '業務完了申請中'])

// ステータス絞り込みタブの定義（相談案件一覧と同じ 稼働中/業務完了/納品完了 の分類）
const STATUS_TABS = [
  { key: 'active', label: '作業進行中', match: (s: string) => s === '対応中' || s === '業務完了申請中' },
  { key: 'workDone', label: '業務完了', match: (s: string) => s === '完了' },
  { key: 'delivered', label: '納品完了', match: (s: string) => s === '納品完了' },
] as const
type StatusTabKey = typeof STATUS_TABS[number]['key']

// 今日と当月。レンダー中に new Date() を直接書くと React コンパイラに止められるので関数に包む。
const todayYmd = () => new Date().toLocaleDateString('sv-SE')
const thisMonthYm = () => todayYmd().slice(0, 7)

// 完了予定日までの残り日数（暦日）。過ぎていればマイナス。
// タスクの「残り」は営業日で数えているが、完了予定日はお客様に伝えた期日で
// 数か月先まであるため、暦日のほうが実感に合う。
const daysLeft = (due: string, today: string) =>
  Math.round((new Date(due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)

// 「残り」セル。超過は赤、近いものは琥珀。完了した案件は色を付けない。
function RemainCell({ due, today, muted }: { due: string | null; today: string; muted: boolean }) {
  if (!due) return <span className="text-gray-300">—</span>
  const n = daysLeft(due, today)
  if (muted) return <span className="text-[12px] text-gray-400">{n < 0 ? `${-n}日超過` : '—'}</span>
  if (n < 0) {
    return (
      <span className="inline-flex items-baseline gap-0.5 text-red-600 whitespace-nowrap">
        <span className="text-[16px] font-bold leading-none tabular-nums">{-n}</span>
        <span className="text-[10.5px] font-bold">日超過</span>
      </span>
    )
  }
  if (n === 0) return <span className="text-[14px] font-bold text-amber-700 leading-none">本日</span>
  return (
    <span className={`inline-flex items-baseline gap-0.5 whitespace-nowrap ${n <= 14 ? 'text-amber-700' : 'text-gray-700'}`}>
      <span className="text-[16px] font-bold leading-none tabular-nums">{n}</span>
      <span className="text-[10.5px] font-semibold">日</span>
    </span>
  )
}

// 鮮度フラグ: 紫=クレーム / 赤・黄・青=最終接触(案件を最後に開いた日)からの未対応 営業日数
// 青: <5営業日 / 黄: 5営業日〜 / 赤: 10営業日〜（案件色をアラート深刻度に合わせた統一ルール）

function computeFlagSimple(c: MyCaseRow): CaseFlag {
  if (!MANAGEMENT_ACTIVE.has(c.status)) return null
  if (c.has_complaint) return 'purple'
  const ref = (c.last_opened_at ?? c.created_at ?? '')?.slice(0, 10)
  if (!ref) return 'blue'
  const d = new Date()
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const biz = bizDaysOverdue(ref, ymd)
  if (biz >= 10) return 'red'
  if (biz >= 5) return 'yellow'
  return 'blue'
}

/**
 * マイページの担当案件タブ
 * 進捗管理ダッシュボードと同じテーブル形式:
 *   フラグ / 案件管理番号 / 案件名 / 担当者(受注/管理 別列) / 完了予定日 / 依頼者名
 */
export default function MyPageCasesTab({ memberId: _memberId, cases, compact = false, selectable = false, showCompleted = false, withStatusFilter = false }: Props) {
  void _memberId
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [statusTab, setStatusTab] = useState<StatusTabKey>('active')
  // 当月に業務完了予定の案件だけに絞る（作業進行中のときだけ意味がある）
  const [thisMonthOnly, setThisMonthOnly] = useState(false)
  const today = todayYmd()
  const thisMonth = thisMonthYm()

  const rows = cases.map(c => ({
    ...c,
    flag: c.flag ?? computeFlagSimple(c),
  }))

  // 各ステータスタブの該当件数（バッジ表示用）
  const tabCounts = withStatusFilter
    ? Object.fromEntries(STATUS_TABS.map(t => [t.key, rows.filter(r => t.match(r.status)).length])) as Record<StatusTabKey, number>
    : ({} as Record<StatusTabKey, number>)

  // 完了系ビューか（フラグなし行も表示・案件番号順）: ステータスフィルタ時は active 以外、それ以外は showCompleted
  const isCompletedView = withStatusFilter ? statusTab !== 'active' : showCompleted

  // 行の絞り込み。ステータスフィルタ時は選択タブのステータス群で、そうでなければ従来どおり。
  const activeTabDef = STATUS_TABS.find(t => t.key === statusTab)!
  const isThisMonth = (r: MyCaseRow) => (r.expected_completion_date ?? '').startsWith(thisMonth)
  const monthFilterOn = withStatusFilter && statusTab === 'active' && thisMonthOnly
  const thisMonthCount = withStatusFilter
    ? rows.filter(r => STATUS_TABS[0].match(r.status) && isThisMonth(r)).length
    : 0
  const visibleRows = withStatusFilter
    ? rows.filter(r => activeTabDef.match(r.status) && (!monthFilterOn || isThisMonth(r)))
    : (showCompleted ? [...rows] : rows.filter(r => r.flag !== null))
  // ソート: 完了系ビューは案件番号順、進行中はフラグ優先度 → 完了予定日昇順
  visibleRows.sort((a, b) => {
    if (isCompletedView) return a.case_number.localeCompare(b.case_number)
    const fa = FLAG_RANK[a.flag ?? 'blue']
    const fb = FLAG_RANK[b.flag ?? 'blue']
    if (fa !== fb) return fa - fb
    const ad = a.expected_completion_date ?? '9999-12-31'
    const bd = b.expected_completion_date ?? '9999-12-31'
    return ad.localeCompare(bd)
  })

  const visibleIds = visibleRows.map(r => r.id)
  const selectedVisible = visibleIds.filter(id => selected.has(id))
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someSelected = selectedVisible.length > 0 && !allSelected
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allSelected) visibleIds.forEach(id => next.delete(id)); else visibleIds.forEach(id => next.add(id))
    return next
  })
  // 削除は DeleteConfirmModal が削除中状態・エラー表示・クローズを管理。成功時のみトースト＋解除＋更新。
  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    const supabase = createClient()
    const count = selected.size
    for (const id of selected) await cascadeDeleteCase(supabase, id)
    showToast(`${count}件の案件を削除しました`, 'success')
    setSelected(new Set())
    router.refresh()
  }

  // ステータス絞り込みタブ（withStatusFilter 時のみ）
  const filterBar = withStatusFilter ? (
    <div className="flex items-center gap-1.5 mb-3">
      {STATUS_TABS.map(t => {
        const on = statusTab === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => { setStatusTab(t.key); setSelected(new Set()) }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
          >
            {t.label}
            <span className={`inline-flex items-center justify-center min-w-[20px] px-1 h-5 rounded-full text-[11px] font-bold ${on ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>{tabCounts[t.key] ?? 0}</span>
          </button>
        )
      })}
      {/* 当月業完予定。今月中に終わらせる約束の案件だけを見たいとき用。 */}
      {statusTab === 'active' && (
        <>
          <span className="w-px h-6 bg-gray-200 mx-0.5" />
          <button
            type="button"
            onClick={() => { setThisMonthOnly(v => !v); setSelected(new Set()) }}
            title={`完了予定日が ${thisMonth.replace('-', '年')}月 の案件だけに絞る`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${
              thisMonthOnly ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}
          >
            当月業完予定
            <span className={`inline-flex items-center justify-center min-w-[20px] px-1 h-5 rounded-full text-[11px] font-bold ${
              thisMonthOnly ? 'bg-amber-200/70 text-amber-900' : 'bg-gray-100 text-gray-500'}`}>{thisMonthCount}</span>
          </button>
        </>
      )}
    </div>
  ) : null

  const emptyLabel = withStatusFilter
    ? `${activeTabDef.label}${monthFilterOn ? '（当月業完予定）' : ''}の案件はありません`
    : (showCompleted ? '業務完了・納品完了 案件はありません' : '作業進行中の案件はありません')

  if (visibleRows.length === 0) {
    return (
      <div>
        {filterBar}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-[13px] text-gray-400">
          {emptyLabel}
        </div>
      </div>
    )
  }

  return (
    <div>
      {filterBar}
      {selectable && selected.size > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
          <span className="text-[12px] font-semibold text-gray-700">{selected.size}件選択中</span>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
            選択を削除
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-gray-400 hover:text-gray-600 px-1">解除</button>
        </div>
      )}
      <div className={`bg-white rounded-xl overflow-x-auto ${compact ? '' : 'border border-gray-200 shadow-sm'}`}>
      <table className="w-full text-[13px] table-auto">
        <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 uppercase tracking-wider">
          <tr>
            {selectable && (
              <th className="px-3 py-2 text-center font-bold w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected }}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                  title="表示中をすべて選択"
                />
              </th>
            )}
            <th className="px-3 py-2 text-center font-bold whitespace-nowrap">フラグ</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件管理番号</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件名</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注担当</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">管理担当</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">オーダーシート</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注内容</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap" title="完了予定日までの残り日数（暦日）">残り</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">完了予定日</th>
            <th className="px-3 py-2 text-center font-bold whitespace-nowrap">週次報告状況</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">直近お客様報告日</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">やり取り詳細</th>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">最終更新日</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibleRows.map(c => {
            const weekly = c.weeklyStatus ?? '未対応'
            const isSelected = selected.has(c.id)
            return (
            <tr key={c.id} className={`hover:bg-gray-50/60 ${isSelected ? 'bg-brand-50/50' : ''}`}>
              {selectable && (
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(c.id)}
                    className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                  />
                </td>
              )}
              <td className="px-3 py-2.5 text-center">
                {c.flag ? (
                  <Link href={`/cases/${c.id}`} title="案件詳細を開く" className={`inline-flex items-center justify-center w-11 py-0.5 rounded text-[12px] font-bold hover:brightness-95 transition ${FLAG_BG[c.flag]}`}>
                    {FLAG_LABEL[c.flag]}
                  </Link>
                ) : (
                  <Link href={`/cases/${c.id}`} title="案件詳細を開く" className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-500 border border-gray-200 hover:brightness-95 whitespace-nowrap">
                    {getCaseStatusLabel(c.status)}
                  </Link>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                <Link href={`/cases/${c.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">{c.case_number}</Link>
              </td>
              <td className="px-3 py-2.5 min-w-[160px]">
                <div className="flex items-center gap-1.5">
                  <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[240px]">
                    {c.deal_name}
                  </Link>
                  {(c.reopenCount ?? 0) > 0 && (c.status === '対応中' || c.status === '業務完了申請中') && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 whitespace-nowrap" title={`業務完了/納品完了後に再オープンされた案件（${c.reopenCount}回）`}>
                      再オープン中{(c.reopenCount ?? 0) > 1 ? ` (${c.reopenCount})` : ''}
                    </span>
                  )}
                </div>
                {c.alertChips && c.alertChips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.alertChips.map(a => (
                      <Link
                        key={a.key}
                        href={a.href}
                        title="クリックで該当箇所へ"
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border transition ${ALERT_CHIP_CLS[a.severity]}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{a.label}
                      </Link>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{c.sales_name || <span className="text-gray-300">—</span>}</td>
              {/* 管理担当 */}
              <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{c.manager_name || <span className="text-gray-300">—</span>}</td>
              {/* オーダーシート作成（未作成=— / 作成済=タブへのリンク） */}
              <td className="px-3 py-2.5">
                {c.order_sheet_completed_at ? (
                  <Link href={`/cases/${c.id}?tab=orderSheet`} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">作成済</Link>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              {/* 受注内容（手続区分） */}
              <td className="px-3 py-2.5">
                {c.procedure_type && c.procedure_type.filter(Boolean).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.procedure_type.filter(Boolean).map(p => (
                      <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap">{p}</span>
                    ))}
                  </div>
                ) : <span className="text-gray-300">—</span>}
              </td>
              {/* 残り（完了予定日までの暦日）。完了済みの案件は色を付けない。 */}
              <td className="px-3 py-2.5 whitespace-nowrap">
                <RemainCell due={c.expected_completion_date} today={today} muted={isCompletedView} />
              </td>
              {/* 完了予定日 */}
              <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600 whitespace-nowrap">{c.expected_completion_date ?? <span className="text-gray-300">—</span>}</td>
              {/* 週次報告状況 */}
              <td className="px-3 py-2.5 text-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${WEEKLY_BADGE[weekly]}`}>{weekly}</span>
              </td>
              {/* 直近お客様報告日 */}
              <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600 whitespace-nowrap">{c.lastCommDate ?? <span className="text-gray-300">—</span>}</td>
              {/* やり取り詳細 */}
              <td className="px-3 py-2.5 text-[12px] text-gray-600 min-w-[200px] max-w-[320px]">
                {c.lastCommDetail ? (
                  <span className="line-clamp-2 whitespace-pre-line" title={c.lastCommDetail}>{c.lastCommDetail}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              {/* 最終更新日 */}
              <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500 whitespace-nowrap">
                {c.updated_at ? new Date(c.updated_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : <span className="text-gray-300">—</span>}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
      {compact && (
        <div className="px-4 py-2 text-center bg-gray-50/40 border-t border-gray-100">
          <Briefcase className="w-3 h-3 inline-block mr-1 text-gray-400" />
          <span className="text-[11px] text-gray-500">担当案件 {visibleRows.length} 件</span>
        </div>
      )}
      </div>

      {selectable && (
        <DeleteConfirmModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="案件の一括削除"
          message={`選択した ${selected.size} 件の案件を削除します。関連するタスク・担当者・書類・請求書・入金も全て削除され、取り消せません。本当に削除しますか？`}
          onConfirm={handleDeleteSelected}
        />
      )}
    </div>
  )
}

// 進捗列に表示するタスク行群。
// 遅延タスクがあれば全件を赤太字で列挙（古い順・severity別配色）、なければ「次の1件」を通常青で1件だけ。

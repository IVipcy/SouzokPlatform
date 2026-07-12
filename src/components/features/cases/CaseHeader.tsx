'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Inbox, FolderOpen, FilePlus, ChevronDown } from 'lucide-react'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import { getCaseCategory, getCaseStatusLabel, CASE_STATUSES } from '@/lib/constants'
import { isMinimalMode } from '@/lib/featureMode'
import { MilestoneAxis, type TimelineStatusEvent } from './CaseTimeline'
import type { TabKey } from './CaseTabs'
import type { CaseRow, CaseReferralRow, TaskRow } from '@/types'

// 案件分類（相談案件 / 個別管理案件 / 管理案件）のラベルと色
const CATEGORY_STYLE: Record<'consult' | 'referral' | 'management', { label: string; cls: string }> = {
  consult:    { label: '相談案件', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  referral:   { label: '個別案件', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  management: { label: '管理案件', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
}

type Props = {
  caseData: CaseRow
  // 依頼者との最新やり取り日（YYYY-MM-DD）。null=履歴なし。
  latestCommunicationDate: string | null
  // 案件の有効アラート（右上に集約表示）
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
  // マイルストーン軸用
  tasks: TaskRow[]
  statusHistory?: TimelineStatusEvent[]
  // どのタブからでもステータス変更できるよう、ヘッダーに常時表示する
  selectableStatuses?: string[]
  onStatusChange?: (status: string) => void
  // 他事業者紹介（税理士の依頼内容から相続税申告あり/なしを判定）
  referrals?: CaseReferralRow[]
  // 相続税申告フラグのクリックでオーダーシートの他事業者紹介セクションへ移動
  onJumpToReferral?: () => void
  // ヘッダー右上のアクションボタン（到着物・案件フォルダ・書類作成）
  // 案件状態でこれらタブが表示可能なときだけ true にする（タブ表示制御と連動）。
  showReceiptsAction?: boolean
  /** 到着物の未対応件数（タスク紐づけ待ち）。バッジ表示に使う。 */
  receiptCount?: number
  showDocsAction?: boolean
  showDocumentCreateAction?: boolean
  docCount?: number
  /** docs/documentCreate がナビ強調対象なら、それぞれのボタンに●を出す */
  highlightTabs?: TabKey[]
  /** ボタンクリックで該当タブへ遷移する */
  onActivateTab?: (tab: TabKey) => void
}

const FOLLOWUP_STATUSES = new Set(['受注', '対応中'])

function needsFollowup(status: string, latestDate: string | null): boolean {
  if (!FOLLOWUP_STATUSES.has(status)) return false
  if (!latestDate) return true
  const last = new Date(latestDate)
  const today = new Date()
  const diffDays = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 14
}

export default function CaseHeader({ caseData, latestCommunicationDate, caseAlerts, tasks, statusHistory, selectableStatuses, onStatusChange, onJumpToReferral, showReceiptsAction, receiptCount = 0, showDocsAction, showDocumentCreateAction, docCount = 0, highlightTabs, onActivateTab }: Props) {
  const statusColor = CASE_STATUSES.find(s => s.key === caseData.status)?.color ?? '#6B7280'
  const taxFiling = caseData.tax_filing_required === '要'
  const followupNeeded = needsFollowup(caseData.status, latestCommunicationDate)
  const procedures = (caseData.procedure_type ?? []).filter(Boolean)
  const category = getCaseCategory(caseData.status)
  const categoryStyle = category ? CATEGORY_STYLE[category] : null

  // ヘッダー付帯情報（手続き区分・相続税申告・被相続人・マイルストーン軸）の折りたたみ。
  // 既定は全表示。ユーザーが任意で畳める（PPTのリボン折りたたみのように、設定は端末に記憶）。
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setHeaderCollapsed(localStorage.getItem('caseHeaderCollapsed') === '1') } catch { /* noop */ }
  }, [])
  const toggleHeaderCollapsed = () => setHeaderCollapsed(c => {
    const next = !c
    try { localStorage.setItem('caseHeaderCollapsed', next ? '1' : '0') } catch { /* noop */ }
    return next
  })

  // アラートのジャンプ先（カテゴリ→タブ）。クリックで該当タブへ飛ばす。
  const alertJump = (label: string): TabKey | null => {
    if (label === '週次報告の漏れ') return 'basicInfo'                 // 進捗報告(HistoryTab)
    if (label === '要進捗連絡') return 'clientInfo'                    // 依頼者・やり取り
    if (label.startsWith('タスク期限超過')) return 'tasks'
    if (label === 'クレーム') return 'basicInfo'
    if (label === 'アサイン未完了') return 'ownerSales'
    if (label === '前受金 未入金') return 'contract'
    if (label === '完了予定日 超過') return 'meeting'                  // 管理情報セクションへ
    if (label === '面談メモ未記載') return 'meeting'
    if (label === '回答予定日 超過' || label === '回答予定日 間近') return 'meeting'
    return null
  }
  const alertChips: { dot: string; label: string; tab: TabKey | null }[] = [
    ...(caseAlerts ?? []).map(a => ({ dot: ALERT_SEVERITY_STYLE[a.severity].dot, label: a.category, tab: alertJump(a.category) })),
    ...(followupNeeded ? [{ dot: 'bg-amber-500', label: '要進捗連絡', tab: alertJump('要進捗連絡') }] : []),
  ]

  return (
    <div className="mb-5">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-3">
        <Link href="/cases" className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
          ← 案件一覧
        </Link>
        <span className="text-gray-300">|</span>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span>案件一覧</span>
          <span className="text-gray-300">›</span>
          <span className="text-gray-600 font-medium">{caseData.case_number} · {caseData.deal_name}</span>
        </div>
      </div>

      {/* Case header card（案件情報 ＋ マイルストーン軸 ＋ アラートを1枠に集約・コンパクト） */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
        <div className="flex items-start gap-5">
          {/* 左: 案件の識別情報 */}
          <div className="flex-shrink-0 min-w-0" style={{ maxWidth: 300 }}>
            {/* 案件番号＋案件分類フラグ（独立行・控えめ） */}
            <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="inline-block text-[11px] font-mono tracking-wide text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                {caseData.case_number}
              </span>
              {categoryStyle && (
                <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${categoryStyle.cls}`}>
                  {categoryStyle.label}
                </span>
              )}
              {/* 案件ステータス（どのタブからでも変更可能） */}
              {selectableStatuses && onStatusChange && (
                <div className="relative inline-flex items-center">
                  <span className="absolute left-2 w-1.5 h-1.5 rounded-full pointer-events-none" style={{ background: statusColor }} />
                  <select
                    value={caseData.status}
                    onChange={e => onStatusChange(e.target.value)}
                    title="案件ステータスを変更"
                    className="appearance-none text-[11px] font-bold pl-4 pr-6 py-0.5 rounded border border-gray-200 bg-white text-gray-700 cursor-pointer outline-none hover:border-brand-400 focus:border-brand-500"
                  >
                    {selectableStatuses.map(s => <option key={s} value={s}>{getCaseStatusLabel(s)}</option>)}
                  </select>
                  <span className="absolute right-2 text-[8px] text-gray-400 pointer-events-none">▼</span>
                </div>
              )}
              {/* 受注の獲得区分バッジ（即受注 / 面談なし受注）。旧データは instant_order を即受注扱い */}
              {caseData.status === '受注' && (caseData.order_win_type || caseData.instant_order) && (() => {
                const winLabel = caseData.order_win_type || (caseData.instant_order ? '即受注' : '')
                const cls = winLabel === '面談なし受注'
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  : 'bg-green-50 text-green-700 border-green-200'
                return (
                  <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${cls}`} title={`受注の獲得区分：${winLabel}`}>
                    {winLabel}
                  </span>
                )
              })()}
            </div>
            {/* 案件名 + クレームフラグ ＋ 折りたたみトグル */}
            <h1 className="flex items-center gap-2 text-[18px] font-extrabold text-gray-900 tracking-tight leading-snug">
              <span className="truncate">{caseData.deal_name}</span>
              {caseData.has_complaint && (
                <span className="flex-shrink-0 inline-flex w-4 h-4 rounded-full bg-purple-600 items-center justify-center shadow-[0_0_0_2px_rgba(147,51,234,0.2)]" title="クレーム案件（紫フラグ）">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </span>
              )}
              <button
                type="button"
                onClick={toggleHeaderCollapsed}
                title={headerCollapsed ? '案件情報を表示' : '案件情報を折りたたむ'}
                aria-label={headerCollapsed ? '案件情報を表示' : '案件情報を折りたたむ'}
                className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${headerCollapsed ? '' : 'rotate-180'}`} strokeWidth={2.25} />
              </button>
            </h1>
            {!headerCollapsed && (
              <>
                {/* 手続き区分 */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] font-medium text-gray-400 tracking-wide">手続き区分</span>
                  {procedures.length > 0 ? (
                    procedures.map(p => (
                      <span key={p} className="inline-block text-[11px] leading-none px-2 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-100 font-medium">{p}</span>
                    ))
                  ) : <span className="text-[11px] text-gray-300">未設定</span>}
                </div>
                {/* 相続税申告フラグ（他事業者紹介の税理士・依頼内容から自動判定）。クリックで該当セクションへ。ミニマム時は非表示 */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5" style={{ display: isMinimalMode() ? 'none' : undefined }}>
                  <span className="text-[10px] font-medium text-gray-400 tracking-wide">相続税申告</span>
                  <button
                    type="button"
                    onClick={onJumpToReferral}
                    title="他事業者紹介（税理士）へ移動"
                    className={`inline-flex items-center gap-1 text-[11px] leading-none px-2 py-1 rounded-md font-semibold transition-colors ${
                      taxFiling
                        ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                        : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${taxFiling ? 'bg-amber-500' : 'bg-gray-400'}`} />
                    {taxFiling ? 'あり' : 'なし'}
                  </button>
                </div>
                {caseData.deceased_name && (
                  <p className="text-[12px] text-gray-500 mt-2">
                    被相続人：{caseData.deceased_name}{caseData.date_of_death && `（${caseData.date_of_death} 死亡）`}
                  </p>
                )}
              </>
            )}
          </div>

          {/* 中央: コンパクトなマイルストーン軸（折りたたみ時は非表示・右のボタンは維持） */}
          <div className="flex-1 min-w-0 self-center">
            {!headerCollapsed && <MilestoneAxis caseData={caseData} tasks={tasks} statusHistory={statusHistory} compact />}
          </div>

          {/* 右上: アラート集約＋アクションボタン（到着物・書類作成） */}
          <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap justify-end" style={{ maxWidth: '45%' }}>
            {alertChips.map((c, i) => (
              c.tab && onActivateTab ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onActivateTab(c.tab!)}
                  title={`「${c.label}」の出元へ移動`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-[0_1px_1px_rgba(0,0,0,0.03)] hover:bg-brand-50 hover:border-brand-200 hover:text-brand-800 transition-colors cursor-pointer"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {c.label}
                </button>
              ) : (
                <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {c.label}
                </span>
              )
            ))}

            {(showReceiptsAction || showDocsAction || showDocumentCreateAction) && (
              <>
                {alertChips.length > 0 && (
                  <span className="w-px h-5 bg-gray-200 mx-0.5" aria-hidden="true" />
                )}
                {showReceiptsAction && (
                  <button
                    type="button"
                    onClick={() => onActivateTab?.('receipts')}
                    title="到着物（受信簿・受領台帳）を開く"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium bg-white border-[1.5px] border-brand-200 text-brand-800 hover:bg-brand-50 transition-colors"
                  >
                    <Inbox className="w-3.5 h-3.5" strokeWidth={2} />
                    到着物
                    {(highlightTabs ?? []).includes('receipts') && (
                      <span className="text-brand-600 font-bold text-[10px] leading-none">●</span>
                    )}
                    {receiptCount > 0 && (
                      <span className="bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-1.5 text-[11px] font-mono leading-tight" title="未対応（タスク紐づけ待ち）の到着物">{receiptCount}</span>
                    )}
                  </button>
                )}
                {showDocsAction && (
                  <button
                    type="button"
                    onClick={() => onActivateTab?.('docs')}
                    title="案件フォルダ（書類一式）を開く"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium bg-white border-[1.5px] border-brand-200 text-brand-800 hover:bg-brand-50 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" strokeWidth={2} />
                    案件フォルダ
                    {(highlightTabs ?? []).includes('docs') && (
                      <span className="text-brand-600 font-bold text-[10px] leading-none">●</span>
                    )}
                    <span className="bg-white text-brand-700 border border-brand-200 rounded-full px-1.5 text-[11px] font-mono leading-tight">{docCount}</span>
                  </button>
                )}
                {showDocumentCreateAction && (
                  <button
                    type="button"
                    onClick={() => onActivateTab?.('documentCreate')}
                    title="書類作成"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                  >
                    <FilePlus className="w-3.5 h-3.5" strokeWidth={2.25} />
                    書類作成
                    <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 管理情報フォームはタブ「案件情報」ドロップダウン先頭の「管理情報」項目から
            モーダルで開くため、ここからは撤去（CaseManagementInfoModalに切り出し）。 */}
      </div>
    </div>
  )
}

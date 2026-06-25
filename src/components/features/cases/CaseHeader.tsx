'use client'

import { useState } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { FieldGrid, Field, InlineEdit, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import { getCaseCategory, getCaseStatusLabel, CASE_STATUSES, LOCATIONS } from '@/lib/constants'
import { MilestoneAxis, type TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, TaskRow } from '@/types'

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
  // 基本情報（管理メタ情報）の編集用。渡すとヘッダーに「案件情報 ▾」が出る。
  patchCase?: (patch: Partial<CaseRow>) => Promise<void>
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

export default function CaseHeader({ caseData, latestCommunicationDate, caseAlerts, tasks, statusHistory, selectableStatuses, onStatusChange, patchCase }: Props) {
  const [detailOpen, setDetailOpen] = useState(false)
  const saveCaseField = async (field: string, value: unknown) => {
    if (patchCase) await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }
  const statusColor = CASE_STATUSES.find(s => s.key === caseData.status)?.color ?? '#6B7280'
  const difficultyColors: Record<string, string> = { '易': '#059669', '普': '#D97706', '難': '#DC2626' }
  const taxColors: Record<string, string> = { '要': '#DC2626', '不要': '#059669' }
  const showTaxBadge = caseData.tax_filing_required === '要' || caseData.tax_filing_required === '不要'
  const followupNeeded = needsFollowup(caseData.status, latestCommunicationDate)
  const procedures = (caseData.procedure_type ?? []).filter(Boolean)
  const category = getCaseCategory(caseData.status)
  const categoryStyle = category ? CATEGORY_STYLE[category] : null

  const alertChips: { dot: string; label: string }[] = [
    ...(caseAlerts ?? []).map(a => ({ dot: ALERT_SEVERITY_STYLE[a.severity].dot, label: a.category })),
    ...(followupNeeded ? [{ dot: 'bg-amber-500', label: '要進捗連絡' }] : []),
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
            </div>
            {/* 案件名 + クレームフラグ */}
            <h1 className="flex items-center gap-2 text-[18px] font-extrabold text-gray-900 tracking-tight leading-snug">
              <span className="truncate">{caseData.deal_name}</span>
              {caseData.has_complaint && (
                <span className="flex-shrink-0 inline-flex w-4 h-4 rounded-full bg-purple-600 items-center justify-center shadow-[0_0_0_2px_rgba(147,51,234,0.2)]" title="クレーム案件（紫フラグ）">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </span>
              )}
            </h1>
            {/* 手続き区分 */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[10px] font-medium text-gray-400 tracking-wide">手続き区分</span>
              {procedures.length > 0 ? (
                procedures.map(p => (
                  <span key={p} className="inline-block text-[11px] leading-none px-2 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-100 font-medium">{p}</span>
                ))
              ) : <span className="text-[11px] text-gray-300">未設定</span>}
            </div>
            {caseData.deceased_name && (
              <p className="text-[12px] text-gray-500 mt-2">
                被相続人：{caseData.deceased_name}{caseData.date_of_death && `（${caseData.date_of_death} 死亡）`}
              </p>
            )}
          </div>

          {/* 中央: コンパクトなマイルストーン軸 */}
          <div className="flex-1 min-w-0 self-center">
            <MilestoneAxis caseData={caseData} tasks={tasks} statusHistory={statusHistory} compact />
          </div>

          {/* 右上: アラート集約 */}
          <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap justify-end" style={{ maxWidth: '30%' }}>
            {alertChips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {c.label}
              </span>
            ))}
            {caseData.difficulty && (
              <Badge label={caseData.difficulty} color={difficultyColors[caseData.difficulty] ?? '#6B7280'} variant="solid" />
            )}
            {showTaxBadge && caseData.tax_filing_required && (
              <Badge label={`相続税 ${caseData.tax_filing_required}`} color={taxColors[caseData.tax_filing_required] ?? '#6B7280'} />
            )}
          </div>
        </div>

        {/* 案件情報（基本情報＝管理メタ。既定は閉じる。クリックで展開） */}
        {patchCase && (
          <div className="mt-2.5 pt-2.5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setDetailOpen(o => !o)}
              className="text-[12px] font-semibold text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
            >
              案件情報 <span className="text-[10px]">{detailOpen ? '▴' : '▾'}</span>
            </button>
            {detailOpen && (
              <div className="mt-1.5">
                <FieldGrid>
                  <InlineEdit label="LP案件管理番号" value={caseData.lp_case_number} onSave={v => saveCaseField('lp_case_number', v)} />
                  <InlineSelect label="原本保管場所" value={caseData.location} options={[...LOCATIONS]} onSave={v => saveCaseField('location', v)} required />
                  <InlineDate label="受注日（受託日）" value={caseData.order_received_date} onSave={v => saveCaseField('order_received_date', v || null)} />
                  <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => saveCaseField('expected_completion_date', v || null)} />
                  <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
                </FieldGrid>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

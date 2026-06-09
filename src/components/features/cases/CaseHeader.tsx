'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import { MilestoneAxis, type TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, TaskRow } from '@/types'

type Props = {
  caseData: CaseRow
  // 依頼者との最新やり取り日（YYYY-MM-DD）。null=履歴なし。
  latestCommunicationDate: string | null
  // 案件の有効アラート（右上に集約表示）
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
  // マイルストーン軸用
  tasks: TaskRow[]
  statusHistory?: TimelineStatusEvent[]
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

export default function CaseHeader({ caseData, latestCommunicationDate, caseAlerts, tasks, statusHistory }: Props) {
  const difficultyColors: Record<string, string> = { '易': '#059669', '普': '#D97706', '難': '#DC2626' }
  const taxColors: Record<string, string> = { '要': '#DC2626', '不要': '#059669' }
  const showTaxBadge = caseData.tax_filing_required === '要' || caseData.tax_filing_required === '不要'
  const followupNeeded = needsFollowup(caseData.status, latestCommunicationDate)
  const procedures = (caseData.procedure_type ?? []).filter(Boolean)

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
            <span className="text-[12px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
              {caseData.case_number}
            </span>
            <h1 className="text-[19px] font-extrabold text-gray-900 tracking-tight mt-1 mb-1 inline-flex items-center gap-2 flex-wrap leading-tight">
              {caseData.deal_name}
              {caseData.has_complaint && (
                <span className="inline-flex w-4 h-4 rounded-full bg-purple-600 items-center justify-center shadow-[0_0_0_2px_rgba(147,51,234,0.2)]" title="クレーム案件（紫フラグ）">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </span>
              )}
            </h1>
            {/* 手続き区分 */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-gray-400">手続き区分</span>
              {procedures.length > 0 ? (
                procedures.map(p => (
                  <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                ))
              ) : <span className="text-[11px] text-gray-300">未設定</span>}
            </div>
            {caseData.deceased_name && (
              <p className="text-[12px] text-gray-500 mt-1">
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
      </div>
    </div>
  )
}

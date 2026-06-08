'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  // 依頼者との最新やり取り日（YYYY-MM-DD）。null=履歴なし。
  // ステータスが受注/対応中で、これが2週間以上前 or null のとき「要進捗連絡」を表示
  latestCommunicationDate: string | null
  // 案件の有効アラート（右上に集約表示）
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
}

const FOLLOWUP_STATUSES = new Set(['受注', '対応中'])

// 2週間以上経過しているか判定
function needsFollowup(status: string, latestDate: string | null): boolean {
  if (!FOLLOWUP_STATUSES.has(status)) return false
  if (!latestDate) return true // 履歴なし＝要進捗連絡
  const last = new Date(latestDate)
  const today = new Date()
  const diffDays = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 14
}

export default function CaseHeader({ caseData, latestCommunicationDate, caseAlerts }: Props) {
  const difficultyColors: Record<string, string> = { '易': '#059669', '普': '#D97706', '難': '#DC2626' }
  const taxColors: Record<string, string> = { '要': '#DC2626', '不要': '#059669' }
  const showTaxBadge = caseData.tax_filing_required === '要' || caseData.tax_filing_required === '不要'
  const followupNeeded = needsFollowup(caseData.status, latestCommunicationDate)

  // すべてのアラートを統一スタイルのチップに（severity は小さな色ドットで表現）
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

      {/* Case header card */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          {/* 左: 案件の識別情報 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                {caseData.case_number}
              </span>
            </div>
            <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight mb-0.5 inline-flex items-center gap-2 flex-wrap">
              {caseData.deal_name}
              {caseData.has_complaint && (
                <span
                  className="inline-flex w-5 h-5 rounded-full bg-purple-600 items-center justify-center shadow-[0_0_0_2px_rgba(147,51,234,0.2)]"
                  title="クレーム案件（紫フラグ）"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </span>
              )}
            </h1>
            {caseData.deceased_name && (
              <p className="text-[13px] text-gray-500">
                被相続人：{caseData.deceased_name}
                {caseData.date_of_death && `（${caseData.date_of_death} 死亡）`}
              </p>
            )}
          </div>

          {/* 右上: アラート＋情報バッジを集約（統一スタイルで洗練） */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end pt-0.5" style={{ maxWidth: '58%' }}>
            {alertChips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-[0_1px_1px_rgba(0,0,0,0.03)]"
              >
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

'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES, getCaseStatusLabel } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ALERT_SEVERITY_STYLE } from '@/lib/alerts'
import { AlertTriangle } from 'lucide-react'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  // 依頼者との最新やり取り日（YYYY-MM-DD）。null=履歴なし。
  // ステータスが受注/対応中で、これが2週間以上前 or null のとき「要進捗連絡」マークを点滅表示
  latestCommunicationDate: string | null
  // 案件の有効アラート（案件名の下に表示）
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
}

const FOLLOWUP_STATUSES = new Set(['受注', '対応中'])

// 2週間以上経過しているか判定
function needsFollowup(status: string, latestDate: string | null): boolean {
  if (!FOLLOWUP_STATUSES.has(status)) return false
  if (!latestDate) return true  // 履歴なし＝要進捗連絡
  const last = new Date(latestDate)
  const today = new Date()
  const diffDays = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 14
}

const STATUS_ORDER = ['架電案件化', '面談設定済', '検討中', '検討中（契約書待ち）', '受注', '対応中', '保留・長期', '完了', '失注', '紹介のみ']

// ステータス系の表示色をブランド単色に統一（per-status カラーは廃止）
const STATUS_ACTIVE_COLOR = '#0f487e'    // brand-600
const STATUS_PASSED_COLOR = '#7daac8'    // brand-300 — 経過済みは薄めで
const STATUS_FUTURE_COLOR = '#CBD5E1'    // gray-300

export default function CaseHeader({ caseData, latestCommunicationDate, caseAlerts }: Props) {
  const router = useRouter()
  const difficultyColors: Record<string, string> = { '易': '#059669', '普': '#D97706', '難': '#DC2626' }
  // 相続税バッジ: '要' / '不要' のみ表示。'確認中' は未確定なので非表示。
  const taxColors: Record<string, string> = { '要': '#DC2626', '不要': '#059669' }
  const showTaxBadge = caseData.tax_filing_required === '要' || caseData.tax_filing_required === '不要'
  const currentIdx = STATUS_ORDER.indexOf(caseData.status)
  const followupNeeded = needsFollowup(caseData.status, latestCommunicationDate)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const handleStatusChange = async (newStatus: string) => {
    setDropdownOpen(false)
    if (newStatus === caseData.status) return

    const supabase = createClient()
    await supabase.from('cases').update({ status: newStatus }).eq('id', caseData.id)
    router.refresh()
  }

  return (
    <div className="mb-5">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-3">
        <Link
          href="/cases"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
        >
          ← 案件一覧
        </Link>
        <span className="text-gray-300">|</span>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span>案件一覧</span>
          <span className="text-gray-300">›</span>
          <span className="text-gray-600 font-medium">{caseData.case_number} · {caseData.deal_name}</span>
        </div>
        <div className="ml-auto" />
      </div>

      {/* Case header card */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
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
              {/* 案件アラート（要対応） */}
              {caseAlerts && caseAlerts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" strokeWidth={2.25} />
                  {caseAlerts.map((a, i) => {
                    const sv = ALERT_SEVERITY_STYLE[a.severity]
                    return (
                      <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${sv.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sv.dot}`} />
                        {a.category}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* Status dropdown（ブランド単色） */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
                  {getCaseStatusLabel(caseData.status)}
                  <span className="text-[12px] opacity-70">▾</span>
                </button>

                {dropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] z-50 overflow-hidden">
                    {CASE_STATUSES.map(s => (
                      <button
                        key={s.key}
                        onClick={() => handleStatusChange(s.key)}
                        className={`w-full px-3.5 py-2 text-xs font-medium flex items-center hover:bg-gray-50 transition-colors ${
                          s.key === caseData.status ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {caseData.difficulty && (
                <Badge
                  label={caseData.difficulty}
                  color={difficultyColors[caseData.difficulty] ?? '#6B7280'}
                  variant="solid"
                />
              )}
              {showTaxBadge && caseData.tax_filing_required && (
                <Badge
                  label={`相続税 ${caseData.tax_filing_required}`}
                  color={taxColors[caseData.tax_filing_required] ?? '#6B7280'}
                />
              )}
              {followupNeeded && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-50 border-amber-300 text-amber-700 followup-blink"
                  title="受注/対応中ステータスで、お客様への最終進捗連絡から2週間以上経過しています"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  要進捗連絡
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status flow */}
        <div className="px-5 pb-4">
          <div className="flex items-start">
            {STATUS_ORDER.map((status, i) => {
              const isPassed = i < currentIdx
              const isActive = i === currentIdx
              const isLast = i === STATUS_ORDER.length - 1

              // 単色化: アクティブ=brand-600、経過=brand-300、未来=gray-300
              const dotColor = isActive
                ? STATUS_ACTIVE_COLOR
                : isPassed
                  ? STATUS_PASSED_COLOR
                  : STATUS_FUTURE_COLOR

              return (
                <div key={status} className="flex flex-col items-center gap-1 flex-1 relative">
                  <div
                    className={`rounded-full relative z-10 transition-all ${
                      isActive
                        ? 'w-3 h-3 shadow-[0_0_0_3px_rgba(15,72,126,0.2)]'
                        : 'w-2.5 h-2.5'
                    }`}
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className={`text-[12px] whitespace-nowrap text-center ${
                    isActive ? 'text-brand-700 font-semibold' : 'text-gray-400'
                  }`}>
                    {getCaseStatusLabel(status)}
                  </span>
                  {!isLast && (
                    <div
                      className="absolute top-[5px] left-[50%] right-[-50%] h-px z-0"
                      style={{ backgroundColor: isPassed ? STATUS_PASSED_COLOR : STATUS_FUTURE_COLOR }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

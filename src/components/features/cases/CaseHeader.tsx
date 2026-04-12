'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
}

const STATUS_ORDER = ['架電案件化', '面談設定済', '検討中', '受注', '対応中', '保留・長期', '完了', '失注']

export default function CaseHeader({ caseData }: Props) {
  const router = useRouter()
  const statusDef = CASE_STATUSES.find(s => s.key === caseData.status)
  const difficultyColors: Record<string, string> = { '易': '#059669', '普': '#D97706', '難': '#DC2626' }
  const taxColors: Record<string, string> = { '要': '#DC2626', '不要': '#059669', '確認中': '#D97706' }
  const currentIdx = STATUS_ORDER.indexOf(caseData.status)

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
          <span>案件管理</span>
          <span className="text-gray-300">›</span>
          <span className="text-gray-600 font-medium">{caseData.case_number} · {caseData.deal_name}</span>
        </div>
        <div className="ml-auto" />
      </div>

      {/* Case header card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                  {caseData.case_number}
                </span>
              </div>
              <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight mb-0.5">
                {caseData.deal_name}
              </h1>
              {caseData.deceased_name && (
                <p className="text-[13px] text-gray-500">
                  被相続人：{caseData.deceased_name}
                  {caseData.date_of_death && `（${caseData.date_of_death} 死亡）`}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* Status dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors"
                  style={{
                    color: statusDef?.color,
                    borderColor: `${statusDef?.color}40`,
                    backgroundColor: `${statusDef?.color}10`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDef?.color }} />
                  {caseData.status}
                  <span className="text-[10px] opacity-70">▾</span>
                </button>

                {dropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] z-50 overflow-hidden">
                    {CASE_STATUSES.map(s => (
                      <button
                        key={s.key}
                        onClick={() => handleStatusChange(s.key)}
                        className={`w-full px-3.5 py-2 text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                          s.key === caseData.status ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                        }`}
                      >
                        <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        {s.key}
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
              {caseData.tax_filing_required && (
                <Badge
                  label={`相続税 ${caseData.tax_filing_required}`}
                  color={taxColors[caseData.tax_filing_required] ?? '#6B7280'}
                />
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
              const def = CASE_STATUSES.find(s => s.key === status)

              return (
                <div key={status} className="flex flex-col items-center gap-1 flex-1 relative">
                  <div
                    className={`rounded-full relative z-10 transition-all ${
                      isActive
                        ? 'w-3 h-3 shadow-[0_0_0_3px_rgba(37,99,235,0.2)]'
                        : 'w-2.5 h-2.5'
                    }`}
                    style={{
                      backgroundColor: isActive
                        ? (def?.color ?? '#2563EB')
                        : isPassed
                          ? '#2563EB'
                          : '#CBD5E1',
                      opacity: isPassed && !isActive ? 0.4 : 1,
                    }}
                  />
                  <span className={`text-[10px] whitespace-nowrap text-center ${
                    isActive ? 'text-blue-600 font-semibold' : 'text-gray-400'
                  }`}>
                    {status}
                  </span>
                  {!isLast && (
                    <div
                      className="absolute top-[5px] left-[50%] right-[-50%] h-px z-0"
                      style={{
                        backgroundColor: isPassed ? '#2563EB' : '#CBD5E1',
                        opacity: isPassed ? 0.35 : 1,
                      }}
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

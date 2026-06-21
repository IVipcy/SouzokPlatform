'use client'

import { useState, useCallback } from 'react'
import { PenSquare } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import type { CaseRow, ClientRow } from '@/types'
import CaseSelectScreen from './CaseSelectScreen'
import MeetingForm from './MeetingForm'

export type SelectedCase = {
  id: string
  name: string
  client: string
  phone: string
  // 連携①（相続ステーション）由来の事前データ。面談登録フォームの初期値に引き継ぐ。
  orderRoute?: string | null
  orderRouteDetail?: string | null
} | null

export type CaseData = CaseRow & { clients?: ClientRow | null }

type Props = {
  cases: CaseData[]
  currentMemberId: string | null
}

export default function MeetingPageClient({ cases, currentMemberId }: Props) {
  const [selectedCase, setSelectedCase] = useState<SelectedCase>(null)

  const handleSelectCase = useCallback((c: SelectedCase) => {
    setSelectedCase(c)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedCase(null)
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Meeting"
        title="新規案件登録"
        icon={PenSquare}
        description="面談情報の入力・新規案件の登録"
        right={
          selectedCase ? (
            <button
              onClick={handleBack}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              ← 案件選択に戻る
            </button>
          ) : null
        }
      />

      {!selectedCase ? (
        <CaseSelectScreen cases={cases} onSelect={handleSelectCase} />
      ) : (
        <MeetingForm selectedCase={selectedCase} currentMemberId={currentMemberId} />
      )}
    </div>
  )
}

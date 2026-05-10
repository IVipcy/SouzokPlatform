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
} | null

type CaseData = CaseRow & { clients?: ClientRow | null }

type Props = {
  cases: CaseData[]
}

export default function MeetingPageClient({ cases }: Props) {
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
        title="案件編集"
        icon={PenSquare}
        description="面談情報の入力・AI音声入力対応"
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
        <MeetingForm selectedCase={selectedCase} onBack={handleBack} />
      )}
    </div>
  )
}

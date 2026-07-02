'use client'

import { useState, useCallback } from 'react'
import { PenSquare, Link2, Plus, ChevronRight, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import type { CaseRow, ClientRow } from '@/types'
import CaseSelectScreen from './CaseSelectScreen'
import MeetingForm from './MeetingForm'

export type SelectedCase = {
  id: string
  name: string
  client: string
  phone: string
  orderRoute?: string | null
  orderRouteDetail?: string | null
  deceasedName?: string | null
  deceasedFurigana?: string | null
  deceasedBirthDate?: string | null
  dateOfDeath?: string | null
  deceasedAddress?: string | null
  deceasedRegisteredAddress?: string | null
  clientFurigana?: string | null
  clientRelation?: string | null
  clientMobilePhone?: string | null
  clientEmail?: string | null
  clientAddress?: string | null
  clientPostalCode?: string | null
  clientNotes?: string | null
  hearingContent?: string | null
  specialNotes?: string | null
  otherNeeds?: string | null
  meetingOtherNotes?: string | null
  considerationDeclineReasonDetail?: string | null
} | null

export type CaseData = CaseRow & { clients?: ClientRow | null }

type Props = {
  cases: CaseData[]
  currentMemberId: string | null
  standalone?: boolean
}

type RouteChoice = null | 'lp' | 'oc'

export default function MeetingPageClient({ cases, currentMemberId, standalone = false }: Props) {
  const [selectedCase, setSelectedCase] = useState<SelectedCase>(null)
  const [routeChoice, setRouteChoice] = useState<RouteChoice>(null)
  const [formDirty, setFormDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleSelectCase = useCallback((c: SelectedCase) => {
    setSelectedCase(c)
    setFormDirty(false)
  }, [])

  const goTop = useCallback(() => {
    setSelectedCase(null)
    setRouteChoice(null)
    setFormDirty(false)
    setConfirmOpen(false)
    window.scrollTo(0, 0)
  }, [])

  const handleBack = useCallback(() => {
    if (selectedCase && formDirty) {
      setConfirmOpen(true)
      return
    }
    goTop()
  }, [selectedCase, formDirty, goTop])

  const handleChooseLp = useCallback(() => {
    setRouteChoice('lp')
  }, [])

  const handleChooseOc = useCallback(() => {
    setRouteChoice('oc')
    setSelectedCase({ id: 'new', name: '新規案件', client: '', phone: '' })
    setFormDirty(false)
  }, [])

  const showBackButton = selectedCase || routeChoice

  return (
    <div>
      <PageHeader
        eyebrow="Meeting"
        title="相談案件登録"
        icon={PenSquare}
        description="面談情報の入力"
        right={
          showBackButton ? (
            <button
              onClick={handleBack}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              ← TOPに戻る
            </button>
          ) : null
        }
      />

      {!routeChoice && (
        <RouteChoiceTop onLp={handleChooseLp} onOc={handleChooseOc} />
      )}

      {routeChoice === 'lp' && !selectedCase && (
        <CaseSelectScreen cases={cases} onSelect={handleSelectCase} />
      )}

      {selectedCase && (
        <MeetingForm
          selectedCase={selectedCase}
          currentMemberId={currentMemberId}
          standalone={standalone}
          onBack={handleBack}
          onDirtyChange={setFormDirty}
        />
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-[400px] max-w-[90vw] overflow-hidden">
            <div className="pt-6 pb-4 text-center px-6">
              <div className="w-11 h-11 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-[22px] h-[22px] text-amber-500" />
              </div>
              <h3 className="text-[15px] font-bold text-gray-900 mb-2">入力内容が保存されません</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">入力途中の内容は保存されませんが、<br />よろしいですか？</p>
            </div>
            <div className="px-6 pb-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 text-[13px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                入力に戻る
              </button>
              <button
                type="button"
                onClick={goTop}
                className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                TOPに戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RouteChoiceTop({ onLp, onOc }: { onLp: () => void; onOc: () => void }) {
  return (
    <div className="max-w-[480px] mx-auto mt-4">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3">
          <PenSquare className="w-6 h-6 text-brand-600" />
        </div>
        <h2 className="text-[16px] font-bold text-gray-900 mb-1">相談結果の登録</h2>
        <p className="text-[13px] text-gray-500">どちらの相談結果を登録しますか？</p>
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onLp}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border-2 border-brand-200 bg-brand-50/50 hover:bg-brand-50 transition text-left"
        >
          <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-gray-900">LP直案件</div>
            <div className="text-[12px] text-gray-500 mt-0.5">相続ステーションから連携された案件</div>
          </div>
          <ChevronRight className="w-[18px] h-[18px] text-brand-400 flex-shrink-0" />
        </button>
        <button
          type="button"
          onClick={onOc}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition text-left"
        >
          <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
            <Plus className="w-[18px] h-[18px] text-gray-500" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-gray-900">OC直・HP経由案件等</div>
            <div className="text-[12px] text-gray-500 mt-0.5">葬儀社・税理士・HP経由など新規案件</div>
          </div>
          <ChevronRight className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
        </button>
      </div>
    </div>
  )
}

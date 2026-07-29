'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardList, FileText, FileSpreadsheet, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import OrderSheet from '@/components/features/cases/OrderSheet'
import MeetingForm from '@/app/(authenticated)/meeting/MeetingForm'
import type { SelectedCase } from '@/app/(authenticated)/meeting/MeetingPageClient'
import MeetingSheetTab, { MemoCarryOver } from './MeetingSheetTab'
import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'
import type {
  CaseRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, CaseReferralRow,
  CaseClientRow, ContractDocumentRow, SagyoDocumentRow,
} from '@/types'

// 面談シートの手書きメモ（meeting_memos）1行
export type MeetingMemoRow = {
  id: string
  case_id: string
  section: string | null
  image_path: string | null
  image_bucket: string
  ocr_text: string | null
  sort_order: number
  created_by: string | null
  created_at: string | null
}

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  memos: MeetingMemoRow[]
  heirs: HeirRow[]
  kosekiRequests: KosekiRequestRow[]
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  financialAssets: FinancialAssetRow[]
  divisionDetails: DivisionDetailRow[]
  agreementDispatches: AgreementDispatchRow[]
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  clientCommunications: ClientCommunicationRow[]
  referrals: CaseReferralRow[]
  caseClients: CaseClientRow[]
  contractDocuments: ContractDocumentRow[]
  sagyoDocuments: SagyoDocumentRow[]
  receipts: TimelineReceipt[]
}

type Tab = 'sheet' | 'result' | 'order'

// caseData から MeetingForm 用の SelectedCase（既存案件＝更新モード）を組み立てる。
function toSelectedCase(c: CaseRow): NonNullable<SelectedCase> {
  const cl = c.clients
  return {
    id: c.id, name: c.deal_name, client: cl?.name ?? '', phone: cl?.phone ?? '',
    orderRoute: c.order_route, orderRouteDetail: c.order_route_detail,
    deceasedName: c.deceased_name, deceasedFurigana: c.deceased_furigana,
    deceasedBirthDate: c.deceased_birth_date, dateOfDeath: c.date_of_death,
    deceasedAddress: c.deceased_address, deceasedRegisteredAddress: c.deceased_registered_address,
    clientFurigana: cl?.furigana ?? null, clientRelation: cl?.relationship_to_deceased ?? null,
    clientMobilePhone: cl?.mobile_phone ?? null, clientEmail: cl?.email ?? null,
    clientAddress: cl?.address ?? null, clientPostalCode: cl?.postal_code ?? null,
    clientNotes: cl?.notes ?? null,
    hearingContent: c.hearing_content, specialNotes: c.special_notes, otherNeeds: c.other_needs,
    meetingOtherNotes: c.meeting_other_notes, considerationDeclineReasonDetail: c.consideration_decline_reason_detail,
  }
}

export default function IntakeCaseClient({ caseData, currentMemberId, memos, ...rest }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('sheet')
  const [resultDone, setResultDone] = useState(false)
  const [caseState, setCaseState] = useState<CaseRow>(caseData)
  // 面談シートの手書きメモは①で作成、③でも参照するため親でstate管理。
  const [memoList, setMemos] = useState<MeetingMemoRow[]>(memos)

  const patchCase = async (patch: Partial<CaseRow>) => {
    setCaseState(prev => ({ ...prev, ...patch }))
    const { error } = await supabase.from('cases').update(patch).eq('id', caseData.id)
    if (error) throw new Error(error.message)
  }
  const patchClient = async (patch: Record<string, unknown>) => {
    if (!caseData.client_id) return
    const prev = caseState.clients
    setCaseState(c => ({ ...c, clients: c.clients ? { ...c.clients, ...patch } as typeof c.clients : c.clients }))
    const { error } = await supabase.from('clients').update(patch).eq('id', caseData.client_id)
    if (error) { setCaseState(c => ({ ...c, clients: prev })); throw new Error(error.message) }
  }

  const TABS: { id: Tab; icon: typeof ClipboardList; label: string }[] = [
    { id: 'sheet', icon: ClipboardList, label: '① 面談シート' },
    { id: 'result', icon: FileText, label: '② 面談結果登録' },  // eslint-disable-line
    { id: 'order', icon: FileSpreadsheet, label: '③ オーダーシート' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <Link href="/intake" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />TOP
        </Link>
        <span className="text-[11px] font-mono text-gray-400">{caseState.case_number} ・ {caseState.deal_name}</span>
      </div>

      {/* 3タブ（順次遷移） */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1.5 mb-4">
        {TABS.map(t => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${active ? 'bg-white text-brand-700 border border-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" strokeWidth={2} />{t.label}
              {t.id === 'result' && resultDone && <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />}
            </button>
          )
        })}
      </div>

      {tab === 'sheet' && (
        <div>
          <MeetingSheetTab caseData={caseState} patchCase={patchCase} patchClient={patchClient} currentMemberId={currentMemberId} memos={memoList} setMemos={setMemos} />
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setTab('result')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700">
              面談結果登録へ進む →
            </button>
          </div>
        </div>
      )}

      {tab === 'result' && (
        <MeetingForm
          selectedCase={toSelectedCase(caseState)}
          currentMemberId={currentMemberId}
          lpLinked={!!caseState.lp_case_number}
          onSaved={() => { setResultDone(true); setTab('order'); router.refresh() }}
        />
      )}

      {tab === 'order' && (
        <div>
          <MemoCarryOver memos={memoList} />
          <OrderSheet
            caseData={caseState}
            patchCase={patchCase}
            patchClient={patchClient}
            onRefresh={() => router.refresh()}
            guided
            {...rest}
          />
        </div>
      )}
    </div>
  )
}

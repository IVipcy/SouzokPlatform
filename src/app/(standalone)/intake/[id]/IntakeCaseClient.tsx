'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardList, FileText, FileSpreadsheet, Check, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { cascadeDeleteCase } from '@/lib/caseDelete'
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
  const [discardOpen, setDiscardOpen] = useState(false)

  // 新規（下書き未作成）モード：caseData.id が空。最初の入力で遅延作成する。
  const idRef = useRef<string>(caseData.id)          // 実案件ID（作成後に確定）
  const clientIdRef = useRef<string | null>(caseData.client_id ?? null)
  const ensuringRef = useRef<Promise<string> | null>(null)  // 同時呼び出しの重複作成防止
  // 未作成（下書き）モードの表示判定は state で（ref はレンダー中に読まない）。作成後は caseState.id が実IDになる。
  const draftPending = caseState.id === ''

  // 下書き案件を遅延作成（clients=無題 + cases intake_draft=true, meeting_owner_id=自分, case_members はまだ付けない）。
  // 案件番号は当日連番。経路コードは②で確定するため 'XX'。
  const createDraftCase = useCallback(async (): Promise<string> => {
    const { data: client, error: ce } = await supabase.from('clients').insert({ name: '無題' }).select('id').single()
    if (ce || !client) throw new Error(ce?.message ?? '依頼者の作成に失敗しました')
    clientIdRef.current = client.id

    const now = new Date()
    const yy = String(now.getFullYear()).slice(2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const { data: todayCases } = await supabase.from('cases').select('case_number').gte('created_at', startOfDay)
    let seq = (todayCases ?? []).reduce((max, c) => {
      const n = parseInt(String(c.case_number ?? '').slice(-4), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0) + 1

    let lastErr = '不明なエラー'
    for (let attempt = 0; attempt < 20; attempt++) {
      const caseNumber = `${yy}${mm}XX${String(seq).padStart(4, '0')}`
      const { data: newCase, error } = await supabase.from('cases').insert({
        case_number: caseNumber, client_id: client.id, deal_name: '無題', status: '検討中',
        meeting_owner_id: currentMemberId || null, intake_draft: true,
      }).select('*, clients(*)').single()
      if (!error && newCase) {
        idRef.current = (newCase as CaseRow).id
        setCaseState(newCase as CaseRow)
        // URLを実案件に置き換え（リロード/戻る対応・再マウントは避ける）
        if (typeof window !== 'undefined') window.history.replaceState(null, '', `/intake/${(newCase as CaseRow).id}`)
        return (newCase as CaseRow).id
      }
      lastErr = error?.message ?? lastErr
      if (error?.code === '23505') { seq += 1; continue }
      break
    }
    throw new Error(`案件の作成に失敗: ${lastErr}`)
  }, [supabase, currentMemberId])

  // 実案件IDを保証（未作成なら作成）。同時呼び出しは1回の作成に集約。
  const ensureCase = useCallback(async (): Promise<string> => {
    if (idRef.current) return idRef.current
    if (ensuringRef.current) return ensuringRef.current
    ensuringRef.current = createDraftCase().catch(e => { ensuringRef.current = null; throw e })
    return ensuringRef.current
  }, [createDraftCase])

  const patchCase = async (patch: Partial<CaseRow>) => {
    const id = await ensureCase()
    setCaseState(prev => ({ ...prev, ...patch }))
    const { error } = await supabase.from('cases').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
  }
  const patchClient = async (patch: Record<string, unknown>) => {
    await ensureCase()
    const clientId = clientIdRef.current
    if (!clientId) return
    const prev = caseState.clients
    setCaseState(c => ({ ...c, clients: (c.clients ? { ...c.clients, ...patch } : { id: clientId, ...patch }) as unknown as typeof c.clients }))
    const { error } = await supabase.from('clients').update(patch).eq('id', clientId)
    if (error) { setCaseState(c => ({ ...c, clients: prev })); throw new Error(error.message) }
  }

  // 下書きを破棄（作成済みなら完全削除、未作成ならそのまま入口へ）
  const discardDraft = async () => {
    if (idRef.current) await cascadeDeleteCase(supabase, idRef.current)
    showToast('面談シートを破棄しました', 'success')
    router.push('/intake')
  }

  // ②相談結果登録を保存＝正式な相談案件に昇格（下書き解除＋受注担当をアサイン）
  const graduateFromDraft = async () => {
    const id = idRef.current
    if (!id) return
    await supabase.from('cases').update({ intake_draft: false }).eq('id', id)
    if (currentMemberId) {
      const { error } = await supabase.from('case_members').insert({ case_id: id, member_id: currentMemberId, role: 'sales' })
      if (error && error.code !== '23505') { /* 既存アサインは無視 */ }
    }
  }

  const TABS: { id: Tab; icon: typeof ClipboardList; label: string }[] = [
    { id: 'sheet', icon: ClipboardList, label: '① 面談シート入力' },
    { id: 'result', icon: FileText, label: '② 面談結果登録' },
    { id: 'order', icon: FileSpreadsheet, label: '③ オーダーシート入力' },
  ]

  // ①→②→③ の順次遷移のみ許可。戻るのは自由、飛び越しは不可（②は下書き案件確定、③は面談結果登録の完了が前提）。
  const goTab = async (t: Tab) => {
    if (t === 'result' && tab === 'sheet') {
      try { await ensureCase() } catch (e) { showToast(e instanceof Error ? e.message : '案件の作成に失敗しました', 'error'); return }
    }
    // 未経由のタブへ飛び越し禁止：sheet からいきなり order／result 未完了で order
    if (t === 'order' && !resultDone) {
      showToast('先に②面談結果登録を完了してください', 'error'); return
    }
    if (t !== 'sheet' && draftPending) {
      // sheet で未入力のまま順次進行を試みた場合、まず下書きを作る
      try { await ensureCase() } catch (e) { showToast(e instanceof Error ? e.message : '案件の作成に失敗しました', 'error'); return }
    }
    setTab(t)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <Link href="/intake" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />TOP
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono text-gray-400">
            {draftPending ? '新規面談シート（下書き）' : `${caseState.case_number} ・ ${caseState.deal_name}`}
          </span>
          <button type="button" onClick={() => setDiscardOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-red-600 border border-gray-200 rounded-md hover:border-red-200 transition-colors">
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />破棄
          </button>
        </div>
      </div>

      {/* 3タブ（①→②→③の順次遷移。飛び越し不可＝③は②完了が前提） */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1.5 mb-4">
        {TABS.map(t => {
          const active = tab === t.id
          const Icon = t.icon
          const locked = t.id === 'order' && !resultDone
          return (
            <button key={t.id} type="button" onClick={() => goTab(t.id)} disabled={locked}
              title={locked ? '先に②面談結果登録を完了してください' : undefined}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${active ? 'bg-white text-brand-700 border border-gray-200 shadow-sm' : locked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" strokeWidth={2} />{t.label}
              {t.id === 'result' && resultDone && <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />}
            </button>
          )
        })}
      </div>

      {tab === 'sheet' && (
        <div>
          <MeetingSheetTab caseData={caseState} patchCase={patchCase} patchClient={patchClient} ensureCaseId={ensureCase} currentMemberId={currentMemberId} memos={memoList} setMemos={setMemos}
            caseClients={rest.caseClients} heirs={rest.heirs} properties={rest.properties} financialAssets={rest.financialAssets} onRefresh={() => router.refresh()} />
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => goTab('result')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700">
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
          onSaved={async () => { await graduateFromDraft(); setResultDone(true); setTab('order'); router.refresh() }}
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

      <DeleteConfirmModal
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="面談シートを破棄"
        message={!draftPending
          ? 'この面談シート（下書き案件）を破棄して完全に削除します。入力内容・手書きメモも失われ、取り消せません。破棄しますか？'
          : 'この面談シートを閉じて入口に戻ります。まだ案件は作成されていません。'}
        onConfirm={discardDraft}
      />
    </div>
  )
}

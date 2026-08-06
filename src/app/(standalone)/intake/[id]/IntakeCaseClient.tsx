'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardList, FileText, FileSpreadsheet, Check, Trash2, PencilLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import AssignRequestModal from '@/components/features/cases/AssignRequestModal'
import { cascadeDeleteCase } from '@/lib/caseDelete'
import OrderSheet from '@/components/features/cases/OrderSheet'
import MeetingForm from '@/app/(authenticated)/meeting/MeetingForm'
import WhiteboardTab from './WhiteboardTab'
import MeetingMemoViewer from '@/components/features/cases/MeetingMemoViewer'
import type { SelectedCase } from '@/app/(authenticated)/meeting/MeetingPageClient'
import MeetingSheetTab, { MemoCarryOver } from './MeetingSheetTab'
import { partsForCase, activePartKeys } from '@/lib/serviceParts'
import type { TimelineReceipt } from '@/components/features/cases/CaseTimeline'
import type {
  CaseRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow,
  DivisionDetailRow, AgreementDispatchRow, ExpenseRow, TaskRow, ClientCommunicationRow, CaseReferralRow,
  CaseClientRow, ContractDocumentRow, SagyoDocumentRow, MemberRow,
} from '@/types'

// ②面談結果登録で受注系/依頼確定待ちになったら割振り依頼ポップを出す対象ステータス
//   「依頼確定待ち」は表示ラベルで、ステータスkeyは「検討中（契約書待ち）」。
const ASSIGN_TRIGGER_STATUSES = new Set(['受注', '戻り受注', '検討中（契約書待ち）'])

// 白紙メモ1枚のメタ情報（帯＝セクションの境界Y座標）。原本ビューアのセクションジャンプに使う。
export type MemoBand = { key: string; label: string; y0: number; y1: number }
export type MemoMeta = { w: number; h: number; bands: MemoBand[] }

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
  /** 白紙メモのみ。帯境界など（migration 221）。セクション別メモでは null */
  meta: MemoMeta | null
}

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  allMembers: MemberRow[]
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
// ①面談シート入力の中の書き方切替。白紙モードは「①の書き方違い」なので工程タブにはしない。
// 切替は覚えない（①を開くたび必ず項目モードから）。
type SheetMode = 'fields' | 'white'

// caseData から MeetingForm 用の SelectedCase（既存案件＝更新モード）を組み立てる。
// 依頼者氏名は 面談シートで入力する case_clients の「メイン依頼者」を正とする。
// （c.clients.name は syncMainName 未発火だと "無題" のままなので、caseClients から拾う）
function toSelectedCase(c: CaseRow, caseClients: CaseClientRow[] = []): NonNullable<SelectedCase> {
  const cl = c.clients
  const mainClient = caseClients.find(cc => cc.priority === 'main') ?? caseClients[0]
  const clientName = (mainClient?.name?.trim()) || (cl?.name && cl.name !== '無題' ? cl.name : '') || ''
  const dealName = (c.deal_name && c.deal_name !== '無題') ? c.deal_name : (clientName || c.deal_name)
  return {
    id: c.id, name: dealName, client: clientName, phone: mainClient?.phone ?? cl?.phone ?? '',
    orderRoute: c.order_route, orderRouteDetail: c.order_route_detail,
    deceasedName: c.deceased_name, deceasedFurigana: c.deceased_furigana,
    deceasedBirthDate: c.deceased_birth_date, dateOfDeath: c.date_of_death,
    deceasedAddress: c.deceased_address, deceasedRegisteredAddress: c.deceased_registered_address,
    clientFurigana: mainClient?.furigana ?? cl?.furigana ?? null, clientRelation: mainClient?.relationship ?? cl?.relationship_to_deceased ?? null,
    clientMobilePhone: mainClient?.mobile_phone ?? cl?.mobile_phone ?? null, clientEmail: mainClient?.email ?? cl?.email ?? null,
    clientAddress: cl?.address ?? null, clientPostalCode: cl?.postal_code ?? null,
    clientNotes: cl?.notes ?? null,
    hearingContent: c.hearing_content, specialNotes: c.special_notes, otherNeeds: c.other_needs,
    meetingOtherNotes: c.meeting_other_notes, considerationDeclineReasonDetail: c.consideration_decline_reason_detail,
    // 面談シート①の受注内容(service_parts / procedure_type)を面談結果登録②へ引き継ぐ
    serviceCategories: activePartKeys(partsForCase(c)),
    // 面談シート①で選んだ実施業務(intake_roles)を②へ引き継ぐ。渡さないと MeetingForm 保存で空配列に上書きされて選択が消える。
    intakeRoles: c.intake_roles ?? [],
  }
}

export default function IntakeCaseClient({ caseData, currentMemberId, allMembers, memos, ...rest }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('sheet')
  // ①の書き方（項目／白紙）。①へ入るたび 'fields' に戻す（＝モードは記憶しない）。
  const [sheetMode, setSheetMode] = useState<SheetMode>('fields')
  // 白紙メモの原本ビューア（保存済み画像をいつでも開けるようにする）
  const [memoViewerOpen, setMemoViewerOpen] = useState(false)
  const [resultDone, setResultDone] = useState(false)
  const [caseState, setCaseState] = useState<CaseRow>(caseData)
  // router.refresh() で fetch した最新 caseData を state に流し込む。
  // 面談シート内で CaseClientsTable などが直接 supabase.update を叩いた後、
  // caseState が stale だと ②面談結果登録に転記される selectedCase が古いままになる。
  useEffect(() => { setCaseState(caseData) }, [caseData])
  // 面談シートの手書きメモは①で作成、③でも参照するため親でstate管理。
  const [memoList, setMemos] = useState<MeetingMemoRow[]>(memos)
  const [discardOpen, setDiscardOpen] = useState(false)
  // ②保存後のポップ：割振り依頼（受注系/依頼確定待ち）→ オーダーシートに進む？（はい/いいえ）
  const [assignOpen, setAssignOpen] = useState(false)
  const [orderChoiceOpen, setOrderChoiceOpen] = useState(false)

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
    if (t === 'sheet') setSheetMode('fields')   // ①へ入るたび項目モードに戻す
    setTab(t)
    // タブ切替時は先頭へスクロール（面談シート最下部の保存ボタンから遷移すると 遷移先も最下部表示になる不具合を防ぐ）
    window.scrollTo(0, 0)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Link href="/intake" className="inline-flex items-center gap-1 px-2 py-2 min-h-[40px] text-[13px] font-semibold text-gray-500 hover:text-brand-700 active:bg-gray-100 rounded-md">
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />TOP
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-mono text-gray-400">
            {draftPending ? '新規面談シート（下書き）' : `${caseState.case_number} ・ ${caseState.deal_name}`}
          </span>
          <button type="button" onClick={() => setDiscardOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] text-[12px] font-semibold text-gray-400 hover:text-red-600 border border-gray-200 rounded-md hover:border-red-200 active:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" strokeWidth={2} />破棄
          </button>
        </div>
      </div>

      {/* 3タブ（①→②→③の順次遷移。飛び越し不可＝③は②完了が前提）。タブレットでタップしやすい高さ(min 48px)。 */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1.5 mb-4">
        {TABS.map(t => {
          const active = tab === t.id
          const Icon = t.icon
          const locked = t.id === 'order' && !resultDone
          return (
            <button key={t.id} type="button" onClick={() => goTab(t.id)} disabled={locked}
              title={locked ? '先に②面談結果登録を完了してください' : undefined}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] rounded-lg text-[14px] font-semibold transition-colors ${active ? 'bg-white text-brand-700 border border-gray-200 shadow-sm' : locked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700 active:bg-gray-200'}`}>
              <Icon className="w-4 h-4" strokeWidth={2} />{t.label}
              {t.id === 'result' && resultDone && <Check className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />}
            </button>
          )
        })}
      </div>

      {tab === 'sheet' && (
        <div>
          {/* ①の書き方切替：項目モード（従来）⇄ 白紙モード（見出しだけの白紙に手書き）。中身のデータは共通。 */}
          <div className="flex items-start gap-3 mb-3 flex-wrap">
            <p className="text-[12px] text-gray-500 flex-1 min-w-[220px] leading-relaxed">
              {sheetMode === 'fields'
                ? '面談中の要点を記録します。各項目・メモは案件に保存され、②面談結果登録・③オーダーシートに引き継がれます。'
                : 'セクション見出しだけの白紙です。書いたあと「テキスト化」で各セクションのメモ欄に入り、そこから項目に反映できます。'}
            </p>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden flex-none bg-white">
              {([['fields', '項目モード', ClipboardList], ['white', '白紙モード', PencilLine]] as const).map(([m, label, Icon], i) => (
                <button key={m} type="button" onClick={() => setSheetMode(m)}
                  className={`inline-flex items-center gap-1 text-[12.5px] px-3 py-2 min-h-[38px] ${i > 0 ? 'border-l border-gray-200' : ''} ${sheetMode === m ? 'bg-brand-600 text-white font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>
          </div>

          {sheetMode === 'white' ? (
            <WhiteboardTab
              caseData={caseState} patchCase={patchCase} patchClient={patchClient} ensureCaseId={ensureCase}
              currentMemberId={currentMemberId} memos={memoList} setMemos={setMemos}
              onRefresh={() => router.refresh()} onOpenViewer={() => setMemoViewerOpen(true)}
              onGoFields={() => { setSheetMode('fields'); window.scrollTo(0, 0) }}
            />
          ) : (
          <MeetingSheetTab caseData={caseState} patchCase={patchCase} patchClient={patchClient} ensureCaseId={ensureCase} currentMemberId={currentMemberId} memos={memoList} setMemos={setMemos}
            caseClients={rest.caseClients} heirs={rest.heirs} properties={rest.properties} financialAssets={rest.financialAssets} onRefresh={() => router.refresh()} />
          )}
          {/* 面談シート最下部の保存ボタン。入力欄は blur で随時オートセーブされているが、
              明示的な「保存して次へ」を用意して迷わないように。押下で②面談結果登録タブへ遷移。 */}
          <div className="mt-6 flex flex-col items-center gap-2 pb-6">
            {/* 最下部ボタンの共通仕様：高さ52px・角丸12px・15px太字・影は控えめ・絵文字なし（②③と統一） */}
            <button type="button" onClick={() => goTab('result')} className="w-full md:w-auto md:px-10 inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl text-[15px] font-bold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-sm transition-colors">
              保存して面談結果登録へ進む →
            </button>
            <p className="text-[11px] text-gray-400">入力内容は 各項目のフォーカスが外れた時点で 自動保存されています</p>
          </div>
        </div>
      )}

      <MeetingMemoViewer
        memos={memoList.filter(m => m.section === 'whiteboard')}
        open={memoViewerOpen}
        onClose={() => setMemoViewerOpen(false)}
        onDeleted={id => setMemos(prev => prev.filter(m => m.id !== id))}
      />

      {tab === 'result' && (
        <MeetingForm
          selectedCase={toSelectedCase(caseState, rest.caseClients)}
          currentMemberId={currentMemberId}
          lpLinked={!!caseState.lp_case_number}
          onSaved={async (caseId) => {
            await graduateFromDraft()
            setResultDone(true)
            // 保存後の最新ステータス・名称を取得（無題対策 & 割振り判定）
            const { data: fresh } = await supabase.from('cases').select('status, deal_name').eq('id', caseId).single()
            const status = fresh?.status ?? caseState.status
            // deal_name が無題/空なら、メイン依頼者名で補完（相談案件一覧で「無題」を残さない）
            if (!fresh?.deal_name || fresh.deal_name === '無題') {
              const { data: ccs } = await supabase.from('case_clients').select('name, priority, sort_order').eq('case_id', caseId).order('sort_order')
              const main = ccs?.find(c => c.priority === 'main') ?? ccs?.[0]
              const clientName = main?.name?.trim() || ''
              if (clientName && clientName !== '無題') await supabase.from('cases').update({ deal_name: clientName }).eq('id', caseId)
            }
            router.refresh()
            // 受注系/依頼確定待ち → 割振り依頼ポップを先に。それ以外はそのままオーダーシート選択へ。
            if (ASSIGN_TRIGGER_STATUSES.has(status) && !caseState.manager_assign_skipped) setAssignOpen(true)
            else setOrderChoiceOpen(true)
          }}
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
            meetingMemos={memoList.filter(m => m.section === 'whiteboard')}
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

      {/* ②保存後：受注系/依頼確定待ちなら 割振り依頼ポップ（閉じると次のオーダーシート選択へ） */}
      <AssignRequestModal
        isOpen={assignOpen}
        onClose={() => { setAssignOpen(false); setOrderChoiceOpen(true) }}
        caseId={caseState.id}
        caseNumber={caseState.case_number}
        dealName={caseState.deal_name ?? ''}
        allMembers={allMembers}
        onDone={() => router.refresh()}
        onSkip={() => router.refresh()}
      />

      {/* ②保存後：このままオーダーシート作成に進む？ */}
      <Modal
        isOpen={orderChoiceOpen}
        onClose={() => setOrderChoiceOpen(false)}
        title="面談結果を登録しました"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOrderChoiceOpen(false); showToast('相談案件一覧／未着手案件一覧から続きを作成できます', 'success'); router.push('/intake') }}>いいえ（あとで）</Button>
            <Button variant="primary" onClick={() => { setOrderChoiceOpen(false); setTab('order'); window.scrollTo(0, 0) }}>はい（作成に進む）</Button>
          </>
        }
      >
        <div className="space-y-2 text-[13px] text-gray-700 leading-relaxed">
          <p>このまま<strong>オーダーシートの作成</strong>に進みますか？</p>
          <p className="text-[12px] text-gray-500">「いいえ」を選んでも案件は保存済みです。あとで<strong>マイページの相談案件一覧／未着手案件一覧</strong>から案件を探して、オーダーシートの作成を続けられます。</p>
        </div>
      </Modal>
    </div>
  )
}

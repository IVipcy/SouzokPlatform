'use client'

import { useState, useEffect, useRef, type RefObject } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, ListChecks, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { applyRouteToCaseNumber, isPendingRouteCaseNumber } from '@/lib/caseNumber'
import { kosekiOfficeFromAddress } from '@/lib/address'
import { showToast } from '@/components/ui/Toast'
import { normalizeTaskStatus, toReadinessReceipts, getStartSignal } from '@/lib/taskReadiness'
import { useModal } from '@/hooks/useModal'
import CompleteTaskModal from '@/components/features/tasks/CompleteTaskModal'
import CompletionCautionModal from '@/components/features/tasks/CompletionCautionModal'
import { getCompletionCaution, type CompletionCaution } from '@/lib/completionCaution'
import { checkCaseCompletable, billingPatternLabel, refundStageLabel, type MissingInvoice, type PendingRefund, type MissingReferral } from '@/lib/caseCompletionGate'
import { stripGyomu } from '@/lib/kotei'
import CaseHeader from './CaseHeader'
import CaseTabs, { TAB_GROUP, type TabKey } from './CaseTabs'
import BasicInfoTab from './BasicInfoTab'
import FreeWorkTab from './WorkContentField'
import MeetingInfoTab from './MeetingInfoTab'
import ClientInfoTab from './ClientInfoTab'
import TasksTab from './TasksTab'
import DeceasedTab from './DeceasedTab'
import LegalInfoTab from './LegalInfoTab'
import ContractTab from './ContractTab'
import SuccessionTab from './SuccessionTab'
import AssetsTab from './AssetsTab'
import DivisionTab from './DivisionTab'
import type { RoleRow } from './ProcedureIntakeSection'
import DocsTab from './DocsTab'
import DocumentCreateTab from './DocumentCreateTab'
import ReferralTab from './ReferralTab'
import CancellationTab from './CancellationTab'
import RegistrationTab from './RegistrationTab'
import OwnerSalesTab from './OwnerSalesTab'
import AssigneesTab from './AssigneesTab'
import ContractProcTab from './ContractProcTab'
import DeliveryTab from './DeliveryTab'
import PracticeProcedureTab from './PracticeProcedureTab'
import { PROCEDURE_TABS } from './practiceTabs'
import OrderSheet from './OrderSheet'
import CaseMeetingSheetPanel from './CaseMeetingSheetPanel'
import type { MemoLite } from './MeetingMemoViewer'
import ProgressBoard from './ProgressBoard'
import CaseComposeProvider from './CaseComposeProvider'
import { buildProgressBoard } from '@/lib/caseProgressBoard'
import { buildProgressDetail } from '@/lib/caseProgressDetail'
import { systemTaskGroup } from '@/lib/systemTaskGroup'
import TaskCandidatePanel from './TaskCandidatePanel'

import AddTaskModal from './AddTaskModal'
import StatusFlowNavigator, { getJutakuFlowSteps, getKentouContractFlowSteps, getWorkPrepFlowSteps, getInitialTasksFlowSteps } from './StatusFlowNavigator'
import HandoffModal from './HandoffModal'
import AssignRequestModal from './AssignRequestModal'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getCaseTabVisibility, type TabVisibility } from '@/lib/caseTabs'
import { toneOfTab, TONE_BG } from '@/lib/practiceTabTone'
import { GYOMU_TAB } from '@/lib/serviceMaster'
import { getSelectableCaseStatuses, isContractProcDone, isContractDocsReceived } from '@/lib/constants'
import { countReceiptsNeedingLink } from '@/lib/receiptLink'
import type { TimelineReceipt, TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow, DivisionDetailRow, AgreementDispatchRow, ExpenseRow, CaseDocumentRow, ClientCommunicationRow, CaseReferralRow, CaseClientRow, ContractDocumentRow, SagyoDocumentRow, DocumentRow, CaseFileRow, AssetInventoryRow, CaseOtherAssetRow } from '@/types'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  taskTemplates: TaskTemplateRow[]
  heirs: HeirRow[]
  kosekiRequests: KosekiRequestRow[]
  properties: RealEstatePropertyRow[]
  acquisitions?: RealEstateAcquisitionRow[]
  financialAssets: FinancialAssetRow[]
  assetInventory?: AssetInventoryRow[]
  otherAssets?: CaseOtherAssetRow[]
  divisionDetails: DivisionDetailRow[]
  agreementDispatches?: AgreementDispatchRow[]
  expenses: ExpenseRow[]
  documents: CaseDocumentRow[]
  clientCommunications: ClientCommunicationRow[]
  currentMemberId: string | null
  /** 閲覧者の全体ロール（primaryRole）。管理担当は案件詳細を進捗サマリー/案件情報/請求/タスクに絞る。 */
  viewerRole?: string | null
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
  statusHistory?: TimelineStatusEvent[]
  documentReceipts?: TimelineReceipt[]
  caseReferrals?: CaseReferralRow[]
  caseClients?: CaseClientRow[]
  contractDocuments?: ContractDocumentRow[]
  sagyoDocuments?: SagyoDocumentRow[]
  createdDocuments?: DocumentRow[]
  caseFiles?: CaseFileRow[]
  /** 請求料金内訳（報酬）に金額が入っているか。引き継ぎゲート判定用。 */
  hasBaseFee?: boolean
  /** 案件再オープン回数 (progress_reports.kind='case_reopen' の件数) */
  reopenCount?: number
  /** 前受金が入金済か（作業着手準備ナビの前受金入金ゲート用） */
  advancePaid?: boolean
  /** 白紙メモの原本（オーダーシート右上からいつでも開けるようにする） */
  whiteboardMemos?: MemoLite[]
  /** 前受金請求書が発行済か（受注→作業着手準備ナビの料金表入力・前受金請求書発行ゲート用） */
  advanceInvoiceIssued?: boolean
}

// DBトリガーで他カラムが自動更新されるフィールド → 更新後に全体refreshが必要
// client_response_due_date: 変更で「検討状況の確認」タスクの期限が追従するため再取得（migration 096）
const TRIGGER_FIELDS = new Set(['status', 'client_response_due_date'])

const VALID_TABS: TabKey[] = ['orderSheet', 'basicInfo', 'progress', 'ownerSales', 'assignees', 'contractProc', 'meeting', 'clientInfo', 'tasks', 'deceased', 'legalInfo', 'contract', 'assets', 'division', 'will', 'registration', 'cancellation', 'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'succession', 'letter', 'execution', 'contractCreate', 'referral', 'receipts', 'docs', 'documentCreate']

// 管理担当の割振り依頼ポップを出すステータス。依頼確定待ちの段階から割り振っておく運用。
const ASSIGN_PROMPT_STATUSES = new Set(['受注', '戻り受注', '作業着手準備', '検討中（契約書待ち）'])

export default function CaseDetailClient({ caseData: caseDataProp, caseMembers, tasks, allMembers, taskTemplates, heirs, kosekiRequests, properties, acquisitions = [], financialAssets, assetInventory = [], otherAssets = [], divisionDetails, agreementDispatches = [], expenses, documents, clientCommunications, currentMemberId, viewerRole = null, caseAlerts, statusHistory, documentReceipts, caseReferrals, caseClients, contractDocuments = [], sagyoDocuments = [], createdDocuments = [], caseFiles = [], reopenCount = 0, advancePaid = false, advanceInvoiceIssued = false, whiteboardMemos = [] }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = (() => {
    const p = searchParams.get('tab')
    return p && (VALID_TABS as string[]).includes(p) ? (p as TabKey) : 'basicInfo'
  })()
  const [activeTab, setActiveTabState] = useState<TabKey>(tabFromUrl)
  const [caseState, setCaseState] = useState<CaseRow>(caseDataProp)
  // 割振り担当（プロフィールの「割振り担当」）本人か。
  // この人は依頼を出す側ではなく受ける側なので、下の割振り依頼ポップを出さない。
  const isDispatcher = !!allMembers.find(m => m.id === currentMemberId)?.is_dispatcher
  // 管理担当の割振り依頼ポップ。受注系（依頼確定待ちを含む）で管理担当が未アサインなら、
  // 案件詳細を開くたびに出す。面談結果登録の直後には出さない（登録した本人にしか届かず、
  // 翌日以降に開いた人が気づけないため）。初期値で開くので useEffect は使わない。
  //
  // ただし次のときは出さない。
  //   ・割振り担当本人（依頼を出す側ではなく受ける側）
  //   ・担当者タブを直接開いたとき。割振り依頼の通知は /cases/{id}?tab=assignees へ飛ぶので、
  //     ここへ来た人はアサインしに来ている。依頼のポップを出すと閉じる操作から始まってしまう。
  const [assignReqOpen, setAssignReqOpen] = useState(() =>
    ASSIGN_PROMPT_STATUSES.has(caseDataProp.status)
    && !caseMembers.some(cm => cm.role === 'manager')
    && !caseDataProp.manager_assign_skipped
    && !allMembers.find(m => m.id === currentMemberId)?.is_dispatcher
    && tabFromUrl !== 'assignees')
  // 案件ステータス→「完了」ゲート：請求パターン別の入金完了条件を満たしていない時に表示するモーダル
  const [completionBlocked, setCompletionBlocked] = useState<{ missing: MissingInvoice[]; pendingRefunds: PendingRefund[]; missingReferrals: MissingReferral[]; billingPattern: string; hasInvoices: boolean } | null>(null)
  // 検討中→（契約書待ち）/受託 へ進む前に面談情報の更新を促すゲート（対象ステータスを保持）
  const [meetingGate, setMeetingGate] = useState<string | null>(null)
  // 受託フロー・ナビゲーターの「あとで」抑制（再マウント＝案件を再オープンでリセット）
  const [navDismissed, setNavDismissed] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [completeTaskOpen, setCompleteTaskOpen] = useState(false)
  // 完了前の注意ポップアップ（依頼のし忘れ・凍結確認漏れ等）
  const [caution, setCaution] = useState<CompletionCaution | null>(null)
  const [cautionBusy, setCautionBusy] = useState(false)
  const [checkingCaution, setCheckingCaution] = useState(false)
  // タブ↔ナビのリードライン描画用ラッパ
  const navWrapRef = useRef<HTMLDivElement>(null)

  // URL → state 双方向同期: URL の tab パラメータが変わったら state も追随
  // （戻る/進む や リフレッシュ後にタブ位置を維持するため）
  useEffect(() => {
    setActiveTabState(prev => (prev === tabFromUrl ? prev : tabFromUrl))
  }, [tabFromUrl])

  // 新規登録直後の ?created=1 は初回マウントでポップアップ判定に使った後、URLから除去
  // （リロードで再度開かないように）。setState せず replace のみなので副作用は安全。
  useEffect(() => {
    if (searchParams.get('created') == null) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('created')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '?', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // タブ切替時は URL を書き換えてリフレッシュ等で消えないようにする
  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }


  const addTaskModal = useModal()

  // prop側でdata更新があった場合はstateに反映
  useEffect(() => { setCaseState(caseDataProp) }, [caseDataProp])

  const handleSaved = () => {
    router.refresh()
  }

  // 戸籍請求の自動シード：戸籍業務が有効な案件で、依頼者の行だけを作る。
  //
  // 相続人は最初から分かっていることが少なく、依頼者の戸籍を読んで芋づる式に判明していく。
  // 全員ぶんを先に並べると、まだ取る必要のない行や、そもそも存在しない人の行が並んでしまう。
  // 2人目以降は戸籍請求タブの「戸籍を追加」からその場で足す（相続人一覧にも同時に登録される）。
  //
  // 取得区分は既定「自社取得」、請求先は本籍地から自動推定。
  // 案件番号の経路コードの取りこぼしを拾う。
  // /intake の下書きは経路が決まる前に採番するので XX で始まる。受注ルートを保存した時点で
  // 実コードに直しているが、それより前に作られた案件や、直す処理を通らずにルートが入った案件が残る。
  // 案件詳細を開いたときに、番号が XX のままでルートが入っていれば静かに直す。
  const fixNumberRef = useRef(false)
  useEffect(() => {
    if (fixNumberRef.current) return
    if (!isPendingRouteCaseNumber(caseState.case_number) || !caseState.order_route) return
    fixNumberRef.current = true
    ;(async () => {
      const r = await applyRouteToCaseNumber(createClient(), caseState.id, caseState.order_route)
      if (r.number) { showToast(`案件番号を ${r.number} に更新しました`, 'success'); handleSaved() }
      else if (r.error) showToast(`案件番号の更新に失敗: ${r.error}`, 'error')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseState.id, caseState.case_number, caseState.order_route])

  const kosekiSeededRef = useRef(false)
  useEffect(() => {
    if (kosekiSeededRef.current) return
    const roles = (caseState.intake_roles ?? []) as Array<{ gyomu?: string | null; owner?: string | null }>
    if (!roles.some(r => r.gyomu === '戸籍' && (r.owner ?? '') !== '不要')) return
    // 依頼者（heirs.is_client）。未設定なら被相続人から始める（依頼者が決まる前でも1行は要る）。
    const people: { name: string; office: string | null }[] = []
    const client = heirs.find(h => h.is_client && (h.name ?? '').trim())
    if (client) {
      people.push({ name: (client.name ?? '').trim(), office: kosekiOfficeFromAddress(client.registered_address ?? null) })
    } else {
      const dn = (caseState.deceased_name ?? '').trim()
      if (dn) people.push({ name: dn, office: kosekiOfficeFromAddress(caseState.deceased_registered_address ?? null) })
    }
    if (people.length === 0) return
    const existing = new Set(kosekiRequests.map(r => (r.target_person ?? '').trim()).filter(Boolean))
    const missing = people.filter(p => !existing.has(p.name))
    if (missing.length === 0) return
    kosekiSeededRef.current = true
    ;(async () => {
      const supabase = createClient()
      const base = kosekiRequests.length
      const rows = missing.map((p, i) => ({ case_id: caseState.id, target_person: p.name, acquirer: '自社', request_to: p.office, sort_order: base + i }))
      const { error } = await supabase.from('koseki_requests').insert(rows)
      if (!error) handleSaved()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseState.id, heirs.length, kosekiRequests.length])

  // 「このタスクを完了」→ まず注意（依頼のし忘れ等）を判定。該当なければそのまま完了モーダルへ。
  const handleCompleteClick = async (t: TaskRow) => {
    setCheckingCaution(true)
    try {
      const c = await getCompletionCaution(t, currentMemberId ?? null)
      if (c) setCaution(c)
      else setCompleteTaskOpen(true)
    } catch {
      setCompleteTaskOpen(true)  // 判定に失敗しても完了は妨げない
    } finally {
      setCheckingCaution(false)
    }
  }
  const cautionRequestNow = async () => {
    if (!caution) return
    setCautionBusy(true)
    try { await caution.request() } catch { /* 依頼失敗でも完了は進める */ }
    setCautionBusy(false)
    setCaution(null)
    setCompleteTaskOpen(true)
    handleSaved()
  }

  /** 案件フィールドの楽観的更新 */
  const patchCase = async (patch: Partial<CaseRow>) => {
    // 検討中→受託の「面談情報を更新せよ」ゲートは撤去（面談登録の簡素化に伴い）
    // 案件ステータス→「完了」ゲート：請求パターン別の入金完了条件を満たしていないと拒否＋ポップアップ。
    if (patch.status === '完了' && caseState.status !== '完了') {
      const supabase = createClient()
      const result = await checkCaseCompletable(supabase, caseState.id, caseState.billing_pattern)
      if (!result.ok) {
        setCompletionBlocked({ missing: result.missing, pendingRefunds: result.pendingRefunds, missingReferrals: result.missingReferrals, billingPattern: result.billingPattern, hasInvoices: result.hasInvoices })
        return
      }
    }
    const prev = caseState
    setCaseState(c => ({ ...c, ...patch }))
    const supabase = createClient()
    const { error } = await supabase.from('cases').update(patch).eq('id', caseState.id)
    if (error) {
      setCaseState(prev)
      showToast(`保存に失敗しました: ${error.message}`, 'error')
      return
    }
    // 受注／戻り受注に変わったら：受注日を自動セット（初期対応はアラートで通知するためタスク確認ポップアップは廃止）。
    // 閉じた後は常設の受託フロー・ナビゲーターがオーダーシート作成以降を順に案内する。
    if ((patch.status === '受注' || patch.status === '戻り受注') && prev.status !== patch.status) {
      if (!prev.order_received_date) {
        const today = new Date().toLocaleDateString('sv-SE')  // YYYY-MM-DD（ローカル）
        await supabase.from('cases').update({ order_received_date: today }).eq('id', caseState.id)
        setCaseState(c => ({ ...c, order_received_date: today }))
      }
      setNavDismissed(false)
      // 受注系にした瞬間 → 管理担当の割振り依頼ポップ（管理担当が未アサイン かつ 割り振らない指定でない ときだけ）
      // 割振り担当本人には出さない（自分で割り振れるので依頼する相手がいない）
      if (!managerAssigned && !caseState.manager_assign_skipped && !isDispatcher) setAssignReqOpen(true)
    }
    // （タスク出しは作業着手準備の「タスク出し」ゲートで管理担当が行うため、
    //   対応中化の際の「タスクを設定してください」ポップアップは廃止）
    // トリガーで他フィールドが更新されるフィールドは、refreshして最新を取得
    const needsRefresh = Object.keys(patch).some(k => TRIGGER_FIELDS.has(k))
    if (needsRefresh) {
      router.refresh()
    }
  }

  /** 受注系 → 作業着手準備 へ進める（進めた人のハンコを記録）。3ナビ完了後に手動で押す。 */
  const advanceToPrep = async () => {
    const myName = allMembers.find(m => m.id === currentMemberId)?.name ?? null
    await patchCase({ status: '作業着手準備', work_prep_advanced_at: new Date().toISOString(), work_prep_advanced_by: currentMemberId, work_prep_advanced_name: myName })
    setNavDismissed(true)
    showToast('作業着手準備に進めました', 'success')
  }

  /** 作業着手準備 → 作業進行中（着手OK）。事務管理ダッシュボードの「着手OK」と同じ処理。 */
  const advanceToWork = async () => {
    const myName = allMembers.find(m => m.id === currentMemberId)?.name ?? null
    await patchCase({ status: '対応中', work_start_ok_at: new Date().toISOString(), work_start_ok_by: currentMemberId, work_start_ok_name: myName })
    setNavDismissed(true)
    showToast('着手：作業進行中にしました', 'success')
  }

  // 面談情報タブからの保存。ステータス変更以外は「面談情報を更新した」印を立てる。
  // 面談担当が未設定なら、最初に面談情報を更新した人（＝今のログイン者）を自動で面談担当に設定。
  const patchCaseFromMeeting = (patch: Partial<CaseRow>) => {
    if ('status' in patch) return patchCase(patch)
    const ownerPatch = !caseState.meeting_owner_id && currentMemberId ? { meeting_owner_id: currentMemberId } : {}
    return patchCase({ ...patch, ...ownerPatch, meeting_info_updated_at: new Date().toISOString() })
  }

  /** 依頼者フィールドの楽観的更新 */
  const patchClient = async (patch: Record<string, unknown>) => {
    if (!caseState.client_id || !caseState.clients) return
    const prev = caseState.clients
    setCaseState(c => ({ ...c, clients: c.clients ? { ...c.clients, ...patch } as typeof c.clients : c.clients }))
    const supabase = createClient()
    const { error } = await supabase.from('clients').update(patch).eq('id', caseState.client_id)
    if (error) {
      setCaseState(c => ({ ...c, clients: prev }))
      showToast(`保存に失敗しました: ${error.message}`, 'error')
    }
  }

  // 最新のお客様やり取り日（要進捗連絡マーク用）
  const latestCommunicationDate = clientCommunications.length > 0
    ? clientCommunications.reduce((max, c) => (c.communicated_at > max ? c.communicated_at : max), clientCommunications[0].communicated_at)
    : null

  // この案件の受注/管理担当なら、自分の案件の受信簿を操作できる（開封・中身の紐付け）
  const viewerOwnsCase = caseMembers.some(cm => cm.member_id === currentMemberId && (cm.role === 'sales' || cm.role === 'manager' || cm.role === 'sub_manager'))
  // 受注より前（面談設定済・検討中・依頼確定待ち）で、まだオーダーシートを作り始めていない案件は
  // オーダーシートの位置に「面談シート」を出す。面談で聞き取った内容が案件詳細から辿れないため。
  // 「オーダーシートを作成」を押すと order_sheet_started_at が入り、次からはオーダーシートで開く。
  const PRE_ORDER_STATUSES = new Set(['面談設定済', '検討中', '検討中（契約書待ち）'])
  const [orderSheetOpened, setOrderSheetOpened] = useState(false)   // この画面で「作成」を押したか
  const [backToSheet, setBackToSheet] = useState(false)             // 「面談シートに戻る」を押したか
  const preOrder = PRE_ORDER_STATUSES.has(caseState.status)
  const showMeetingSheet = preOrder && (backToSheet || (!caseState.order_sheet_started_at && !orderSheetOpened))

  // 管理担当アサイン済か（対応中ガード用）
  const managerAssigned = caseMembers.some(cm => cm.role === 'manager')
  // 受注担当（進捗確認依頼の確認者＝依頼先）
  const salesMemberId = caseMembers.find(cm => cm.role === 'sales')?.member_id ?? null
  // 進捗確認の依頼は、この案件の管理担当（ログイン中の本人）だけが出せる
  // 案件報告はサブ管理担当も出せる（引継ぎ中・応援中でも報告は必要なため）
  const isCaseManager = !!currentMemberId && caseMembers.some(cm => (cm.role === 'manager' || cm.role === 'sub_manager') && cm.member_id === currentMemberId)
  // 契約手続き（契約関連書類）が全受信済か（対応中ガード用）
  const contractProcDone = isContractProcDone(contractDocuments)
  // 到着物ボタンの未対応件数（タスク紐づけ待ちの到着物数）
  const receiptContractCat = new Map((contractDocuments ?? []).map(d => [d.id, d.category ?? '']))
  const unhandledReceiptCount = countReceiptsNeedingLink(documentReceipts ?? [], receiptContractCat)
  // 検討中（契約書待ち）→受託 のゲート：契約手続き完了（初期対応タスク完了ゲートは撤去）
  const kentouContractReady = contractProcDone

  // 契約書類の受領（区分=契約 の書類が全部受領済/不要）。受注→準備ナビの「契約書類の受領」ゲート用。
  const contractDocsReceived = isContractDocsReceived(contractDocuments)

  // 受託フロー・ナビゲーター（受注時のみ）。各ステップの完了状態を算出。
  //   オーダーシート作成／管理担当アサイン／契約書類の受領／料金表入力・前受金請求書の発行。
  const flowSteps = getJutakuFlowSteps({
    managerAssigned,
    orderSheetFinalized: !!caseState.order_sheet_finalized_at,
    contractDocsReceived,
    advanceInvoiceIssued,
    skipManagerAssign: !!caseState.manager_assign_skipped,
  })
  // 受注ナビの4件が全部完了しているか。ステータスを手で「作業着手準備」に変えられないようにする。
  const workPrepReady = flowSteps.every(s => s.done)
  // 検討中（契約書待ち）→受託 のフロー・ナビゲーター（契約手続き完了）
  const kentouSteps = getKentouContractFlowSteps({ contractProcDone })
  // 作業着手準備 → 作業進行中 のフロー・ナビゲーター。
  //   オーダーシート最終化／タスク出し／前受金の入金／ファイル化（事務管理ダッシュボードで済）。
  const workPrepSteps = getWorkPrepFlowSteps({
    advancePaid,
    filed: caseState.filing_status === '済',
  })
  // 作業進行中（作業進行中）で開いたとき：初期タスク出しの単一ゲート（タスク作成を促す。1件でも作れば消える）。
  const initialTasksGenerated = tasks.some(t => t.task_kind === 'case')
  const initialTasksSteps = getInitialTasksFlowSteps({ tasksGenerated: initialTasksGenerated })
  const jutakuNavVisible = (caseState.status === '受注' || caseState.status === '戻り受注') && !navDismissed
  const kentouNavVisible = caseState.status === '検討中（契約書待ち）' && !navDismissed
  const workPrepNavVisible = caseState.status === '作業着手準備' && !navDismissed
  // 作業進行中は「初期タスク出し」だけを案内（タスク未生成のときのみ）。ステータスは進めない。
  const wipNavVisible = caseState.status === '対応中' && !navDismissed && !initialTasksGenerated
  // 着手ナビ：対応中なのにまだ着手していない（案件タスクが1つも対応中/完了でない）とき、
  // 案件進捗タブを点滅させて「ここで着手」を促す（受託/検討フローと同じ見せ方）。
  const normTaskStatus = (s: string) => s === '未着手' ? '着手前' : ['Wチェック待ち', '保留'].includes(s) ? '対応中' : s === 'キャンセル' ? '完了' : s
  // 初期タスク出しが済んでから（=wipNavが消えてから）着手を促す。二重ハイライトを避ける。
  const kickoffNeeded = caseState.status === '対応中' && initialTasksGenerated
    && !tasks.some(t => t.task_kind !== 'system' && ['対応中', '完了'].includes(normTaskStatus(t.status)))
  // 順不同のため、未完了ステップのタブをすべて同時ハイライト
  const activeNavSteps = jutakuNavVisible ? flowSteps : kentouNavVisible ? kentouSteps : workPrepNavVisible ? workPrepSteps : wipNavVisible ? initialTasksSteps : []
  // 管理担当ビュー: 作業進行中(=対応中)に引き継がれた直後で管理担当未アサインなら『案件情報→担当者』を強調。
  //   isManagerViewer は下方で定義するため、ここでは viewerRole から直接判定して先読みする。
  const isManagerViewerEarly = viewerRole === 'manager' || viewerRole === 'sub_manager'
  // 割振り担当には、どのステータスでも管理担当が空なら『担当者』タブを光らせる
  // （通知から来てすぐアサインできるように）。
  const managerAssignNav = !managerAssigned && !caseState.manager_assign_skipped
    && (isDispatcher || (isManagerViewerEarly && caseState.status === '対応中'))
  const navHighlightTabs: TabKey[] = [
    ...activeNavSteps.filter(s => !s.done).flatMap(s => s.targets.map(t => t.tab)),
    ...(kickoffNeeded ? ['progress' as TabKey] : []),
    ...(managerAssignNav ? ['assignees' as TabKey] : []),
  ]

  // 受注区分→選択業務 で許可される実務タブ（service_category 設定時のみ出し分け）。
  // 並行進行モデルのため段階表示は無し：選択業務に対応する全タブを最初から表示。
  const selectedGyomu = [...new Set((caseState.intake_roles ?? []).map(r => r.gyomu).filter(Boolean))]
  const allowedPracticeTabs = caseState.service_category
    ? ([...new Set(selectedGyomu.map(g => GYOMU_TAB[g]).filter(Boolean))] as TabKey[])
    : undefined

  // ステータス連動＋業務連動のタブ表示制御
  const tabVisRaw = getCaseTabVisibility({
    status: caseState.status,
    orderSheetCompleted: !!caseState.order_sheet_completed_at,
    referralPartnerCount: caseReferrals?.length ?? 0,
    allowedPracticeTabs,
  })
  // 管理担当（manager/sub_manager）は事務作業タブを見せず、管理担当が担う業務に絞る。
  //   オーダーシート（案件情報）／進捗サマリー／依頼者連絡／管理担当の実務タブ（受注区分で出し分け）
  //   ／法定相続一覧図／他事業者紹介／請求／タスク。案件進捗(basicInfo)は撤去。
  // ※システム管理者(system_manager)や受注担当・事務管理担当は従来どおり全タブ。
  const isManagerViewer = viewerRole === 'manager' || viewerRole === 'sub_manager'
  const isSalesViewer = viewerRole === 'sales'
  // 実務タブは事務管理担当と同じものを出す（この案件の受注区分→業務で許可されたもの全部）。
  // 以前は管理担当が手を動かすタブ（遺言・信託・遺産承継など）だけに絞っていたが、
  // 管理担当は戸籍や財産調査の中身も見て進捗を確認するため、絞らないことにした。
  const managerPractice = tabVisRaw.visible.filter(t => TAB_GROUP[t] === 'practice')
  // 末尾に 案件情報 グループ (assignees/ownerSales/meeting) を追加。CaseTabs 側で InfoDropdown「案件情報」にまとめて表示される。
  // 到着物は管理担当も見る（受信の状況を確認する）。W-Check自体は事務管理の作業。
  // 契約手続きは案件報告の右。受注後の契約書類の回収状況は管理担当も見るため。
  // ただし対応中・完了では受注担当と同じく「その他」へ畳む（そこまでに終わっている前提）。
  //
  // 他事業者紹介と納品は作業が始まってから。受注してから着手までのあいだに使う場面がなく、
  // タブが増えるだけになるため、対応中・完了でだけ出す。
  const managerBeforeWork = ['面談設定済', '検討中', '検討中（契約書待ち）', '受注', '戻り受注', '作業着手準備'].includes(caseState.status)
  const MANAGER_TABS: TabKey[] = [...new Set<TabKey>([
    'orderSheet', 'progress',
    ...(managerBeforeWork ? ['contractProc' as TabKey] : []),
    'clientInfo', ...managerPractice,
    ...(managerBeforeWork ? [] : ['referral' as TabKey, 'delivery' as TabKey]),
    'contract', 'tasks', 'receipts', 'assignees', 'ownerSales', 'meeting',
  ])]
  // 管理担当の固定タブを使わない場面：
  //   面談設定済 … まだ受注していないので通常構成（請求・納品まで並ぶのは早すぎる）
  //   失注・紹介のみ … その案件で管理担当がやることが無い。他のロールと同じ最小構成に揃える
  const managerFixedTabs = isManagerViewer
    && caseState.status !== '面談設定済' && caseState.status !== '失注' && caseState.status !== '紹介のみ'

  // 事務管理担当には、管理担当が手を動かす実務タブを既定で出さない（持ち場が違う）。
  // 見たいときだけ「管理担当のタブも表示」で出せるようにして、閉じ込めない。
  const isAssistantViewer = viewerRole === 'assistant'
  // 遺産分割は事務管理も使う（協議書を作るのは事務管理）ので出す。
  // 相続登記は受領するだけ＝到着物受信簿で処理する話なので出さない。遺産承継も管理担当の持ち場。
  const MANAGER_ONLY_PRACTICE: TabKey[] = ['legalInfo', 'will', 'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'succession', 'referral', 'letter', 'execution', 'contractCreate', 'registration']
  const [showManagerTabs, setShowManagerTabs] = useState(false)
  const hideForAssistant = (v: TabVisibility): TabVisibility =>
    (!isAssistantViewer || showManagerTabs)
      ? v
      : { visible: v.visible.filter(t => !MANAGER_ONLY_PRACTICE.includes(t) || t === activeTab), collapsed: v.collapsed }

  // タスクタブの数字＝その人が「いま手をつけられる数」。
  // 未着手を全部数えると、やっていないタスクが山ほどあるように見えて焦るため。
  //   事務管理担当 … 事務管理タスクの着手OK
  //   受注担当     … その他タスク（随時）の未完了。その他には着手OKのフラグが無いため
  //   管理担当     … 業務タスクの着手OK ＋ その他タスクの未完了
  // ※「その他」は受注担当ぶん・管理担当ぶんを分けずに数える（タブが両方まとめて出しているため）。
  const tabTaskCount = (() => {
    const rr = toReadinessReceipts(documentReceipts ?? [])
    const open = tasks.filter(t => normalizeTaskStatus(t.status) !== '完了')
    const system = open.filter(t => t.task_kind === 'system')
    const otherOpen = system.filter(t => systemTaskGroup(t) === 'other').length
    if (isSalesViewer) return otherOpen
    if (isManagerViewer) {
      const gyomuReady = system.filter(t => systemTaskGroup(t) === 'gyomu' && getStartSignal(t, rr).ready).length
      return gyomuReady + otherOpen
    }
    return open.filter(t => t.task_kind === 'case' && getStartSignal(t, rr).ready).length
  })()

  // 隠している管理担当タブの数（トグルの表示判定・件数表示に使う）
  const hiddenManagerTabCount = isAssistantViewer
    ? tabVisRaw.visible.filter(t => MANAGER_ONLY_PRACTICE.includes(t) && t !== activeTab).length
    : 0

  // 経理・LP担当は持ち場に絞る。権限で塞ぐのではなく、実務タブが全部並ぶと
  // 自分の仕事の場所が分からなくなるため（見たいときは案件基本情報から辿れる）。
  const ACCOUNTING_TABS: TabKey[] = ['orderSheet', 'contract', 'clientInfo', 'ownerSales', 'assignees', 'receipts', 'docs', 'documentCreate']
  const isBackOfficeViewer = viewerRole === 'accounting' || viewerRole === 'lp'
  const tabVis = managerFixedTabs
    ? { visible: MANAGER_TABS, collapsed: [] as TabKey[] }
    : isBackOfficeViewer
      ? { visible: tabVisRaw.visible.filter(t => ACCOUNTING_TABS.includes(t)), collapsed: [] as TabKey[] }
      : hideForAssistant(tabVisRaw)
  // 現在のタブが表示対象外なら先頭タブにフォールバック。ただし docs/documentCreate はヘッダーから開く特別タブなので許容。
  const HEADER_TABS: TabKey[] = ['receipts', 'docs', 'documentCreate']
  const effectiveTab: TabKey = (tabVis.visible.includes(activeTab) || HEADER_TABS.includes(activeTab)) ? activeTab : tabVis.visible[0]
  // 開いているタブの持ち場（ベージュ=オーダーシート／ピンク=事務管理／緑=管理担当）
  const tabTone = toneOfTab(effectiveTab)
  // 検討中〜受注（＋失注）は固定順のフラット表示（グループ分けせず指定順のピルで見せる）
  const FLAT_ORDER_STATUSES = ['検討中', '検討中（契約書待ち）', '受注', '戻り受注', '失注']
  const flatOrderTabs = FLAT_ORDER_STATUSES.includes(caseState.status ?? '')

  // 実施タブ（受注区分/業務由来）で、紐づくタスクが全件完了しているものは折り畳み対象。
  // タスクは task.phase(=業務区分文字列) から GYOMU_TAB マッピングで所属タブを判定。
  const completedPracticeTabs: TabKey[] = (() => {
    const totalByTab = new Map<TabKey, number>()
    const openByTab = new Map<TabKey, number>()
    for (const t of tasks) {
      const gyomu = stripGyomu(t.phase)
      const tab = GYOMU_TAB[gyomu]
      if (!tab) continue
      totalByTab.set(tab, (totalByTab.get(tab) ?? 0) + 1)
      if (t.status !== '完了' && t.status !== 'キャンセル') {
        openByTab.set(tab, (openByTab.get(tab) ?? 0) + 1)
      }
    }
    const result: TabKey[] = []
    for (const [tab, total] of totalByTab) {
      if (total > 0 && (openByTab.get(tab) ?? 0) === 0) result.push(tab)
    }
    return result
  })()

  // タスク詳細から ?task= で来たとき、実務タブ上に「このタスクを完了」バーを出す（戻らず完了）。
  const focusTaskId = searchParams.get('task')
  const focusTask = focusTaskId ? tasks.find(t => t.id === focusTaskId) : undefined
  const focusTaskActive = !!focusTask && normalizeTaskStatus(focusTask.status) !== '完了'
  // 完了バーを閉じる＝URLから task/focus を外す（作業を中断・完了しない）
  const dismissFocusTask = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('task'); params.delete('focus')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '?', { scroll: false })
  }

  return (
    <CaseComposeProvider caseData={caseState} allMembers={allMembers} currentMemberId={currentMemberId} salesMemberId={salesMemberId} canRequestReview={isCaseManager}>
    <div>
      <CaseHeader
        caseData={caseState}
        latestCommunicationDate={latestCommunicationDate}
        caseAlerts={caseAlerts}
        tasks={tasks}
        statusHistory={statusHistory}
        selectableStatuses={getSelectableCaseStatuses(!!caseState.order_sheet_completed_at, caseState.status, managerAssigned, true, contractProcDone, kentouContractReady, workPrepReady)}
        onStatusChange={s => patchCase({ status: s })}
        referrals={caseReferrals ?? []}
        onJumpToReferral={() => {
          setActiveTab('orderSheet')
          setTimeout(() => document.getElementById('os-referral')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
        }}
        showReceiptsAction
        receiptCount={unhandledReceiptCount}
        receiptTotal={(documentReceipts ?? []).reduce((n, r) => n + (r.items?.length ?? 0), 0)}
        showDocsAction
        showDocumentCreateAction={true}
        docCount={caseFiles.length + createdDocuments.filter(d => !!d.file_path).length}
        highlightTabs={navHighlightTabs}
        onActivateTab={setActiveTab}
        caseMembers={caseMembers}
        allMembers={allMembers}
        reopenCount={reopenCount}
      />

      {/* 実務タブでタスクを完了するバー（タスク詳細から ?task= で来たとき） */}
      {focusTask && focusTaskActive && (
        <div className="sticky top-0 z-30 mb-3 flex items-center gap-3 bg-brand-600 text-white rounded-lg px-4 py-2.5 shadow-md">
          <ListChecks className="w-5 h-5 flex-none" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-brand-100">作業中のタスク</div>
            <div className="text-[13px] font-bold truncate">{focusTask.title}</div>
            {/* 作業内容（作業指示）。タスク詳細に戻らなくても、何をする作業か読めるようにする。 */}
            {focusTask.procedure_text && (
              <p className="text-[11.5px] text-brand-50/90 leading-snug whitespace-pre-wrap mt-0.5 max-h-[3.2em] overflow-y-auto pr-1"
                title={focusTask.procedure_text}>
                {focusTask.procedure_text}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleCompleteClick(focusTask)}
            disabled={checkingCaution}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-brand-700 bg-white hover:bg-brand-50 shadow-sm flex-none disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />このタスクを完了
          </button>
          <Link href={`/tasks/${focusTask.id}`} className="text-[11px] text-brand-100 hover:text-white underline flex-none">タスク詳細</Link>
          <button
            type="button"
            onClick={dismissFocusTask}
            title="このバーを閉じる（作業を中断・完了しない）"
            className="flex-none p-1 rounded text-brand-100 hover:text-white hover:bg-white/10"
            aria-label="バーを閉じる"
          >
            <X className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>
      )}

      {caution && (
        <CompletionCautionModal
          caution={caution}
          busy={cautionBusy}
          onRequest={cautionRequestNow}
          onProceed={() => { setCaution(null); setCompleteTaskOpen(true) }}
          onClose={() => setCaution(null)}
        />
      )}

      {completeTaskOpen && focusTask && (
        <CompleteTaskModal
          task={focusTask}
          onClose={() => setCompleteTaskOpen(false)}
          onCompleted={() => { setCompleteTaskOpen(false); handleSaved(); dismissFocusTask() }}
        />
      )}

      <div ref={navWrapRef} className="relative">
        <CaseTabs
          activeTab={effectiveTab}
          onTabChange={setActiveTab}
          taskCount={tabTaskCount}
          visibleTabs={tabVis.visible}
          collapsedTabs={tabVis.collapsed}
          highlightTabs={navHighlightTabs}
          completedTabs={completedPracticeTabs}
          groupInfoTabs={caseState.status === '対応中' || caseState.status === '完了'}
          flatOrder={flatOrderTabs}
          labelOverrides={showMeetingSheet ? { orderSheet: '面談シート' } : undefined}
        />

        {/* 事務管理担当：管理担当が手を動かすタブは既定で隠している。見たいときだけ出す。 */}
        {isAssistantViewer && hiddenManagerTabCount > 0 && (
          <div className="flex justify-end -mt-3 mb-3">
            <button type="button" onClick={() => setShowManagerTabs(v => !v)}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 hover:text-brand-700 border border-gray-200 rounded-md px-2 py-1 bg-white">
              {showManagerTabs ? '管理担当のタブを隠す' : `管理担当のタブも表示（${hiddenManagerTabCount}）`}
            </button>
          </div>
        )}

        {/* 受託フロー・ナビゲーター：受注案件を開くたび、作業着手準備への前提条件（OS作成/契約書類受領/料金表・前受金請求）を案内 */}
        {jutakuNavVisible && (
          <StatusFlowNavigator
            steps={flowSteps}
            targetLabel="作業着手準備"
            advanceLabel="作業着手準備へ進む"
            onAdvance={advanceToPrep}
            onDismiss={() => setNavDismissed(true)}
          />
        )}

        {/* 検討フロー・ナビゲーター：依頼確定待ちで、受注への前提条件（契約残手続き＋タスク）を案内。
            ※ここは「依頼確定待ち→受注」の通常受注（order_win_type=null）。即受注/面談なし受注は面談設定済からの獲得区分で別物。 */}
        {kentouNavVisible && (
          <StatusFlowNavigator
            steps={kentouSteps}
            targetLabel="受注"
            onAdvance={() => patchCase({ status: '受注' })}
            onDismiss={() => setNavDismissed(true)}
          />
        )}

        {/* 作業着手準備ナビ：管理担当/契約書類/前受金/ファイル化が揃えば「作業進行中（着手）」へ。
            受注系ナビと同じ見せ方。準備状況は事務管理担当ダッシュボードで管理する。 */}
        {workPrepNavVisible && (
          <StatusFlowNavigator
            steps={workPrepSteps}
            targetLabel="作業進行中"
            advanceLabel="着手（作業進行中へ）"
            onAdvance={advanceToWork}
            onDismiss={() => setNavDismissed(true)}
          />
        )}

        {/* 作業進行中ナビ：初期タスク出しの単一ゲートだけを案内（ステータスは進めない＝advance非表示）。 */}
        {wipNavVisible && (
          <StatusFlowNavigator
            steps={initialTasksSteps}
            hideAdvance
            onAdvance={() => {}}
            onDismiss={() => setNavDismissed(true)}
            incompleteTitle="作業を始める前に：初期タスク出し"
            incompleteSub="点滅している「タスク」タブを開いて、案件のタスクを作成してください。"
            completeTitle="初期タスクを出しました"
            completeSub="タスクタブから作業を進めてください。"
          />
        )}

        {/* タブ↔ナビの箱を結ぶリードライン（最後に描画して最前面に） */}
        {(jutakuNavVisible || kentouNavVisible || workPrepNavVisible || wipNavVisible) && <NavConnectors wrapRef={navWrapRef} deps={navHighlightTabs.join(',')} />}

        {/* 管理担当ビュー: 引継直後で管理担当が未アサインなら『案件情報→担当者』への誘導バナーを表示 */}
        {managerAssignNav && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-[13px] text-brand-800">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-bold">!</span>
            <span className="font-semibold">受注担当から引き継がれました。管理担当をアサインしてください</span>
            <button type="button" onClick={() => setActiveTab('assignees')} className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700">案件情報 → 担当者 を開く →</button>
          </div>
        )}
      </div>

      {/* 開いているタブの持ち場で地色を変える（ベージュ=オーダーシート／ピンク=事務管理／緑=管理担当）。
          色を敷くのはタブの中身だけ。ヘッダー・タブ行までは白のままにする。
          表やサブタブのレールは白で敷いてあるので、地色は余白にだけ出る。 */}
      <div className={tabTone ? `case-tone ${TONE_BG[tabTone]} -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-8 min-h-[60vh]` : ''}>

      {/* 受注前でまだ作り始めていない案件は、この位置に面談シートを出す */}
      {effectiveTab === 'orderSheet' && showMeetingSheet && (
        <CaseMeetingSheetPanel
          caseData={caseState}
          patchCase={patchCase}
          patchClient={patchClient}
          caseClients={caseClients ?? []}
          heirs={heirs}
          properties={properties}
          financialAssets={financialAssets}
          otherAssets={otherAssets}
          currentMemberId={currentMemberId}
          onRefresh={handleSaved}
          onStartOrderSheet={() => {
            setCaseState(c => ({ ...c, order_sheet_started_at: new Date().toISOString() }))
            setBackToSheet(false)
            setOrderSheetOpened(true)
          }}
        />
      )}
      {effectiveTab === 'orderSheet' && !showMeetingSheet && (
        <>
        {preOrder && (
          <button type="button" onClick={() => setBackToSheet(true)}
            className="mb-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border-b border-dotted border-brand-400">
            ← 面談シートに戻る
          </button>
        )}
        <OrderSheet
          caseData={caseState}
          patchCase={patchCase}
          patchClient={patchClient}
          onRefresh={handleSaved}
          heirs={heirs}
          kosekiRequests={kosekiRequests}
          properties={properties}
          acquisitions={acquisitions}
          financialAssets={financialAssets}
          otherAssets={otherAssets}
          divisionDetails={divisionDetails}
          agreementDispatches={agreementDispatches}
          expenses={expenses}
          tasks={tasks}
          clientCommunications={clientCommunications}
          referrals={caseReferrals ?? []}
          caseClients={caseClients ?? []}
          contractDocuments={contractDocuments}
          sagyoDocuments={sagyoDocuments}
          receipts={documentReceipts ?? []}
          meetingMemos={whiteboardMemos}
        />
        </>
      )}
      {effectiveTab === 'progress' && (() => {
        // 通知遷移で ?sub=report|memo&openReport=<id> が来たら該当サブタブ＋確認モーダルを自動オープン
        const subParam = searchParams.get('sub')
        const initSub = subParam === 'report' || subParam === 'memo' || subParam === 'office' || subParam === 'board' || subParam === 'complaint' ? subParam : undefined
        const openReportId = searchParams.get('openReport')
        const autoOpenPending = searchParams.get('approve') === '1'
        return (
          <ProgressBoard
            board={buildProgressBoard(caseState, tasks, financialAssets)}
            detail={buildProgressDetail({
              tasks, kosekiRequests, acquisitions, properties, financialAssets,
              today: new Date().toLocaleDateString('sv-SE'),
            })}
            dealName={caseState.deal_name ?? ''}
            caseData={caseState}
            tasks={tasks}
            allMembers={allMembers}
            currentMemberId={currentMemberId}
            salesMemberId={salesMemberId}
            canRequestReview={isCaseManager}
            initialSub={initSub}
            openReportId={openReportId}
            autoOpenPending={autoOpenPending}
            // 「事務管理進捗」(案件進捗=BasicInfoTab)を 案件進捗タブ内のサブタブとして表示。
            // 受注担当ビューでも 管理担当と同じ5サブタブ(進捗サマリー/事務管理進捗/案件報告/報連相・メモ/不満・クレーム)にする。
            renderOfficeProgress={() => (
              <BasicInfoTab embedded caseData={caseState} tasks={tasks} properties={properties} allMembers={allMembers} currentMemberId={currentMemberId} patchCase={patchCase} documentReceipts={documentReceipts} contractDocuments={contractDocuments} managerAssigned={managerAssigned} contractProcDone={contractProcDone} salesMemberId={salesMemberId} canRequestReview={isCaseManager} />
            )}
          />
        )
      })()}
      {effectiveTab === 'basicInfo' && (
        <BasicInfoTab caseData={caseState} tasks={tasks} properties={properties} allMembers={allMembers} currentMemberId={currentMemberId} patchCase={patchCase} documentReceipts={documentReceipts} contractDocuments={contractDocuments} managerAssigned={managerAssigned} contractProcDone={contractProcDone} salesMemberId={salesMemberId} canRequestReview={isCaseManager} />
      )}
      {effectiveTab === 'ownerSales' && (
        <OwnerSalesTab caseData={caseState} patchCase={patchCase} />
      )}
      {effectiveTab === 'assignees' && (
        <AssigneesTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'contractProc' && (
        <ContractProcTab caseId={caseState.id} contractDocuments={contractDocuments} documentReceipts={documentReceipts} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'letter' && (
        <FreeWorkTab caseData={caseState} gyomu="letter" title="手紙" patchCase={patchCase} />
      )}
      {effectiveTab === 'execution' && (
        <FreeWorkTab caseData={caseState} gyomu="execution" title="執行通知" patchCase={patchCase} />
      )}
      {effectiveTab === 'contractCreate' && (
        <FreeWorkTab caseData={caseState} gyomu="contractCreate" title="契約書作成" description="契約書を作る作業です（残手続きとは別。項目は今後増やします）。" patchCase={patchCase} />
      )}
      {effectiveTab === 'meeting' && (
        <MeetingInfoTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} onRefresh={handleSaved} patchCase={patchCaseFromMeeting} referrals={caseReferrals ?? []} tasks={tasks} contractDocuments={contractDocuments} contractProcDone={contractProcDone} />
      )}
      {effectiveTab === 'clientInfo' && (
        <ClientInfoTab caseData={caseState} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={handleSaved} caseClients={caseClients ?? []} allMembers={allMembers} currentMemberId={currentMemberId} salesMemberId={salesMemberId} />
      )}
      {effectiveTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onAddTask={addTaskModal.open} documentReceipts={documentReceipts} caseStatus={caseState.status} financeAssets={financialAssets} hideCaseTasks={isManagerViewer && caseState.status !== '作業着手準備'} />
      )}
      {effectiveTab === 'deceased' && (
        <DeceasedTab caseData={caseState} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={handleSaved} patchCase={patchCase} contractDocuments={contractDocuments} caseClients={caseClients} documentReceipts={documentReceipts} tasks={tasks} />
      )}
      {effectiveTab === 'legalInfo' && (
        <LegalInfoTab caseData={caseState} patchCase={patchCase} tasks={tasks} documentReceipts={documentReceipts} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'contract' && (
        <ContractTab caseData={caseState} expenses={expenses} tasks={tasks} onRefresh={handleSaved} patchCase={patchCase} referrals={caseReferrals ?? []} />
      )}
      {effectiveTab === 'succession' && (
        <SuccessionTab caseData={caseState} heirs={heirs} assetInventory={assetInventory} tasks={tasks} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'assets' && (
        <AssetsTab caseData={caseState} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} assetInventory={assetInventory} otherAssets={otherAssets} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} contractDocuments={contractDocuments} documentReceipts={documentReceipts} tasks={tasks} />
      )}
      {effectiveTab === 'division' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} heirs={heirs} assetInventory={assetInventory} agreementDispatches={agreementDispatches} onRefresh={handleSaved} patchCase={patchCase} tasks={tasks} mode="division" />
      )}
      {effectiveTab === 'will' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} tasks={tasks} mode="will" />
      )}
      {effectiveTab === 'registration' && (
        <RegistrationTab caseData={caseState} properties={properties} onRefresh={handleSaved} patchCase={patchCase} contractDocuments={contractDocuments} tasks={tasks} />
      )}
      {effectiveTab === 'cancellation' && (
        <CancellationTab caseId={caseState.id} caseData={caseState} financialAssets={financialAssets} onRefresh={handleSaved} receipts={documentReceipts} tasks={tasks} />
      )}
      {PROCEDURE_TABS.map(p => effectiveTab === p.tab && (
        <PracticeProcedureTab key={p.tab} caseData={caseState} patchCase={patchCase} gyomu={p.gyomu} title={p.title} description={p.description} court={p.court} trust={p.trust} mediation={p.mediation} heirs={heirs} tasks={tasks} sagyoDocuments={sagyoDocuments} receipts={documentReceipts ?? []} onRefresh={handleSaved} />
      ))}
      {effectiveTab === 'referral' && (
        <ReferralTab caseData={caseState} referrals={caseReferrals ?? []} tasks={tasks} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'receipts' && (
        <DocsTab mode="receipts" caseData={caseState} documents={documents} documentReceipts={documentReceipts} tasks={tasks} contractDocuments={contractDocuments} caseFiles={caseFiles} createdDocuments={createdDocuments} currentMemberId={currentMemberId} canOperateReceipts={viewerOwnsCase} />
      )}
      {effectiveTab === 'docs' && (
        <DocsTab mode="folder" caseData={caseState} documents={documents} documentReceipts={documentReceipts} tasks={tasks} contractDocuments={contractDocuments} caseFiles={caseFiles} createdDocuments={createdDocuments} currentMemberId={currentMemberId} />
      )}
      {effectiveTab === 'documentCreate' && (
        <DocumentCreateTab caseData={caseState} tasks={tasks} heirs={heirs} properties={properties} kosekiRequests={kosekiRequests} contractDocuments={contractDocuments} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'delivery' && (
        <DeliveryTab caseData={caseState} currentMemberId={currentMemberId} canManage={isCaseManager} heirs={heirs} tasks={tasks} />
      )}

      </div>{/* /地色ラッパー */}

      {/* 検討中→（契約書待ち）/受託 へ進む前に、面談情報の更新を促すゲート */}
      <Modal
        isOpen={!!meetingGate}
        onClose={() => setMeetingGate(null)}
        title="面談情報を入力してください"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMeetingGate(null)}>キャンセル</Button>
            <Button variant="primary" onClick={() => { setMeetingGate(null); setActiveTab('meeting') }}>面談情報タブを開く</Button>
          </>
        }
      >
        <p className="text-[14px] text-gray-700 leading-relaxed">
          「{meetingGate}」へ進むには、最新の<strong>面談情報</strong>の入力が必要です。<br />
          お客様の回答を受けて確定した内容（受注区分など）を、<strong>面談情報タブで更新・保存</strong>してから進めてください。
        </p>
      </Modal>

      {/* 案件ステータス→「業務完了」ゲート：前受金・確定請求・立替実費が発行済でなければ完了不可。
          他事業者紹介の報酬請求は案件の業務とは別に動くのでゲートに含めない。 */}
      <Modal
        isOpen={!!completionBlocked}
        onClose={() => setCompletionBlocked(null)}
        title="請求が完了していないため、業務完了にできません"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompletionBlocked(null)}>閉じる</Button>
            <Button variant="primary" onClick={() => { setCompletionBlocked(null); setActiveTab('contract') }}>請求タブを開く</Button>
          </>
        }
      >
        {completionBlocked && (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-700 leading-relaxed">
              請求パターン <strong>{billingPatternLabel(completionBlocked.billingPattern)}</strong> では、下記が全て解消してから業務完了にできます。<br />
              <span className="text-[11.5px] text-gray-500">※ 会計上、請求書発行=売掛計上=請求完了として扱います。入金待ち/入金済 の追跡は 請求・入金 タブ・経理タブで並行します。</span>
            </p>

            {/* 未発行の請求 */}
            {completionBlocked.missing.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-gray-600 mb-1">未発行の請求</div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-gray-600">請求種別</th>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-gray-600">司/行</th>
                        <th className="px-2.5 py-1.5 text-right font-semibold text-gray-600">金額</th>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-gray-600">状態</th>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-gray-600">期日</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {completionBlocked.missing.map(m => (
                        <tr key={m.id}>
                          <td className="px-2.5 py-1.5 text-gray-800">{m.typeLabel}</td>
                          <td className="px-2.5 py-1.5 text-gray-600">{m.firmLabel || '—'}</td>
                          <td className="px-2.5 py-1.5 text-right font-mono">{m.amount > 0 ? `¥${m.amount.toLocaleString()}` : '—'}</td>
                          <td className="px-2.5 py-1.5"><span className="inline-flex px-1.5 py-0.5 rounded text-[11px] bg-amber-50 text-amber-800 border border-amber-200">{m.status}</span></td>
                          <td className="px-2.5 py-1.5 font-mono text-gray-600">{m.due_date ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 未処理の返金 */}
            {completionBlocked.pendingRefunds.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-gray-600 mb-1">未処理の返金</div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 overflow-hidden">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-rose-100/60">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-rose-800">申請日</th>
                        <th className="px-2.5 py-1.5 text-right font-semibold text-rose-800">返金額</th>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-rose-800">理由</th>
                        <th className="px-2.5 py-1.5 text-left font-semibold text-rose-800">状態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {completionBlocked.pendingRefunds.map(r => (
                        <tr key={r.id}>
                          <td className="px-2.5 py-1.5 font-mono text-rose-800">{r.requested_date}</td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-rose-800">{(r.refund_amount ?? 0) > 0 ? `¥${(r.refund_amount ?? 0).toLocaleString()}` : '—'}</td>
                          <td className="px-2.5 py-1.5 text-rose-800">{r.reason_category ?? '—'}</td>
                          <td className="px-2.5 py-1.5"><span className="inline-flex px-1.5 py-0.5 rounded text-[11px] bg-rose-100 text-rose-800 border border-rose-200">{refundStageLabel(r.approval_status, r.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {completionBlocked.missing.length === 0 && completionBlocked.pendingRefunds.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                請求情報の読み込みに失敗しました。時間を置いて再度お試しください。
              </div>
            )}

            <p className="text-[11.5px] text-gray-500 leading-relaxed">
              請求パターン別の必要請求：③一括のみ＝前受金／②一括+実費＝前受金＋立替実費（発生分）／①段階請求＝前受金＋確定請求＋立替実費（発生分）。<br />
              未実行の返金依頼（承認待ち／承認済で経理未実行）がある間も業務完了にできません。<br />
              請求パターンは請求タブから変更できます。
            </p>
          </div>
        )}
      </Modal>

      {handoffOpen && (
        <HandoffModal
          isOpen
          onClose={() => setHandoffOpen(false)}
          caseId={caseState.id}
          salesMemberId={salesMemberId}
          allMembers={allMembers}
          onDone={handleSaved}
        />
      )}

      <AssignRequestModal
        isOpen={assignReqOpen}
        onClose={() => setAssignReqOpen(false)}
        caseId={caseState.id}
        caseNumber={caseState.case_number}
        dealName={caseState.deal_name ?? ''}
        allMembers={allMembers}
        onDone={handleSaved}
        onSkip={() => { setCaseState(c => ({ ...c, manager_assign_skipped: true })); handleSaved() }}
      />

      {/* タスク追加。左タブ＝この案件の候補（実務タブの行と紐づく）／右タブ＝自分で入力。 */}
      <AddTaskModal
        isOpen={addTaskModal.isOpen}
        onClose={addTaskModal.close}
        caseId={caseState.id}
        allMembers={allMembers}
        onSaved={handleSaved}
        candidates={
          <TaskCandidatePanel
            caseId={caseState.id}
            deceasedName={caseState.deceased_name}
            intakeRoles={(caseState.intake_roles ?? []) as RoleRow[]}
            serviceCategory={caseState.service_category}
            serviceCategory2={caseState.service_category_2}
            taskTemplates={taskTemplates}
            existingTasks={tasks}
            caseReferrals={caseReferrals ?? []}
            kosekiRequests={kosekiRequests}
            properties={properties}
            financialAssets={financialAssets}
            heirs={heirs}
            caseClients={caseClients ?? []}
            viewerRole={viewerRole}
            onSaved={handleSaved}
          />
        }
      />

    </div>
    </CaseComposeProvider>
  )
}

// タブ↔ナビゲーターの各ステップ箱を曲線リードラインで結ぶオーバーレイ。
// data-nav-tab（点滅タブ）と data-nav-step（同じタブを指すステップ箱）を突き合わせて描画。
function NavConnectors({ wrapRef, deps }: { wrapRef: RefObject<HTMLDivElement | null>; deps: string }) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([])
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0
    const compute = () => {
      const base = el.getBoundingClientRect()
      const next: { x1: number; y1: number; x2: number; y2: number }[] = []
      el.querySelectorAll<HTMLElement>('[data-nav-step]').forEach(stepEl => {
        const tab = stepEl.getAttribute('data-nav-step')
        // 対象タブはタブバー内が基本だが、案件フォルダ(docs)等はヘッダー側（wrapRefの外）にあるので document もフォールバック。
        const tabEl = el.querySelector<HTMLElement>(`[data-nav-tab="${tab}"]`) ?? document.querySelector<HTMLElement>(`[data-nav-tab="${tab}"]`)
        if (!tabEl) return
        const s = stepEl.getBoundingClientRect()
        const t = tabEl.getBoundingClientRect()
        next.push({
          x1: t.left + t.width / 2 - base.left,
          y1: t.bottom - base.top,
          x2: s.left + s.width / 2 - base.left,
          y2: s.top - base.top,
        })
      })
      setLines(next)
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute) }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    window.addEventListener('resize', schedule)
    const tabbar = el.querySelector('[data-tabbar]')
    tabbar?.addEventListener('scroll', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      tabbar?.removeEventListener('scroll', schedule)
    }
  }, [wrapRef, deps])

  if (lines.length === 0) return null
  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden="true">
      {lines.map((l, i) => {
        const midY = (l.y1 + l.y2) / 2
        return (
          <g key={i}>
            <path
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${midY}, ${l.x2} ${midY}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke="var(--color-brand-400)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.75}
            />
            <circle cx={l.x1} cy={l.y1} r={2.5} fill="var(--color-brand-500)" />
            <circle cx={l.x2} cy={l.y2} r={2.5} fill="var(--color-brand-500)" />
          </g>
        )
      })}
    </svg>
  )
}

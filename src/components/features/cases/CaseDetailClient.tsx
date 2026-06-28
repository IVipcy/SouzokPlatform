'use client'

import { useState, useEffect, useRef, type RefObject } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useModal } from '@/hooks/useModal'
import CaseHeader from './CaseHeader'
import CaseTabs, { type TabKey } from './CaseTabs'
import BasicInfoTab from './BasicInfoTab'
import MeetingInfoTab from './MeetingInfoTab'
import ClientInfoTab from './ClientInfoTab'
import TasksTab from './TasksTab'
import DeceasedTab from './DeceasedTab'
import ContractTab from './ContractTab'
import AssetsTab from './AssetsTab'
import DivisionTab from './DivisionTab'
import type { RoleRow } from './ProcedureIntakeSection'
import DocsTab from './DocsTab'
import DocumentCreateTab from './DocumentCreateTab'
import ReferralTab from './ReferralTab'
import CancellationTab from './CancellationTab'
import RegistrationTab from './RegistrationTab'
import OwnerSalesTab from './OwnerSalesTab'
import OrderContentTab from './OrderContentTab'
import ContractProcTab from './ContractProcTab'
import PracticeProcedureTab from './PracticeProcedureTab'
import { PROCEDURE_TABS } from './practiceTabs'
import OrderSheet from './OrderSheet'
import BulkTaskGenerateModal from './BulkTaskGenerateModal'

import AddTaskModal from './AddTaskModal'
import InitialTaskReviewModal from './InitialTaskReviewModal'
import StatusFlowNavigator, { getJutakuFlowSteps, getKentouContractFlowSteps } from './StatusFlowNavigator'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getCaseTabVisibility } from '@/lib/caseTabs'
import { GYOMU_TAB } from '@/lib/serviceMaster'
import { getSelectableCaseStatuses, isInitialTasksDone, isContractProcDone, isAllTasksDone } from '@/lib/constants'
import type { TimelineReceipt, TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, RealEstateAcquisitionRow, FinancialAssetRow, DivisionDetailRow, AgreementDispatchRow, ExpenseRow, CaseDocumentRow, ClientCommunicationRow, CaseReferralRow, CaseClientRow, ContractDocumentRow, SagyoDocumentRow, DocumentRow, CaseFileRow } from '@/types'

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
  divisionDetails: DivisionDetailRow[]
  agreementDispatches?: AgreementDispatchRow[]
  expenses: ExpenseRow[]
  documents: CaseDocumentRow[]
  clientCommunications: ClientCommunicationRow[]
  currentMemberId: string | null
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
  statusHistory?: TimelineStatusEvent[]
  documentReceipts?: TimelineReceipt[]
  caseReferrals?: CaseReferralRow[]
  caseClients?: CaseClientRow[]
  contractDocuments?: ContractDocumentRow[]
  sagyoDocuments?: SagyoDocumentRow[]
  createdDocuments?: DocumentRow[]
  caseFiles?: CaseFileRow[]
}

// DBトリガーで他カラムが自動更新されるフィールド → 更新後に全体refreshが必要
// client_response_due_date: 変更で「検討状況の確認」タスクの期限が追従するため再取得（migration 096）
const TRIGGER_FIELDS = new Set(['status', 'client_response_due_date'])

const VALID_TABS: TabKey[] = ['orderSheet', 'basicInfo', 'ownerSales', 'orderContent', 'contractProc', 'meeting', 'clientInfo', 'tasks', 'deceased', 'contract', 'assets', 'division', 'will', 'registration', 'cancellation', 'trust', 'renunciation', 'mediation', 'probate', 'guardianship', 'referral', 'docs', 'documentCreate']

export default function CaseDetailClient({ caseData: caseDataProp, caseMembers, tasks, allMembers, taskTemplates, heirs, kosekiRequests, properties, acquisitions = [], financialAssets, divisionDetails, agreementDispatches = [], expenses, documents, clientCommunications, currentMemberId, caseAlerts, statusHistory, documentReceipts, caseReferrals, caseClients, contractDocuments = [], sagyoDocuments = [], createdDocuments = [], caseFiles = [] }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = (() => {
    const p = searchParams.get('tab')
    return p && (VALID_TABS as string[]).includes(p) ? (p as TabKey) : 'basicInfo'
  })()
  const [activeTab, setActiveTabState] = useState<TabKey>(tabFromUrl)
  const [caseState, setCaseState] = useState<CaseRow>(caseDataProp)
  const [managementTaskPrompt, setManagementTaskPrompt] = useState(false)
  // 検討中→（契約書待ち）/受託 へ進む前に面談情報の更新を促すゲート（対象ステータスを保持）
  const [meetingGate, setMeetingGate] = useState<string | null>(null)
  // 初期対応タスク確認ポップアップ（契機となったステータス）。
  // 新規登録直後（?created=1）に検討中/受注で作成された場合も初回マウントで開く。
  const [taskReviewStatus, setTaskReviewStatus] = useState<string | null>(() => {
    const st = caseDataProp.status
    const created = searchParams.get('created') === '1'
    return created && (st === '検討中' || st === '検討中（契約書待ち）' || st === '受注') ? st : null
  })
  // 受託フロー・ナビゲーターの「あとで」抑制（再マウント＝案件を再オープンでリセット）
  const [navDismissed, setNavDismissed] = useState(false)
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

  const bulkTaskModal = useModal()

  const addTaskModal = useModal()

  // prop側でdata更新があった場合はstateに反映
  useEffect(() => { setCaseState(caseDataProp) }, [caseDataProp])

  const handleSaved = () => {
    router.refresh()
  }

  /** 案件フィールドの楽観的更新 */
  const patchCase = async (patch: Partial<CaseRow>) => {
    // ゲート：検討中 →（契約書待ち）/受託 へ進むには、面談情報を1回更新・保存しておく必要がある
    if ((patch.status === '検討中（契約書待ち）' || patch.status === '受注')
      && caseState.status === '検討中'
      && !caseState.meeting_info_updated_at) {
      setMeetingGate(patch.status)
      return
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
    // 受託（受注）に変わったら：受注日を自動セット＋初期対応タスクの確認ポップアップ
    // （閉じた後は常設の受託フロー・ナビゲーターがオーダーシート作成以降を順に案内する）
    if (patch.status === '受注' && prev.status !== '受注') {
      if (!prev.order_received_date) {
        const today = new Date().toLocaleDateString('sv-SE')  // YYYY-MM-DD（ローカル）
        await supabase.from('cases').update({ order_received_date: today }).eq('id', caseState.id)
        setCaseState(c => ({ ...c, order_received_date: today }))
      }
      setNavDismissed(false)
      setTaskReviewStatus('受注')
    }
    // 検討中 / 検討中（契約書待ち）に変わったら：検討状況リマインド等の初期タスク確認ポップアップ
    if ((patch.status === '検討中' || patch.status === '検討中（契約書待ち）') && prev.status !== patch.status) {
      setTaskReviewStatus(patch.status)
    }
    // 対応中に変わったら：事務管理タスクの設定を促すポップアップ
    if (patch.status === '対応中' && prev.status !== '対応中') {
      setManagementTaskPrompt(true)
    }
    // トリガーで他フィールドが更新されるフィールドは、refreshして最新を取得
    const needsRefresh = Object.keys(patch).some(k => TRIGGER_FIELDS.has(k))
    if (needsRefresh) {
      router.refresh()
    }
  }

  // 面談情報タブからの保存。ステータス変更以外は「面談情報を更新した」印を併せて立てる（ゲート解除用）。
  const patchCaseFromMeeting = (patch: Partial<CaseRow>) =>
    'status' in patch ? patchCase(patch) : patchCase({ ...patch, meeting_info_updated_at: new Date().toISOString() })

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

  // 管理担当アサイン済か（対応中ガード用）
  const managerAssigned = caseMembers.some(cm => cm.role === 'manager')
  // 受注担当（進捗確認依頼の確認者＝依頼先）
  const salesMemberId = caseMembers.find(cm => cm.role === 'sales')?.member_id ?? null
  // 進捗確認の依頼は、この案件の管理担当（ログイン中の本人）だけが出せる
  const isCaseManager = !!currentMemberId && caseMembers.some(cm => cm.role === 'manager' && cm.member_id === currentMemberId)
  // 初期対応タスク（受託時に生成される system / category=初期対応）が全完了か（対応中ガード用）
  const initialTasksDone = isInitialTasksDone(tasks)
  // 契約残手続き（契約関連書類）が全受信済か（対応中ガード用）
  const contractProcDone = isContractProcDone(contractDocuments)
  // この段階の全タスク完了か（検討中（契約書待ち）→受託ガード用）
  const allTasksDone = isAllTasksDone(tasks)
  // 検討中（契約書待ち）→受託 のゲート：契約残手続き＋全タスク完了
  const kentouContractReady = contractProcDone && allTasksDone

  // 初期対応タスク確認ポップアップを閉じる。閉じた後は受託フロー・ナビゲーターが案内を引き継ぐ。
  const closeTaskReview = (refresh: boolean) => {
    setTaskReviewStatus(null)
    if (refresh) router.refresh()
  }

  // 受託フロー・ナビゲーター（受注時のみ）。各ステップの完了状態を算出。
  const flowSteps = getJutakuFlowSteps({
    orderSheetCompleted: !!caseState.order_sheet_completed_at,
    managerAssigned,
    initialTasksDone,
    contractProcDone,
  })
  // 検討中（契約書待ち）→受託 のフロー・ナビゲーター（契約残手続き＋タスク）
  const kentouSteps = getKentouContractFlowSteps({ contractProcDone, allTasksDone })
  const jutakuNavVisible = caseState.status === '受注' && !navDismissed
  const kentouNavVisible = caseState.status === '検討中（契約書待ち）' && !navDismissed
  // 着手ナビ：対応中なのにまだ着手していない（案件タスクが1つも対応中/完了でない）とき、
  // 案件進捗タブを点滅させて「ここで着手」を促す（受託/検討フローと同じ見せ方）。
  const normTaskStatus = (s: string) => s === '未着手' ? '着手前' : ['Wチェック待ち', '保留'].includes(s) ? '対応中' : s === 'キャンセル' ? '完了' : s
  const kickoffNeeded = caseState.status === '対応中'
    && !tasks.some(t => t.task_kind !== 'system' && ['対応中', '完了'].includes(normTaskStatus(t.status)))
  // 順不同のため、未完了ステップのタブをすべて同時ハイライト
  const activeNavSteps = jutakuNavVisible ? flowSteps : kentouNavVisible ? kentouSteps : []
  const navHighlightTabs: TabKey[] = [
    ...activeNavSteps.filter(s => !s.done).map(s => s.tab),
    ...(kickoffNeeded ? ['basicInfo' as TabKey] : []),
  ]

  // 受注区分→選択業務 で許可される実務タブ（service_category 設定時のみ出し分け）。
  // 並行進行モデルのため段階表示は無し：選択業務に対応する全タブを最初から表示。
  const selectedGyomu = [...new Set((caseState.intake_roles ?? []).map(r => r.gyomu).filter(Boolean))]
  const allowedPracticeTabs = caseState.service_category
    ? ([...new Set(selectedGyomu.map(g => GYOMU_TAB[g]).filter(Boolean))] as TabKey[])
    : undefined

  // ステータス連動＋業務連動のタブ表示制御
  const tabVis = getCaseTabVisibility({
    status: caseState.status,
    orderSheetCompleted: !!caseState.order_sheet_completed_at,
    referralPartnerCount: caseReferrals?.length ?? 0,
    allowedPracticeTabs,
  })
  // 現在のタブが表示対象外なら先頭タブにフォールバック
  const effectiveTab: TabKey = tabVis.visible.includes(activeTab) ? activeTab : tabVis.visible[0]

  return (
    <div>
      <CaseHeader
        caseData={caseState}
        latestCommunicationDate={latestCommunicationDate}
        caseAlerts={caseAlerts}
        tasks={tasks}
        statusHistory={statusHistory}
        selectableStatuses={getSelectableCaseStatuses(!!caseState.order_sheet_completed_at, caseState.status, managerAssigned, initialTasksDone, contractProcDone, kentouContractReady)}
        onStatusChange={s => patchCase({ status: s })}
        referrals={caseReferrals ?? []}
        onJumpToReferral={() => {
          setActiveTab('orderSheet')
          setTimeout(() => document.getElementById('os-referral')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
        }}
        showDocsAction={tabVis.visible.includes('docs')}
        showDocumentCreateAction={tabVis.visible.includes('documentCreate')}
        docCount={documents.length}
        highlightTabs={navHighlightTabs}
        onActivateTab={setActiveTab}
      />

      <div ref={navWrapRef} className="relative">
        <CaseTabs
          activeTab={effectiveTab}
          onTabChange={setActiveTab}
          taskCount={tasks.length}
          visibleTabs={tabVis.visible}
          collapsedTabs={tabVis.collapsed}
          highlightTabs={navHighlightTabs}
          groupInfoTabs={caseState.status === '対応中' || caseState.status === '完了'}
        />

        {/* 受託フロー・ナビゲーター：受注案件を開くたび、対応中への前提条件を案内（順不同） */}
        {jutakuNavVisible && (
          <StatusFlowNavigator
            steps={flowSteps}
            targetLabel="対応中"
            onAdvance={() => patchCase({ status: '対応中' })}
            onDismiss={() => setNavDismissed(true)}
          />
        )}

        {/* 検討フロー・ナビゲーター：検討中（契約書待ち）で、受託への前提条件（契約残手続き＋タスク）を案内 */}
        {kentouNavVisible && (
          <StatusFlowNavigator
            steps={kentouSteps}
            targetLabel="受託"
            onAdvance={() => patchCase({ status: '受注' })}
            onDismiss={() => setNavDismissed(true)}
          />
        )}

        {/* タブ↔ナビの箱を結ぶリードライン（最後に描画して最前面に） */}
        {(jutakuNavVisible || kentouNavVisible) && <NavConnectors wrapRef={navWrapRef} deps={navHighlightTabs.join(',')} />}
      </div>

      {effectiveTab === 'orderSheet' && (
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
        />
      )}
      {effectiveTab === 'basicInfo' && (
        <BasicInfoTab caseData={caseState} tasks={tasks} properties={properties} allMembers={allMembers} currentMemberId={currentMemberId} patchCase={patchCase} documentReceipts={documentReceipts} contractDocuments={contractDocuments} managerAssigned={managerAssigned} contractProcDone={contractProcDone} salesMemberId={salesMemberId} canRequestReview={isCaseManager} />
      )}
      {effectiveTab === 'ownerSales' && (
        <OwnerSalesTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} patchCase={patchCase} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'orderContent' && (
        <OrderContentTab caseData={caseState} patchCase={patchCase} />
      )}
      {effectiveTab === 'contractProc' && (
        <ContractProcTab caseId={caseState.id} contractDocuments={contractDocuments} documentReceipts={documentReceipts} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'meeting' && (
        <MeetingInfoTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} onRefresh={handleSaved} patchCase={patchCaseFromMeeting} referrals={caseReferrals ?? []} tasks={tasks} contractDocuments={contractDocuments} contractProcDone={contractProcDone} />
      )}
      {effectiveTab === 'clientInfo' && (
        <ClientInfoTab caseData={caseState} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={handleSaved} caseClients={caseClients ?? []} />
      )}
      {effectiveTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onBulkGenerate={bulkTaskModal.open} onAddTask={addTaskModal.open} documentReceipts={documentReceipts} caseStatus={caseState.status} />
      )}
      {effectiveTab === 'deceased' && (
        <DeceasedTab caseData={caseState} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={handleSaved} patchCase={patchCase} contractDocuments={contractDocuments} caseClients={caseClients} documentReceipts={documentReceipts} tasks={tasks} />
      )}
      {effectiveTab === 'contract' && (
        <ContractTab caseData={caseState} expenses={expenses} tasks={tasks} onRefresh={handleSaved} patchCase={patchCase} referrals={caseReferrals ?? []} />
      )}
      {effectiveTab === 'assets' && (
        <AssetsTab caseData={caseState} properties={properties} acquisitions={acquisitions} financialAssets={financialAssets} onRefresh={handleSaved} patchCase={patchCase} contractDocuments={contractDocuments} documentReceipts={documentReceipts} tasks={tasks} />
      )}
      {effectiveTab === 'division' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} heirs={heirs} agreementDispatches={agreementDispatches} onRefresh={handleSaved} patchCase={patchCase} mode="division" />
      )}
      {effectiveTab === 'will' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} mode="will" />
      )}
      {effectiveTab === 'registration' && (
        <RegistrationTab caseData={caseState} properties={properties} onRefresh={handleSaved} patchCase={patchCase} contractDocuments={contractDocuments} />
      )}
      {effectiveTab === 'cancellation' && (
        <CancellationTab financialAssets={financialAssets} onRefresh={handleSaved} receipts={documentReceipts} />
      )}
      {PROCEDURE_TABS.map(p => effectiveTab === p.tab && (
        <PracticeProcedureTab key={p.tab} caseData={caseState} patchCase={patchCase} gyomu={p.gyomu} title={p.title} description={p.description} court={p.court} trust={p.trust} mediation={p.mediation} heirs={heirs} tasks={tasks} sagyoDocuments={sagyoDocuments} receipts={documentReceipts ?? []} onRefresh={handleSaved} />
      ))}
      {effectiveTab === 'referral' && (
        <ReferralTab caseData={caseState} referrals={caseReferrals ?? []} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'docs' && (
        <DocsTab caseData={caseState} documents={documents} documentReceipts={documentReceipts} tasks={tasks} contractDocuments={contractDocuments} caseFiles={caseFiles} createdDocuments={createdDocuments} currentMemberId={currentMemberId} />
      )}
      {effectiveTab === 'documentCreate' && (
        <DocumentCreateTab caseData={caseState} tasks={tasks} heirs={heirs} properties={properties} kosekiRequests={kosekiRequests} contractDocuments={contractDocuments} createdDocuments={createdDocuments} onRefresh={handleSaved} />
      )}

      {/* 受託/検討中になったら初期対応タスクを確認（不要を外す・必要を追加） */}
      <InitialTaskReviewModal
        key={taskReviewStatus ?? 'none'}
        isOpen={!!taskReviewStatus}
        status={taskReviewStatus}
        caseId={caseState.id}
        onApplied={() => closeTaskReview(true)}
        onClose={() => closeTaskReview(false)}
      />

      {/* 対応中になったら事務管理タスクの設定を促す */}
      <Modal
        isOpen={managementTaskPrompt}
        onClose={() => setManagementTaskPrompt(false)}
        title="対応中になりました"
        footer={
          <>
            <Button variant="secondary" onClick={() => setManagementTaskPrompt(false)}>あとで</Button>
            <Button variant="primary" onClick={() => { setManagementTaskPrompt(false); setActiveTab('tasks') }}>タスクを設定する</Button>
          </>
        }
      >
        <p className="text-[14px] text-gray-700 leading-relaxed">
          続けて<strong>事務管理タスクを設定</strong>してください。<br />
          「タスクを設定する」を押すとタスクタブを開きます。
        </p>
      </Modal>

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

      <BulkTaskGenerateModal
        isOpen={bulkTaskModal.isOpen}
        onClose={bulkTaskModal.close}
        caseId={caseState.id}
        intakeRoles={(caseState.intake_roles ?? []) as RoleRow[]}
        serviceCategory={caseState.service_category}
        serviceCategory2={caseState.service_category_2}
        taskTemplates={taskTemplates}
        existingTasks={tasks}
        onSaved={handleSaved}
      />

      <AddTaskModal
        isOpen={addTaskModal.isOpen}
        onClose={addTaskModal.close}
        caseId={caseState.id}
        allMembers={allMembers}
        onSaved={handleSaved}
      />

    </div>
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
        const tabEl = el.querySelector<HTMLElement>(`[data-nav-tab="${tab}"]`)
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

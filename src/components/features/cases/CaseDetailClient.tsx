'use client'

import { useState, useEffect } from 'react'
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
import DocsBundleTab from './DocsBundleTab'
import ReferralTab from './ReferralTab'
import CancellationTab from './CancellationTab'
import RegistrationTab from './RegistrationTab'
import OwnerSalesTab from './OwnerSalesTab'
import OrderContentTab from './OrderContentTab'
import OrderSheet from './OrderSheet'
import BulkTaskGenerateModal from './BulkTaskGenerateModal'

import AddTaskModal from './AddTaskModal'
import InitialTaskReviewModal from './InitialTaskReviewModal'
import StatusFlowNavigator, { getJutakuFlowSteps } from './StatusFlowNavigator'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getCaseTabVisibility } from '@/lib/caseTabs'
import { getSelectableCaseStatuses, isInitialTasksDone } from '@/lib/constants'
import type { TimelineReceipt, TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, KosekiRequestRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow, CaseDocumentRow, ClientCommunicationRow, CaseReferralRow, CaseClientRow } from '@/types'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  taskTemplates: TaskTemplateRow[]
  heirs: HeirRow[]
  kosekiRequests: KosekiRequestRow[]
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  divisionDetails: DivisionDetailRow[]
  expenses: ExpenseRow[]
  documents: CaseDocumentRow[]
  clientCommunications: ClientCommunicationRow[]
  currentMemberId: string | null
  caseAlerts?: import('@/lib/alerts').CaseAlertChip[]
  statusHistory?: TimelineStatusEvent[]
  documentReceipts?: TimelineReceipt[]
  caseReferrals?: CaseReferralRow[]
  caseClients?: CaseClientRow[]
}

// DBトリガーで他カラムが自動更新されるフィールド → 更新後に全体refreshが必要
const TRIGGER_FIELDS = new Set(['status'])

const VALID_TABS: TabKey[] = ['orderSheet', 'basicInfo', 'ownerSales', 'orderContent', 'meeting', 'clientInfo', 'tasks', 'deceased', 'contract', 'assets', 'division', 'will', 'registration', 'cancellation', 'referral', 'docs']

export default function CaseDetailClient({ caseData: caseDataProp, caseMembers, tasks, allMembers, taskTemplates, heirs, kosekiRequests, properties, financialAssets, divisionDetails, expenses, documents, clientCommunications, currentMemberId, caseAlerts, statusHistory, documentReceipts, caseReferrals, caseClients }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = (() => {
    const p = searchParams.get('tab')
    return p && (VALID_TABS as string[]).includes(p) ? (p as TabKey) : 'basicInfo'
  })()
  const [activeTab, setActiveTabState] = useState<TabKey>(tabFromUrl)
  const [caseState, setCaseState] = useState<CaseRow>(caseDataProp)
  const [managementTaskPrompt, setManagementTaskPrompt] = useState(false)
  // 初期対応タスク確認ポップアップ（契機となったステータス）
  const [taskReviewStatus, setTaskReviewStatus] = useState<string | null>(null)
  // 受託フロー・ナビゲーターの「あとで」抑制（再マウント＝案件を再オープンでリセット）
  const [navDismissed, setNavDismissed] = useState(false)

  // URL → state 双方向同期: URL の tab パラメータが変わったら state も追随
  // （戻る/進む や リフレッシュ後にタブ位置を維持するため）
  useEffect(() => {
    setActiveTabState(prev => (prev === tabFromUrl ? prev : tabFromUrl))
  }, [tabFromUrl])

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
  // 初期対応タスク（受託時に生成される system / category=初期対応）が全完了か（対応中ガード用）
  const initialTasksDone = isInitialTasksDone(tasks)

  // 初期対応タスク確認ポップアップを閉じる。閉じた後は受託フロー・ナビゲーターが案内を引き継ぐ。
  const closeTaskReview = (refresh: boolean) => {
    setTaskReviewStatus(null)
    if (refresh) router.refresh()
  }

  // 受託フロー・ナビゲーター（受注時のみ）。3ステップの完了状態を算出。
  const flowSteps = getJutakuFlowSteps({
    orderSheetCompleted: !!caseState.order_sheet_completed_at,
    managerAssigned,
    initialTasksDone,
  })
  const navVisible = caseState.status === '受注' && !navDismissed
  // 順不同のため、未完了ステップのタブをすべて同時ハイライト
  const navHighlightTabs = navVisible ? flowSteps.filter(s => !s.done).map(s => s.tab) : []

  // ステータス連動のタブ表示制御
  const tabVis = getCaseTabVisibility({
    status: caseState.status,
    orderSheetCompleted: !!caseState.order_sheet_completed_at,
    referralPartnerCount: caseReferrals?.length ?? 0,
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
        selectableStatuses={getSelectableCaseStatuses(!!caseState.order_sheet_completed_at, caseState.status, managerAssigned, initialTasksDone)}
        onStatusChange={s => patchCase({ status: s })}
      />

      <CaseTabs
        activeTab={effectiveTab}
        onTabChange={setActiveTab}
        taskCount={tasks.length}
        docCount={documents.length}
        visibleTabs={tabVis.visible}
        collapsedTabs={tabVis.collapsed}
        highlightTabs={navHighlightTabs}
      />

      {/* 受託フロー・ナビゲーター：受注案件を開くたび、対応中への前提条件を案内（順不同） */}
      {navVisible && (
        <StatusFlowNavigator
          steps={flowSteps}
          onAdvance={() => patchCase({ status: '対応中' })}
          onDismiss={() => setNavDismissed(true)}
        />
      )}

      {effectiveTab === 'orderSheet' && (
        <OrderSheet
          caseData={caseState}
          patchCase={patchCase}
          patchClient={patchClient}
          onRefresh={handleSaved}
          heirs={heirs}
          kosekiRequests={kosekiRequests}
          properties={properties}
          financialAssets={financialAssets}
          divisionDetails={divisionDetails}
          expenses={expenses}
          tasks={tasks}
          clientCommunications={clientCommunications}
          referrals={caseReferrals ?? []}
          caseClients={caseClients ?? []}
        />
      )}
      {effectiveTab === 'basicInfo' && (
        <BasicInfoTab caseData={caseState} tasks={tasks} properties={properties} allMembers={allMembers} currentMemberId={currentMemberId} patchCase={patchCase} documentReceipts={documentReceipts} managerAssigned={managerAssigned} />
      )}
      {effectiveTab === 'ownerSales' && (
        <OwnerSalesTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} patchCase={patchCase} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'orderContent' && (
        <OrderContentTab caseData={caseState} patchCase={patchCase} />
      )}
      {effectiveTab === 'meeting' && (
        <MeetingInfoTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} onRefresh={handleSaved} patchCase={patchCase} referrals={caseReferrals ?? []} tasks={tasks} />
      )}
      {effectiveTab === 'clientInfo' && (
        <ClientInfoTab caseData={caseState} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={handleSaved} caseClients={caseClients ?? []} />
      )}
      {effectiveTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onBulkGenerate={bulkTaskModal.open} onAddTask={addTaskModal.open} />
      )}
      {effectiveTab === 'deceased' && (
        <DeceasedTab caseData={caseState} heirs={heirs} kosekiRequests={kosekiRequests} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {effectiveTab === 'contract' && (
        <ContractTab caseData={caseState} expenses={expenses} tasks={tasks} onRefresh={handleSaved} patchCase={patchCase} referrals={caseReferrals ?? []} />
      )}
      {effectiveTab === 'assets' && (
        <AssetsTab caseData={caseState} properties={properties} financialAssets={financialAssets} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {effectiveTab === 'division' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} mode="division" />
      )}
      {effectiveTab === 'will' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} mode="will" />
      )}
      {effectiveTab === 'registration' && (
        <RegistrationTab caseData={caseState} properties={properties} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {effectiveTab === 'cancellation' && (
        <CancellationTab financialAssets={financialAssets} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'referral' && (
        <ReferralTab caseData={caseState} referrals={caseReferrals ?? []} onRefresh={handleSaved} />
      )}
      {effectiveTab === 'docs' && (
        <DocsBundleTab caseData={caseState} documents={documents} tasks={tasks} heirs={heirs} properties={properties} />
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

      <BulkTaskGenerateModal
        isOpen={bulkTaskModal.isOpen}
        onClose={bulkTaskModal.close}
        caseId={caseState.id}
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

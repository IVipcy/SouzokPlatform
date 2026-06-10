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
import OrderSheet from './OrderSheet'
import BulkTaskGenerateModal from './BulkTaskGenerateModal'

import AddTaskModal from './AddTaskModal'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getCaseTabVisibility } from '@/lib/caseTabs'
import type { TimelineReceipt, TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow, CaseDocumentRow, ClientCommunicationRow, CaseReferralRow, CaseClientRow } from '@/types'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  taskTemplates: TaskTemplateRow[]
  heirs: HeirRow[]
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

const VALID_TABS: TabKey[] = ['orderSheet', 'basicInfo', 'ownerSales', 'meeting', 'clientInfo', 'tasks', 'deceased', 'contract', 'assets', 'division', 'will', 'registration', 'cancellation', 'referral', 'docs']

export default function CaseDetailClient({ caseData: caseDataProp, caseMembers, tasks, allMembers, taskTemplates, heirs, properties, financialAssets, divisionDetails, expenses, documents, clientCommunications, currentMemberId, caseAlerts, statusHistory, documentReceipts, caseReferrals, caseClients }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = (() => {
    const p = searchParams.get('tab')
    return p && (VALID_TABS as string[]).includes(p) ? (p as TabKey) : 'basicInfo'
  })()
  const [activeTab, setActiveTabState] = useState<TabKey>(tabFromUrl)
  const [caseState, setCaseState] = useState<CaseRow>(caseDataProp)
  const [orderSheetPrompt, setOrderSheetPrompt] = useState(false)

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
    // 受託（受注）に変わったら：受注日を自動セット＋オーダーシート作成を促すポップアップ
    if (patch.status === '受注' && prev.status !== '受注') {
      if (!prev.order_received_date) {
        const today = new Date().toLocaleDateString('sv-SE')  // YYYY-MM-DD（ローカル）
        await supabase.from('cases').update({ order_received_date: today }).eq('id', caseState.id)
        setCaseState(c => ({ ...c, order_received_date: today }))
      }
      setOrderSheetPrompt(true)
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
      />

      <CaseTabs
        activeTab={effectiveTab}
        onTabChange={setActiveTab}
        taskCount={tasks.length}
        docCount={documents.length}
        visibleTabs={tabVis.visible}
        collapsedTabs={tabVis.collapsed}
      />

      {effectiveTab === 'orderSheet' && (
        <OrderSheet
          caseData={caseState}
          patchCase={patchCase}
          patchClient={patchClient}
          onRefresh={handleSaved}
          heirs={heirs}
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
      {effectiveTab === 'meeting' && (
        <MeetingInfoTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} onRefresh={handleSaved} patchCase={patchCase} referrals={caseReferrals ?? []} />
      )}
      {effectiveTab === 'clientInfo' && (
        <ClientInfoTab caseData={caseState} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={handleSaved} caseClients={caseClients ?? []} />
      )}
      {effectiveTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onBulkGenerate={bulkTaskModal.open} onAddTask={addTaskModal.open} />
      )}
      {effectiveTab === 'deceased' && (
        <DeceasedTab caseData={caseState} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} />
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

      {/* 受託になったらオーダーシート作成を促す */}
      <Modal
        isOpen={orderSheetPrompt}
        onClose={() => setOrderSheetPrompt(false)}
        title="受託になりました"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOrderSheetPrompt(false)}>あとで</Button>
            <Button variant="primary" onClick={() => { setOrderSheetPrompt(false); setActiveTab('orderSheet') }}>オーダーシートへ</Button>
          </>
        }
      >
        <p className="text-[14px] text-gray-700 leading-relaxed">
          続けて<strong>オーダーシートの作成</strong>を進めてください。<br />
          「オーダーシートへ」を押すとオーダーシートタブを開きます。
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

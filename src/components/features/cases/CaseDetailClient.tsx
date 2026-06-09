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
import DocsTab from './DocsTab'
import DocumentCreateTab from './DocumentCreateTab'
import ReferralTab from './ReferralTab'
import BulkTaskGenerateModal from './BulkTaskGenerateModal'

import AddTaskModal from './AddTaskModal'
import type { TimelineReceipt, TimelineStatusEvent } from './CaseTimeline'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow, CaseDocumentRow, ClientCommunicationRow } from '@/types'

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
}

// DBトリガーで他カラムが自動更新されるフィールド → 更新後に全体refreshが必要
const TRIGGER_FIELDS = new Set(['status'])

const VALID_TABS: TabKey[] = ['basicInfo', 'meeting', 'clientInfo', 'tasks', 'deceased', 'contract', 'assets', 'division', 'will', 'registration', 'cancellation', 'referral', 'docs', 'documentCreate']

export default function CaseDetailClient({ caseData: caseDataProp, caseMembers, tasks, allMembers, taskTemplates, heirs, properties, financialAssets, divisionDetails, expenses, documents, clientCommunications, currentMemberId, caseAlerts, statusHistory, documentReceipts }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = (() => {
    const p = searchParams.get('tab')
    return p && (VALID_TABS as string[]).includes(p) ? (p as TabKey) : 'basicInfo'
  })()
  const [activeTab, setActiveTabState] = useState<TabKey>(tabFromUrl)
  const [caseState, setCaseState] = useState<CaseRow>(caseDataProp)

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
        activeTab={activeTab}
        onTabChange={setActiveTab}
        taskCount={tasks.length}
        docCount={documents.length}
      />

      {activeTab === 'basicInfo' && (
        <BasicInfoTab caseData={caseState} tasks={tasks} properties={properties} allMembers={allMembers} currentMemberId={currentMemberId} patchCase={patchCase} documentReceipts={documentReceipts} />
      )}
      {activeTab === 'meeting' && (
        <MeetingInfoTab caseData={caseState} caseMembers={caseMembers} allMembers={allMembers} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'clientInfo' && (
        <ClientInfoTab caseData={caseState} clientCommunications={clientCommunications} patchCase={patchCase} patchClient={patchClient} onRefresh={handleSaved} />
      )}
      {activeTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onBulkGenerate={bulkTaskModal.open} onAddTask={addTaskModal.open} />
      )}
      {activeTab === 'deceased' && (
        <DeceasedTab caseData={caseState} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'contract' && (
        <ContractTab caseData={caseState} expenses={expenses} tasks={tasks} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'assets' && (
        <AssetsTab caseData={caseState} properties={properties} financialAssets={financialAssets} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'division' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} onRefresh={handleSaved} patchCase={patchCase} mode="division" />
      )}
      {activeTab === 'will' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} onRefresh={handleSaved} patchCase={patchCase} mode="will" />
      )}
      {activeTab === 'registration' && (
        <TabPlaceholder title="相続登記" note="項目は今後ヒアリングのうえ追加予定です。" />
      )}
      {activeTab === 'cancellation' && (
        <TabPlaceholder title="解約等（銀行・証券・自動車）" note="項目は今後ヒアリングのうえ追加予定です。" />
      )}
      {activeTab === 'referral' && (
        <ReferralTab caseData={caseState} patchCase={patchCase} />
      )}
      {activeTab === 'docs' && (
        <DocsTab caseData={caseState} documents={documents} />
      )}
      {activeTab === 'documentCreate' && (
        <DocumentCreateTab caseData={caseState} tasks={tasks} heirs={heirs} properties={properties} />
      )}

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

// 中身未定のタブ用プレースホルダー（相続登記 / 解約等）
function TabPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-12 text-center text-[13px] text-gray-400">{note}</div>
    </div>
  )
}

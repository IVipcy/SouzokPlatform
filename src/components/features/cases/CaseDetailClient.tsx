'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useModal } from '@/hooks/useModal'
import CaseHeader from './CaseHeader'
import CaseTabs, { type TabKey } from './CaseTabs'
import BasicInfoTab from './BasicInfoTab'
import TasksTab from './TasksTab'
import DeceasedTab from './DeceasedTab'
import ContractTab from './ContractTab'
import MailingTab from './MailingTab'
import AssetsTab from './AssetsTab'
import DivisionTab from './DivisionTab'
import InvoiceTab from './InvoiceTab'
import DocsTab from './DocsTab'
import HistoryTab from './HistoryTab'
import BulkTaskGenerateModal from './BulkTaskGenerateModal'

import AddTaskModal from './AddTaskModal'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow } from '@/types'

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
  currentMemberId: string | null
}

// DBトリガーで他カラムが自動更新されるフィールド → 更新後に全体refreshが必要
const TRIGGER_FIELDS = new Set(['status'])

export default function CaseDetailClient({ caseData: caseDataProp, caseMembers, tasks, allMembers, taskTemplates, heirs, properties, financialAssets, divisionDetails, expenses, currentMemberId }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('basicInfo')
  const [caseState, setCaseState] = useState<CaseRow>(caseDataProp)

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

  return (
    <div>
      <CaseHeader caseData={caseState} />

      <CaseTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        taskCount={tasks.length}
        docCount={0}
      />

      {activeTab === 'basicInfo' && (
        <BasicInfoTab caseData={caseState} caseMembers={caseMembers} tasks={tasks} allMembers={allMembers} onRefresh={handleSaved} patchCase={patchCase} patchClient={patchClient} />
      )}
      {activeTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onBulkGenerate={bulkTaskModal.open} onAddTask={addTaskModal.open} />
      )}
      {activeTab === 'deceased' && (
        <DeceasedTab caseData={caseState} heirs={heirs} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'contract' && (
        <ContractTab caseData={caseState} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'mailing' && (
        <MailingTab caseData={caseState} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'assets' && (
        <AssetsTab caseData={caseState} properties={properties} financialAssets={financialAssets} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'division' && (
        <DivisionTab caseData={caseState} divisionDetails={divisionDetails} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'invoice' && (
        <InvoiceTab caseData={caseState} expenses={expenses} tasks={tasks} onRefresh={handleSaved} patchCase={patchCase} />
      )}
      {activeTab === 'docs' && (
        <DocsTab caseData={caseState} />
      )}
      {activeTab === 'history' && (
        <HistoryTab caseData={caseState} allMembers={allMembers} currentMemberId={currentMemberId} />
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

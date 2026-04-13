'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow, CaseActivityRow } from '@/types'

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
  activities: CaseActivityRow[]
  currentMemberId: string | null
}

export default function CaseDetailClient({ caseData, caseMembers, tasks, allMembers, taskTemplates, heirs, properties, financialAssets, divisionDetails, expenses, activities, currentMemberId }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('basicInfo')

  const bulkTaskModal = useModal()

  const addTaskModal = useModal()

  const handleSaved = () => {
    router.refresh()
  }

  return (
    <div>
      <CaseHeader caseData={caseData} />

      <CaseTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        taskCount={tasks.length}
        docCount={0}
      />

      {activeTab === 'basicInfo' && (
        <BasicInfoTab caseData={caseData} caseMembers={caseMembers} tasks={tasks} allMembers={allMembers} onRefresh={handleSaved} />
      )}
      {activeTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} currentMemberId={currentMemberId} onBulkGenerate={bulkTaskModal.open} onAddTask={addTaskModal.open} />
      )}
      {activeTab === 'deceased' && (
        <DeceasedTab caseData={caseData} heirs={heirs} onRefresh={handleSaved} />
      )}
      {activeTab === 'contract' && (
        <ContractTab caseData={caseData} onRefresh={handleSaved} />
      )}
      {activeTab === 'mailing' && (
        <MailingTab caseData={caseData} onRefresh={handleSaved} />
      )}
      {activeTab === 'assets' && (
        <AssetsTab caseData={caseData} properties={properties} financialAssets={financialAssets} onRefresh={handleSaved} />
      )}
      {activeTab === 'division' && (
        <DivisionTab caseData={caseData} divisionDetails={divisionDetails} onRefresh={handleSaved} />
      )}
      {activeTab === 'invoice' && (
        <InvoiceTab caseData={caseData} expenses={expenses} tasks={tasks} onRefresh={handleSaved} />
      )}
      {activeTab === 'docs' && (
        <DocsTab caseData={caseData} />
      )}
      {activeTab === 'history' && (
        <HistoryTab caseData={caseData} activities={activities} allMembers={allMembers} currentMemberId={currentMemberId} />
      )}

      <BulkTaskGenerateModal
        isOpen={bulkTaskModal.isOpen}
        onClose={bulkTaskModal.close}
        caseId={caseData.id}
        taskTemplates={taskTemplates}
        existingTasks={tasks}
        onSaved={handleSaved}
      />

      <AddTaskModal
        isOpen={addTaskModal.isOpen}
        onClose={addTaskModal.close}
        caseId={caseData.id}
        allMembers={allMembers}
        onSaved={handleSaved}
      />
    </div>
  )
}

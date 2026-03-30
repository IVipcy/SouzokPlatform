'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useModal } from '@/hooks/useModal'
import CaseHeader from './CaseHeader'
import CaseTabs, { type TabKey } from './CaseTabs'
import OverviewTab from './OverviewTab'
import TasksTab from './TasksTab'
import ClientTab from './ClientTab'
import AssetsTab from './AssetsTab'
import DivisionTab from './DivisionTab'
import FinanceTab from './FinanceTab'
import DocsTab from './DocsTab'
import HistoryTab from './HistoryTab'
import CaseEditModal from './CaseEditModal'
import BulkTaskGenerateModal from './BulkTaskGenerateModal'
import AssigneeManageModal from './AssigneeManageModal'
import AddTaskModal from './AddTaskModal'
import EditClientModal from './EditClientModal'
import EditAssetsModal from './EditAssetsModal'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow } from '@/types'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  tasks: TaskRow[]
  allMembers: MemberRow[]
  taskTemplates: TaskTemplateRow[]
}

export default function CaseDetailClient({ caseData, caseMembers, tasks, allMembers, taskTemplates }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const editModal = useModal()
  const bulkTaskModal = useModal()
  const assigneeModal = useModal()
  const addTaskModal = useModal()
  const clientEditModal = useModal()
  const assetsEditModal = useModal()

  const handleSaved = () => {
    router.refresh()
  }

  return (
    <div>
      <CaseHeader caseData={caseData} onEditClick={editModal.open} />

      <CaseTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        taskCount={tasks.length}
        docCount={0}
      />

      {activeTab === 'overview' && (
        <OverviewTab caseData={caseData} caseMembers={caseMembers} tasks={tasks} />
      )}
      {activeTab === 'tasks' && (
        <TasksTab tasks={tasks} allMembers={allMembers} onBulkGenerate={bulkTaskModal.open} onAssigneeManage={assigneeModal.open} onAddTask={addTaskModal.open} />
      )}
      {activeTab === 'client' && (
        <ClientTab caseData={caseData} onEdit={clientEditModal.open} />
      )}
      {activeTab === 'assets' && (
        <AssetsTab caseData={caseData} onEdit={assetsEditModal.open} />
      )}
      {activeTab === 'division' && (
        <DivisionTab caseData={caseData} />
      )}
      {activeTab === 'finance' && (
        <FinanceTab caseData={caseData} />
      )}
      {activeTab === 'docs' && (
        <DocsTab caseData={caseData} />
      )}
      {activeTab === 'history' && (
        <HistoryTab caseData={caseData} />
      )}

      <CaseEditModal
        isOpen={editModal.isOpen}
        onClose={editModal.close}
        caseData={caseData}
        onSaved={handleSaved}
      />

      <BulkTaskGenerateModal
        isOpen={bulkTaskModal.isOpen}
        onClose={bulkTaskModal.close}
        caseId={caseData.id}
        taskTemplates={taskTemplates}
        existingTasks={tasks}
        onSaved={handleSaved}
      />

      <AssigneeManageModal
        isOpen={assigneeModal.isOpen}
        onClose={assigneeModal.close}
        caseId={caseData.id}
        caseMembers={caseMembers}
        tasks={tasks}
        allMembers={allMembers}
        onSaved={handleSaved}
      />

      <AddTaskModal
        isOpen={addTaskModal.isOpen}
        onClose={addTaskModal.close}
        caseId={caseData.id}
        allMembers={allMembers}
        onSaved={handleSaved}
      />

      <EditClientModal
        isOpen={clientEditModal.isOpen}
        onClose={clientEditModal.close}
        caseData={caseData}
        onSaved={handleSaved}
      />

      <EditAssetsModal
        isOpen={assetsEditModal.isOpen}
        onClose={assetsEditModal.close}
        caseData={caseData}
        onSaved={handleSaved}
      />
    </div>
  )
}

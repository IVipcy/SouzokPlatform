import { redirect } from 'next/navigation'
import TaskListClient from '@/components/features/tasks/TaskListClient'
import { loadTaskListData } from '@/lib/loadTaskListData'
import { isMinimalMode } from '@/lib/featureMode'

export default async function TasksPage() {
  if (isMinimalMode()) redirect('/my')
  const { tasks, caseMap, allMembers, currentMemberId, receipts, financeBlockedCaseIds } = await loadTaskListData()
  return (
    <TaskListClient
      tasks={tasks}
      caseMap={caseMap}
      allMembers={allMembers}
      currentMemberId={currentMemberId}
      receipts={receipts}
      financeBlockedCaseIds={financeBlockedCaseIds}
      roleScope="assistant"
    />
  )
}

import TaskListClient from '@/components/features/tasks/TaskListClient'
import { loadTaskListData } from '@/lib/loadTaskListData'

export default async function TasksPage() {
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

import { redirect } from 'next/navigation'
import TaskListClient from '@/components/features/tasks/TaskListClient'
import { loadTaskListData } from '@/lib/loadTaskListData'
import { getCurrentUser, canSeeManagerTasks } from '@/lib/auth'
import { isMinimalMode } from '@/lib/featureMode'

// 管理担当タスク一覧（work_role='manager' のみ）。管理担当系アカウントのみアクセス可。
export default async function ManagerTasksPage() {
  if (isMinimalMode()) redirect('/my')
  const user = await getCurrentUser()
  if (!canSeeManagerTasks(user)) redirect('/tasks')

  const { tasks, caseMap, allMembers, currentMemberId, receipts, financeBlockedCaseIds } = await loadTaskListData()
  return (
    <TaskListClient
      tasks={tasks}
      caseMap={caseMap}
      allMembers={allMembers}
      currentMemberId={currentMemberId}
      receipts={receipts}
      financeBlockedCaseIds={financeBlockedCaseIds}
      roleScope="manager"
    />
  )
}

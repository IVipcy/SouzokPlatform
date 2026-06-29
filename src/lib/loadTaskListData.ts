import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { toReadinessReceipts, type ReadinessReceipt } from '@/lib/taskReadiness'
import type { TaskRow, MemberRow } from '@/types'

type RawMember = { id: string; name: string; avatar_color: string; avatar_url: string | null }
type CaseMemberInfo = RawMember
export type TaskListCaseInfo = {
  case_number: string
  deal_name: string
  status: string
  service_category: string | null
  service_category_2: string | null
  expected_completion_date: string | null
  sales?: CaseMemberInfo
  manager?: CaseMemberInfo
}

/**
 * 事務管理タスク一覧 / 管理担当タスク一覧 で共通利用する一覧データ。
 * タスク・案件マップ・メンバー・受信簿（着手OK判定用）をまとめて取得する。
 */
export async function loadTaskListData(): Promise<{
  tasks: TaskRow[]
  caseMap: Record<string, TaskListCaseInfo>
  allMembers: MemberRow[]
  currentMemberId: string | null
  receipts: ReadinessReceipt[]
}> {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const [tasksResult, casesResult, membersResult, receiptsResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*)), started_by_member:members!tasks_started_by_fkey(*)')
      .order('sort_order'),
    supabase
      .from('cases')
      .select('id, case_number, deal_name, status, service_category, service_category_2, expected_completion_date, case_members(role, members(*))'),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('document_receipts')
      .select('received_date, started_task_id, items:document_receipt_items(item_name, item_tasks:document_receipt_item_tasks(task:tasks(id)))'),
  ])

  type RawCaseRow = {
    id: string
    case_number: string
    deal_name: string
    status: string
    service_category: string | null
    service_category_2: string | null
    expected_completion_date: string | null
    case_members?: { role: string; members: RawMember | null }[] | null
  }
  const toMemberInfo = (m: RawMember | null | undefined): CaseMemberInfo | undefined =>
    m ? { id: m.id, name: m.name, avatar_color: m.avatar_color, avatar_url: m.avatar_url ?? null } : undefined

  const caseMap: Record<string, TaskListCaseInfo> = {}
  ;((casesResult.data ?? []) as unknown as RawCaseRow[]).forEach(c => {
    caseMap[c.id] = {
      case_number: c.case_number,
      deal_name: c.deal_name,
      status: c.status,
      service_category: c.service_category ?? null,
      service_category_2: c.service_category_2 ?? null,
      expected_completion_date: c.expected_completion_date ?? null,
      sales: toMemberInfo(c.case_members?.find(cm => cm.role === 'sales')?.members),
      manager: toMemberInfo(c.case_members?.find(cm => cm.role === 'manager')?.members),
    }
  })

  const receipts: ReadinessReceipt[] = toReadinessReceipts(
    (receiptsResult.data ?? []) as unknown as Parameters<typeof toReadinessReceipts>[0],
  )

  return {
    tasks: (tasksResult.data ?? []) as TaskRow[],
    caseMap,
    allMembers: (membersResult.data ?? []) as MemberRow[],
    currentMemberId: currentUser?.memberId ?? null,
    receipts,
  }
}

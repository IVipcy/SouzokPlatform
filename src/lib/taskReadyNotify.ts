import { createClient } from '@/lib/supabase/client'

// 「次に着手できる」と指定されたタスクを、担当者に届ける処理。
//
// 事務管理担当がタスクを完了して次の工程を着手OKにしても、それが管理担当（や受注担当）の
// タスクだと本人に何も届かず、気づけなかった。ここで2つやる。
//   1) 担当者が付いていないタスクに、案件の管理担当／受注担当を付ける
//      （マイページのタスクタブは task_assignees で自分のぶんを拾うため、付けないと一覧に出ない）
//   2) その担当者へ通知を出す（通知をクリックするとそのタスクの詳細へ飛ぶ）
//
// 事務管理担当のタスク（担当区分＝事務）は一覧で拾う運用なので、ここでは何もしない。
// 相続登記チームのタスク（task_kind='touki_team'）は案件の担当ではなくチームのキューで拾うので、
// 割当は付けず、チームのメンバー（members.is_touki_team）全員に通知だけ出す。
// 以前はどちらにも当たらず、作っても誰にも届いていなかった。

export type ReadyTaskLite = {
  id: string
  title: string
  case_id: string
  task_kind?: string | null
  assign_role?: string | null
  work_role?: string | null
  /** now=今すぐ着手OK / receipt=受領次第OK */
  mode: 'now' | 'receipt'
  /** 着手OK理由 or 何の受領待ちか */
  note?: string
}

/** そのタスクを持つのは誰か（案件の担当区分）。事務管理タスクは null。 */
const roleOf = (t: ReadyTaskLite): 'sales' | 'manager' | null => {
  const r = t.assign_role ?? t.work_role ?? (t.task_kind === 'system' ? 'manager' : null)
  return r === 'sales' ? 'sales' : r === 'manager' ? 'manager' : null
}

export async function notifyTasksReady(tasks: ReadyTaskLite[], fromTaskTitle: string): Promise<void> {
  if (tasks.length === 0) return
  const supabase = createClient()
  const caseId = tasks[0].case_id

  const hasToukiTeam = tasks.some(t => t.task_kind === 'touki_team')
  const [{ data: c }, { data: cms }, { data: asg }, { data: toukiMembers }] = await Promise.all([
    supabase.from('cases').select('case_number, deal_name').eq('id', caseId).maybeSingle(),
    supabase.from('case_members').select('member_id, role').eq('case_id', caseId).in('role', ['sales', 'manager']),
    supabase.from('task_assignees').select('task_id, member_id').in('task_id', tasks.map(t => t.id)),
    // 相続登記チームの宛先。登記タスクが無いときは引かない
    hasToukiTeam
      ? supabase.from('members').select('id').eq('is_active', true).eq('is_touki_team', true)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ])
  const toukiTeamIds = ((toukiMembers ?? []) as Array<{ id: string }>).map(m => m.id)

  const memberByRole = new Map<string, string[]>()
  for (const m of (cms ?? []) as Array<{ member_id: string | null; role: string }>) {
    if (!m.member_id) continue
    memberByRole.set(m.role, [...(memberByRole.get(m.role) ?? []), m.member_id])
  }
  const assigneesByTask = new Map<string, string[]>()
  for (const a of (asg ?? []) as Array<{ task_id: string; member_id: string | null }>) {
    if (!a.member_id) continue
    assigneesByTask.set(a.task_id, [...(assigneesByTask.get(a.task_id) ?? []), a.member_id])
  }

  const label = `${(c as { case_number?: string } | null)?.case_number ?? ''} ${(c as { deal_name?: string } | null)?.deal_name ?? ''}`.trim()
  const newAssignees: Array<{ task_id: string; member_id: string; role: string }> = []
  const notifications: Array<Record<string, unknown>> = []

  for (const t of tasks) {
    let ids = assigneesByTask.get(t.id) ?? []
    if (t.task_kind === 'touki_team') {
      // 相続登記チーム：割当は付けず、チーム全員へ通知（誰が取るかはチームのキューで決める）
      if (ids.length === 0) ids = toukiTeamIds
      if (ids.length === 0) continue            // チームに誰も登録されていない
    } else if (ids.length === 0) {
      const role = roleOf(t)
      if (!role) continue                       // 事務管理タスクで担当者未設定 → 何もしない
      ids = memberByRole.get(role) ?? []
      if (ids.length === 0) continue            // その担当がまだ案件に付いていない
      for (const member_id of ids) newAssignees.push({ task_id: t.id, member_id, role: 'primary' })
    }
    const head = t.mode === 'receipt' ? '受領次第OK' : '着手OK'
    const tail = (t.note ?? '').trim()
    notifications.push(...ids.map(member_id => ({
      member_id, type: 'task_ready', case_id: t.case_id, task_id: t.id,
      title: `${head}：${t.title}`,
      body: `${label}：「${fromTaskTitle}」が完了し、「${t.title}」が${head}になりました。${tail ? `（${tail}）` : ''}`,
    })))
  }

  if (newAssignees.length > 0) await supabase.from('task_assignees').insert(newAssignees)
  if (notifications.length > 0) await supabase.from('notifications').insert(notifications)
}

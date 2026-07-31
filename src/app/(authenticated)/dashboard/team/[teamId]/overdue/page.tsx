import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, isSystemManager } from '@/lib/auth'
import { overdueSeverity, calDaysOverdue, type OverdueSeverity } from '@/lib/overdue'
import OverdueDetailClient from '@/components/features/my/OverdueDetailClient'
import type { TaskRow } from '@/types'

// チームダッシュボードの要確認/要注意バナー遷移先。チームスコープの案件で
// 入金超過の請求 + タスク超過の案件を一覧する。/my/overdue と同じ UI(OverdueDetailClient)。

type SearchParams = Promise<{ sev?: string }>
type Params = Promise<{ teamId: string }>

export default async function TeamOverduePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { teamId } = await params
  const { sev } = await searchParams
  const user = await getCurrentUser()
  if (!user?.memberId) redirect('/login')
  if (!isSystemManager(user) && user.teamId !== teamId) redirect('/')
  const supabase = await createClient()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // チーム情報 + 管理担当メンバー
  const [{ data: team }, { data: teamMembers }] = await Promise.all([
    supabase.from('teams').select('id,name').eq('id', teamId).eq('is_active', true).single(),
    supabase.from('members').select('id,primary_role').eq('is_active', true).eq('team_id', teamId),
  ])
  if (!team) notFound()
  const managerIds = ((teamMembers ?? []) as Array<{ id: string; primary_role: string | null }>).filter(m => m.primary_role === 'manager').map(m => m.id)

  // チームスコープの案件 = 管理担当がチーム所属メンバーの案件
  const { data: caseMembers } = await supabase.from('case_members').select('case_id, member_id, role').in('role', ['manager']).in('member_id', managerIds.length ? managerIds : ['00000000-0000-0000-0000-000000000000'])
  const scopeCaseIds = [...new Set(((caseMembers ?? []) as Array<{ case_id: string }>).map(cm => cm.case_id))]

  if (scopeCaseIds.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="Team · Overdue"
          title={`${team.name}・要対応（期日超過）一覧`}
          icon={AlertTriangle}
          description="要確認・要注意 すべて"
          right={<Link href={`/dashboard/team/${teamId}/progress`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"><ArrowLeft className="w-3.5 h-3.5" /> チーム進捗へ</Link>}
        />
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">このチームの案件がありません</div>
      </div>
    )
  }

  // 案件基本情報 + 依頼者名
  const { data: casesRaw } = await supabase.from('cases').select('id, case_number, deal_name, status, client_id, clients(name)').in('id', scopeCaseIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cases = ((casesRaw ?? []) as any[])

  // タスク（非完了）+ 請求（非入金済）
  const [tasksRes, invoicesRes] = await Promise.all([
    supabase.from('tasks').select('*').in('case_id', scopeCaseIds).neq('status', '完了').neq('status', 'キャンセル'),
    supabase.from('invoices').select('id, case_id, invoice_type, amount, firm_type, status, due_date, cases(case_number, deal_name)').in('case_id', scopeCaseIds).neq('status', '入金済').neq('status', 'キャンセル'),
  ])
  const tasks = (tasksRes.data ?? []) as TaskRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesRes.data ?? []) as any[]

  // 入金期日超過の請求
  type BillLite = { id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string; amount: number; dueDate: string; over: number; severity: OverdueSeverity }
  const firmLabel = (f: string | null | undefined) => f === 'shiho' ? '司法' : f === 'gyosei' ? '行政' : ''
  const overdueBills: BillLite[] = invoices
    .map(inv => ({ inv, sev: inv.status === '入金待ち' ? overdueSeverity(inv.due_date, todayStr) : null }))
    .filter((x): x is { inv: typeof invoices[number]; sev: OverdueSeverity } => x.sev !== null)
    .map(({ inv, sev }) => ({
      id: inv.id, caseId: inv.case_id,
      caseName: inv.cases?.deal_name ?? '',
      typeLabel: inv.invoice_type ?? '', firmLabel: firmLabel(inv.firm_type),
      amount: inv.amount ?? 0, dueDate: inv.due_date as string,
      over: calDaysOverdue(inv.due_date as string, todayStr), severity: sev,
    }))

  // 案件別の超過タスク集計。ケース出現は重い超過(kakunin/chui)、リスト表示は軽微も全件含む。
  type OverdueTaskLite = { id: string; title: string; due_date: string; over: number; severity: OverdueSeverity | null }
  const caseOverdue = new Map<string, {
    severity: OverdueSeverity
    countTasks: number; countCase: number; countSystem: number
    caseTasks: OverdueTaskLite[]; systemTasks: OverdueTaskLite[]
  }>()
  const caseHasSevere = new Set<string>()
  for (const t of tasks) {
    if (!t.due_date) continue
    if ((t.due_date as string) >= todayStr) continue
    const sev = overdueSeverity(t.due_date, todayStr)
    if (sev) caseHasSevere.add(t.case_id)
    const cur = caseOverdue.get(t.case_id) ?? { severity: (sev ?? 'kakunin') as OverdueSeverity, countTasks: 0, countCase: 0, countSystem: 0, caseTasks: [], systemTasks: [] }
    if (sev === 'chui') cur.severity = 'chui'
    else if (sev === 'kakunin' && cur.severity !== 'chui') cur.severity = 'kakunin'
    cur.countTasks += 1
    const lite: OverdueTaskLite = { id: t.id, title: t.title, due_date: t.due_date as string, over: calDaysOverdue(t.due_date as string, todayStr), severity: sev }
    if (t.task_kind === 'case') { cur.countCase += 1; cur.caseTasks.push(lite) }
    if (t.task_kind === 'system') { cur.countSystem += 1; cur.systemTasks.push(lite) }
    caseOverdue.set(t.case_id, cur)
  }
  for (const cid of [...caseOverdue.keys()]) {
    if (!caseHasSevere.has(cid)) caseOverdue.delete(cid)
  }
  for (const v of caseOverdue.values()) {
    v.caseTasks.sort((a, b) => a.due_date.localeCompare(b.due_date))
    v.systemTasks.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }

  // 案件別 進捗（完了含む全タスクの分母/分子）
  const { data: allTasksRaw } = await supabase.from('tasks').select('case_id,status,task_kind').in('case_id', scopeCaseIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks = (allTasksRaw ?? []) as any[]
  const progressByCase = new Map<string, { doneCase: number; totalCase: number; doneSystem: number; totalSystem: number }>()
  for (const t of allTasks) {
    const cur = progressByCase.get(t.case_id) ?? { doneCase: 0, totalCase: 0, doneSystem: 0, totalSystem: 0 }
    if (t.task_kind === 'case') { cur.totalCase += 1; if (t.status === '完了') cur.doneCase += 1 }
    if (t.task_kind === 'system') { cur.totalSystem += 1; if (t.status === '完了') cur.doneSystem += 1 }
    progressByCase.set(t.case_id, cur)
  }

  const caseList = cases.map(c => {
    const p = progressByCase.get(c.id)
    return {
      id: c.id, case_number: c.case_number, deal_name: c.deal_name, status: c.status,
      client_name: c.clients?.name ?? null,
      overdue: caseOverdue.get(c.id) ?? null,
      progressCaseDone: p?.doneCase ?? 0,
      progressCaseTotal: p?.totalCase ?? 0,
      progressSystemDone: p?.doneSystem ?? 0,
      progressSystemTotal: p?.totalSystem ?? 0,
    }
  }).filter(c => !!c.overdue)

  const sevFilter: OverdueSeverity | null = sev === 'kakunin' ? 'kakunin' : sev === 'chui' ? 'chui' : null
  const fBills = sevFilter ? overdueBills.filter(b => b.severity === sevFilter) : overdueBills
  const fCases = sevFilter ? caseList.filter(c => c.overdue?.severity === sevFilter) : caseList

  return (
    <div>
      <PageHeader
        eyebrow="Team · Overdue"
        title={`${team.name}・要対応（期日超過）一覧`}
        icon={AlertTriangle}
        description={sevFilter ? (sevFilter === 'chui' ? '要注意（2週間以上超過）' : '要確認（5営業日超過）') : '要確認・要注意 すべて'}
        right={<Link href={`/dashboard/team/${teamId}/progress`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"><ArrowLeft className="w-3.5 h-3.5" /> チーム進捗へ</Link>}
      />
      <OverdueDetailClient bills={fBills} cases={fCases} sev={sevFilter} />
    </div>
  )
}

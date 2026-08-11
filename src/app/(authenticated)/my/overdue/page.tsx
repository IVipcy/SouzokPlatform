import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canSeeMyPage } from '@/lib/auth'
import { overdueSeverity, billOverdueSeverity, calDaysOverdue, type OverdueSeverity } from '@/lib/overdue'
import OverdueDetailClient from '@/components/features/my/OverdueDetailClient'
import { computeUrgentReportAlerts, computeParcelArrivalAlerts } from '@/lib/caseStateAlerts'
import { fetchCaseAlertContexts } from '@/lib/caseAlertContext'
import { evaluateCaseAlerts, bannerOf } from '@/lib/alertRules'
import type { TaskRow } from '@/types'

// マイページ上部の要確認/要注意バナーの遷移先。バナーで選んだ severity で絞り込み表示。
// 入金超過の請求＋案件別表（事務管理・受注/管理担当タスクを問わず超過が発生している案件）を並べる。

type SearchParams = Promise<{ sev?: string }>

export default async function OverdueDetailPage({ searchParams }: { searchParams: SearchParams }) {
  const { sev } = await searchParams
  const user = await getCurrentUser()
  if (!user?.memberId) redirect('/login')
  if (!canSeeMyPage(user)) redirect('/')
  const memberId = user.memberId
  const supabase = await createClient()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // 自分が担当する全案件
  const { data: myCaseMembers } = await supabase.from('case_members').select('case_id, role, cases(id, case_number, deal_name, status, expected_completion_date, completion_date, has_complaint, procedure_type, order_sheet_completed_at, order_received_date, order_route_detail, meeting_executed_date, client_response_due_date, meeting_date, management_started_at, manager_assign_skipped, created_at, last_opened_at, fee_total, total_revenue_estimate, tax_filing_required, client_id, clients(name))').eq('member_id', memberId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((myCaseMembers ?? []) as any[])
  const myCaseIds = [...new Set(rows.map(r => r.case_id))]

  // 自分の案件に紐づく全タスク（事務管理・受注/管理担当ともに）＋ 自分の案件の全請求
  const [tasksRes, invoicesRes] = await Promise.all([
    myCaseIds.length ? supabase.from('tasks').select('*, cases(id, case_number, deal_name, status), task_assignees(member_id)').in('case_id', myCaseIds).neq('status', '完了').neq('status', 'キャンセル') : Promise.resolve({ data: [] }),
    myCaseIds.length ? supabase.from('invoices').select('id, case_id, invoice_type, amount, firm_type, status, due_date, cases(case_number, deal_name)').in('case_id', myCaseIds).neq('status', '入金済').neq('status', 'キャンセル') : Promise.resolve({ data: [] }),
  ])
  const tasks = (tasksRes.data ?? []) as TaskRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesRes.data ?? []) as any[]

  // 期日超過(kakunin/chui)を判定
  type BillLite = { id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string; amount: number; dueDate: string; over: number; severity: OverdueSeverity }
  const firmLabel = (f: string | null | undefined) => f === 'shiho' ? '司法' : f === 'gyosei' ? '行政' : ''
  const overdueBills: BillLite[] = invoices
    .map(inv => ({ inv, sev: inv.status === '入金待ち' ? billOverdueSeverity(inv.due_date, todayStr) : null }))
    .filter((x): x is { inv: typeof invoices[number]; sev: OverdueSeverity } => x.sev !== null)
    .map(({ inv, sev }) => ({
      id: inv.id, caseId: inv.case_id,
      caseName: inv.cases?.deal_name ?? '',
      typeLabel: inv.invoice_type ?? '',
      firmLabel: firmLabel(inv.firm_type),
      amount: inv.amount ?? 0, dueDate: inv.due_date as string,
      over: calDaysOverdue(inv.due_date as string, todayStr), severity: sev,
    }))

  // 案件別の超過タスク集計。
  //   ①案件の出現判定: 「kakunin/chui級の重い超過が1件以上」あるときのみ /my/overdue に出す (caseHasSevere)
  //   ②リスト表示: そのケースについて 期日超過(due_date < today) の未完了タスクは 全件 表示 (軽微=severity:null も含む)
  //   ③重要度(severity): ケース内で最も重い(chui > kakunin > null)
  type OverdueTaskLite = { id: string; title: string; due_date: string; over: number; severity: OverdueSeverity | null; priority: string | null; kind: 'case' | 'system' }
  const caseOverdue = new Map<string, {
    severity: OverdueSeverity        // ケース重要度 (chui/kakunin)
    countTasks: number; countCase: number; countSystem: number
    caseTasks: OverdueTaskLite[]     // 事務管理側の超過タスク(軽微含む・古い順)
    systemTasks: OverdueTaskLite[]   // 受注/管理側の超過タスク(軽微含む・古い順)
  }>()
  const caseHasSevere = new Set<string>()
  for (const t of tasks) {
    // 超急ぎタスクは期日超過してなくても要注意(chui)としてバナーと揃える
    const superUrgent = t.priority === '超急ぎ'
    const overdue = !!t.due_date && (t.due_date as string) < todayStr
    if (!overdue && !superUrgent) continue
    const sev: OverdueSeverity | null = superUrgent ? 'chui' : overdueSeverity(t.due_date, todayStr)
    if (sev) caseHasSevere.add(t.case_id)
    const cur = caseOverdue.get(t.case_id) ?? {
      severity: (sev ?? 'kakunin') as OverdueSeverity,     // 軽微しかない場合は表示上 kakunin 相当だが、caseHasSevere で出現制御
      countTasks: 0, countCase: 0, countSystem: 0,
      caseTasks: [], systemTasks: [],
    }
    if (sev === 'chui') cur.severity = 'chui'
    else if (sev === 'kakunin' && cur.severity !== 'chui') cur.severity = 'kakunin'
    cur.countTasks += 1
    const base = { id: t.id, title: t.title, due_date: (t.due_date as string) || todayStr, over: t.due_date ? Math.max(0, calDaysOverdue(t.due_date as string, todayStr)) : 0, severity: sev, priority: t.priority ?? null }
    if (t.task_kind === 'case') { cur.countCase += 1; cur.caseTasks.push({ ...base, kind: 'case' }) }
    if (t.task_kind === 'system') { cur.countSystem += 1; cur.systemTasks.push({ ...base, kind: 'system' }) }
    caseOverdue.set(t.case_id, cur)
  }
  // ケースが 重い超過1件でも無ければ、/my/overdue には出さない
  for (const cid of [...caseOverdue.keys()]) {
    if (!caseHasSevere.has(cid)) caseOverdue.delete(cid)
  }
  // 各リストは古い順ソート
  for (const v of caseOverdue.values()) {
    v.caseTasks.sort((a, b) => a.due_date.localeCompare(b.due_date))
    v.systemTasks.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }

  // 案件別の進捗（事務管理/受注管理を分けた分母・分子）— 完了含む全タスクが必要なため別クエリ
  const [progRes, parcelRes, advInvRes] = await Promise.all([
    myCaseIds.length ? supabase.from('tasks').select('case_id,status,task_kind').in('case_id', myCaseIds) : Promise.resolve({ data: [] }),
    myCaseIds.length ? supabase.from('document_receipts').select('id, case_id, arrival_notified_at, cases(case_number, deal_name)').in('case_id', myCaseIds).eq('is_parcel', true).not('arrival_notified_at', 'is', null).is('opened_at', null) : Promise.resolve({ data: [] }),
    // 前受金の請求書が「あるか」だけを見る。上の請求クエリは入金済を除いているため判定に使えない。
    myCaseIds.length ? supabase.from('invoices').select('case_id, status').eq('invoice_type', '前受金').in('case_id', myCaseIds) : Promise.resolve({ data: [] }),
  ])
  const advanceStatusByCase = new Map<string, string>()
  for (const r of ((advInvRes.data ?? []) as Array<{ case_id: string; status: string }>)) {
    if (!advanceStatusByCase.has(r.case_id)) advanceStatusByCase.set(r.case_id, r.status)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks = (progRes.data ?? []) as any[]
  const progressByCase = new Map<string, { doneCase: number; totalCase: number; doneSystem: number; totalSystem: number }>()
  for (const t of allTasks) {
    const cur = progressByCase.get(t.case_id) ?? { doneCase: 0, totalCase: 0, doneSystem: 0, totalSystem: 0 }
    if (t.task_kind === 'case') { cur.totalCase += 1; if (t.status === '完了') cur.doneCase += 1 }
    if (t.task_kind === 'system') { cur.totalSystem += 1; if (t.status === '完了') cur.doneSystem += 1 }
    progressByCase.set(t.case_id, cur)
  }

  // 案件別表：管理案件一覧と同じ列相当。ここでは超過ありのみをリストする。
  const caseList = rows
    .map(r => r.cases)
    .filter((c): c is NonNullable<typeof rows[number]['cases']> => !!c)
    .filter((c: { id: string }, i: number, arr: unknown[]) => arr.findIndex(x => (x as { id: string }).id === c.id) === i)
    .map(c => {
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
    })
    .filter(c => !!c.overdue)

  // 案件アラート（管理担当未アサイン等・レコード無しの計算アラート）。受注担当が持つ案件が対象。
  const salesCaseIds = new Set(rows.filter(r => r.role === 'sales').map(r => r.case_id))
  const managerCaseIds = new Set(rows.filter(r => r.role === 'manager').map(r => r.case_id))
  const dedupCases = rows.map(r => r.cases).filter((c): c is NonNullable<typeof rows[number]['cases']> => !!c)
    .filter((c: { id: string }, i: number, arr: unknown[]) => arr.findIndex(x => (x as { id: string }).id === c.id) === i)
  // 案件報告のアラートはチームの案件まで見る（マイページのバナーと件数を揃える）。
  // 自分のチームのメンバーが受注担当/管理担当になっている案件が対象。
  const { data: memberRows } = await supabase.from('members').select('id, team_id').eq('is_active', true)
  const membersArr = ((memberRows ?? []) as Array<{ id: string; team_id: string | null }>)
  const myTeamId = membersArr.find(m => m.id === memberId)?.team_id ?? null
  const teamMemberIds = new Set(myTeamId ? membersArr.filter(m => m.team_id === myTeamId).map(m => m.id) : [memberId])
  const { data: teamCmRows } = await supabase.from('case_members').select('case_id, member_id, role')
  const teamCaseIds = new Set(((teamCmRows ?? []) as Array<{ case_id: string; member_id: string; role: string }>)
    .filter(c => (c.role === 'sales' || c.role === 'manager') && teamMemberIds.has(c.member_id))
    .map(c => c.case_id))
  const teamCaseIdArray = [...teamCaseIds]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let teamReportRows: any[] = []
  if (teamCaseIdArray.length > 0) {
    const { data } = await supabase.from('progress_reports')
      .select('id, case_id, kind, report_state, status, created_at, cases(case_number, deal_name)')
      .in('case_id', teamCaseIdArray).eq('status', '依頼中')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    teamReportRows = (data ?? []) as any[]
  }
  const teamCaseMeta = new Map<string, { case_number: string; deal_name: string }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    teamReportRows.map((r: any) => [r.case_id, { case_number: r.cases?.case_number ?? '', deal_name: r.cases?.deal_name ?? '' }]),
  )
  const caseStateAlerts = [
    // 案件アラート。判定は alertRules.ts に集約。
    // 案件アラート。バナー・案件の色とまったく同じ判定・同じ材料を使う（alertRules.ts / caseAlertContext.ts）。
    ...(await (async () => {
      const ids = (dedupCases as Array<{ id: string }>).map(c => c.id)
      const ctx = await fetchCaseAlertContexts(supabase, ids, todayStr)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (dedupCases as any[]).flatMap((c: any) =>
        evaluateCaseAlerts(c, ctx.get(c.id) ?? {}, todayStr).flatMap(h => {
          const sev = bannerOf(h.severity)
          if (!sev) return []
          return [{
            caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name,
            category: h.category, severity: sev, since: h.since, days: h.days, reason: h.reason,
            href: h.href ?? (h.tab ? `/cases/${c.id}?tab=${h.tab}` : undefined),
          }]
        }))
    })()),
    ...computeUrgentReportAlerts(teamReportRows, teamCaseMeta, todayStr),
    // 到着物あり（未開封の郵送物一式）→ 要確認(黄)。自分が受注/管理担当の案件。
    ...computeParcelArrivalAlerts(
      ((parcelRes.data ?? []) as unknown as Array<{ id: string; case_id: string; arrival_notified_at: string | null; cases: { case_number: string; deal_name: string } | null }>)
        .filter(p => salesCaseIds.has(p.case_id) || managerCaseIds.has(p.case_id))
        .map(p => ({ id: p.id, case_id: p.case_id, case_number: p.cases?.case_number ?? '', deal_name: p.cases?.deal_name ?? '', notified_at: p.arrival_notified_at })),
      todayStr,
    ),
  ]

  // 銀行超過はseverityで絞り込み
  const sevFilter: OverdueSeverity | null = sev === 'kakunin' ? 'kakunin' : sev === 'chui' ? 'chui' : null
  const fBills = sevFilter ? overdueBills.filter(b => b.severity === sevFilter) : overdueBills
  const fCases = sevFilter ? caseList.filter(c => c.overdue?.severity === sevFilter) : caseList
  const fAlerts = sevFilter ? caseStateAlerts.filter(a => a.severity === sevFilter) : caseStateAlerts

  return (
    <div>
      <PageHeader
        eyebrow="My"
        title="要対応（期日超過）一覧"
        icon={AlertTriangle}
        description={sevFilter ? (sevFilter === 'chui' ? '要注意（2週間以上超過）' : '要確認（5営業日超過）') : '要確認・要注意 すべて'}
        right={<Link href="/my" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"><ArrowLeft className="w-3.5 h-3.5" /> マイページへ</Link>}
      />
      <OverdueDetailClient bills={fBills} cases={fCases} caseAlerts={fAlerts} sev={sevFilter} />
    </div>
  )
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { ALERT_SEVERITY_ORDER, type AlertItem } from '@/lib/alerts'

const ACTIVE = new Set(['受注', '対応中', '保留・長期'])
const PENDING_ANSWER = new Set(['面談設定済', '検討中', '検討中（契約書待ち）'])
const ASSIGN_DEADLINE_DAYS = 3

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user?.memberId) return NextResponse.json({ alerts: [] })
  const memberId = user.memberId
  const supabase = await createClient()
  const today = new Date()
  const todayStr = ymd(today)
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 2)
  const horizonStr = ymd(horizon)
  const assignCutoff = new Date(today); assignCutoff.setDate(assignCutoff.getDate() - ASSIGN_DEADLINE_DAYS)
  const assignCutoffStr = ymd(assignCutoff)
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = ymd(weekAgo)

  // 自分が担当の案件（ロール付き）
  const { data: myCmRaw } = await supabase
    .from('case_members').select('case_id, role').eq('member_id', memberId)
  const myCm = (myCmRaw ?? []) as Array<{ case_id: string; role: string }>
  const myCaseIds = [...new Set(myCm.map(c => c.case_id))]
  const roleByCase = new Map<string, Set<string>>()
  for (const c of myCm) {
    if (!roleByCase.has(c.case_id)) roleByCase.set(c.case_id, new Set())
    roleByCase.get(c.case_id)!.add(c.role)
  }

  if (myCaseIds.length === 0) return NextResponse.json({ alerts: [] })

  const [{ data: casesRaw }, { data: allCmRaw }, { data: taskRaw }, { data: invRaw }, { data: reportRaw }, { data: reviewDoneRaw }] = await Promise.all([
    supabase.from('cases')
      .select('id,case_number,deal_name,status,has_complaint,expected_completion_date,completion_date,meeting_date,meeting_executed_date,client_response_due_date,order_received_date')
      .in('id', myCaseIds),
    supabase.from('case_members').select('case_id, role').in('case_id', myCaseIds),
    // 自分が担当の未完了タスク
    supabase.from('tasks')
      .select('id,title,due_date,status,case_id, task_assignees!inner(member_id)')
      .eq('task_assignees.member_id', memberId).neq('status', '完了'),
    supabase.from('invoices').select('case_id,invoice_type,status,due_date').in('case_id', myCaseIds),
    supabase.from('progress_reports').select('case_id,status,confirmed_date,confirmer_id,requested_date').in('case_id', myCaseIds),
    // 「検討状況の確認」(sys_review_status) が完了済みの案件 → 回答予定日アラートを抑制
    supabase.from('tasks').select('case_id,status,template_key')
      .in('case_id', myCaseIds).eq('template_key', 'sys_review_status').in('status', ['完了', 'キャンセル']),
  ])

  type CaseRow = {
    id: string; case_number: string; deal_name: string; status: string; has_complaint: boolean | null
    expected_completion_date: string | null; completion_date: string | null
    meeting_date: string | null; meeting_executed_date: string | null
    client_response_due_date: string | null; order_received_date: string | null
  }
  const cases = (casesRaw ?? []) as CaseRow[]
  const allCm = (allCmRaw ?? []) as Array<{ case_id: string; role: string }>
  const tasks = (taskRaw ?? []) as Array<{ id: string; title: string; due_date: string | null; status: string; case_id: string }>
  const invoices = (invRaw ?? []) as Array<{ case_id: string; invoice_type: string; status: string; due_date: string | null }>
  const reports = (reportRaw ?? []) as Array<{ case_id: string; status: string; confirmed_date: string | null; confirmer_id: string | null; requested_date: string | null }>

  // 「検討状況の確認」(sys_review_status) が完了済みの案件
  const reviewDoneCaseIds = new Set(((reviewDoneRaw ?? []) as Array<{ case_id: string }>).map(r => r.case_id))

  const managerExists = new Set(allCm.filter(c => c.role === 'manager').map(c => c.case_id))
  const advanceStatusByCase = new Map<string, string>()
  for (const i of invoices) if (i.invoice_type === '前受金' && !advanceStatusByCase.has(i.case_id)) advanceStatusByCase.set(i.case_id, i.status)
  // 入金期日を過ぎた未入金の請求がある案件
  const overduePayCaseIds = new Set(invoices.filter(i => i.due_date && i.due_date < todayStr && i.status !== '入金済').map(i => i.case_id))
  const recentConfirmed = new Set(reports.filter(r => r.status === '確認済' && (r.confirmed_date ?? '') >= weekAgoStr).map(r => r.case_id))

  const alerts: AlertItem[] = []
  const push = (a: AlertItem) => alerts.push(a)

  for (const c of cases) {
    const roles = roleByCase.get(c.id) ?? new Set<string>()
    const isMySales = roles.has('sales')
    const isMyManager = roles.has('manager') || roles.has('sub_manager')
    const active = ACTIVE.has(c.status)
    const caseHref = `/cases/${c.id}`
    const name = `${c.case_number} ${c.deal_name}`

    if (c.has_complaint && active) {
      push({ id: `claim-${c.id}`, severity: 'claim', category: 'クレーム案件', title: name, body: '依頼者からのクレーム。最優先で対応', href: caseHref })
    }
    // 書類到着・未処理のアラートは廃止（着手するのは事務管理担当でシフト制のため、案件メンバー宛アラートにそぐわない）
    if (isMySales && c.status === '受注' && !managerExists.has(c.id) && c.order_received_date && c.order_received_date <= assignCutoffStr) {
      push({ id: `assign-${c.id}`, severity: 'high', category: 'アサイン未完了', title: name, body: '受注から3日経過・管理担当が未アサイン', href: `${caseHref}?tab=basicInfo` })
    }
    const advStatus = advanceStatusByCase.get(c.id)
    if (active && (advStatus === '作成済' || advStatus === '入金待ち')) {
      push({ id: `advance-${c.id}`, severity: 'high', category: '前受金 未入金', title: name, body: '前受金の入金が未確認です', href: `/billing?case=${c.id}` })
    }
    if (isMySales && overduePayCaseIds.has(c.id)) {
      push({ id: `paydue-${c.id}`, severity: 'high', category: '入金期日 超過', title: name, body: '入金期日を過ぎた未入金の請求があります', href: '/my?tab=billing' })
    }
    if (isMyManager && c.expected_completion_date && c.expected_completion_date < todayStr && c.status !== '完了' && c.status !== '失注') {
      push({ id: `overdue-comp-${c.id}`, severity: 'high', category: '完了予定日 超過', title: name, body: `完了予定日 ${c.expected_completion_date} を超過`, href: `${caseHref}?tab=tasks` })
    }
    if (isMyManager && active && !recentConfirmed.has(c.id)) {
      // 進捗報告の発行は自分のマイページ進捗報告タブで行うため、そこへ誘導
      push({ id: `weekly-${c.id}`, severity: 'mid', category: '週次報告の漏れ', title: name, body: '直近7日に確認済の進捗報告がありません', href: '/my?tab=progress' })
    }
    if (isMySales && c.meeting_date && c.meeting_date < todayStr && !c.meeting_executed_date && PENDING_ANSWER.has(c.status)) {
      push({ id: `memo-${c.id}`, severity: 'mid', category: '面談メモ未記載', title: name, body: '面談予定日を超過・面談メモ未記載', href: `${caseHref}?tab=basicInfo` })
    }
    if (isMySales && PENDING_ANSWER.has(c.status) && c.client_response_due_date && c.client_response_due_date <= horizonStr && !reviewDoneCaseIds.has(c.id)) {
      const over = c.client_response_due_date < todayStr
      push({ id: `due-${c.id}`, severity: 'mid', category: over ? 'お客様回答予定日 超過' : 'お客様回答予定日 間近', title: name, body: `回答予定日 ${c.client_response_due_date}`, href: `${caseHref}?tab=clientInfo` })
    }
  }

  // タスク期限超過（自分担当の未完了タスク）
  for (const t of tasks) {
    if (t.due_date && t.due_date < todayStr && t.status !== 'キャンセル') {
      push({ id: `task-${t.id}`, severity: 'high', category: 'タスク期限超過', title: t.title, body: `期限 ${t.due_date} を超過`, href: `/tasks/${t.id}` })
    }
  }

  // 進捗確認依頼（自分が確認者で依頼中）
  for (const r of reports) {
    if (r.status === '依頼中' && r.confirmer_id === memberId) {
      const c = cases.find(x => x.id === r.case_id)
      push({ id: `review-${r.case_id}`, severity: 'info', category: '進捗確認依頼', title: c ? `${c.case_number} ${c.deal_name}` : '進捗確認依頼', body: '進捗確認の依頼が届いています', href: '/my?tab=reviews' })
    }
  }

  alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
  return NextResponse.json({ alerts })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { ALERT_SEVERITY_ORDER, type AlertItem } from '@/lib/alerts'
import { evaluateCaseAlerts, ALERT_DAYS } from '@/lib/alertRules'
import { caseReportSeverity } from '@/lib/caseReports'
import { PREPAY_THANKS_TITLE, prepayThanksSeverity } from '@/lib/prepayThanks'
import { overdueSeverity, bizDaysOverdue } from '@/lib/overdue'
import { CONTRACT_PENDING_STATUSES, PROGRESS_REPORT_STATE_URGENT } from '@/lib/constants'

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

  const [{ data: casesRaw }, { data: taskRaw }, { data: invRaw }, { data: reportRaw }, { data: reviewDoneRaw }, { data: contractDocRaw }, { data: caseTaskRaw }, { data: parcelRaw }, { data: hourensouRaw }] = await Promise.all([
    supabase.from('cases')
      .select('id,case_number,deal_name,status,has_complaint,expected_completion_date,completion_date,meeting_date,meeting_executed_date,client_response_due_date,order_received_date,order_sheet_completed_at,management_started_at')
      .in('id', myCaseIds),
    // 自分が担当の未完了タスク
    supabase.from('tasks')
      .select('id,title,due_date,status,case_id,template_key,source_rid,task_kind,priority, task_assignees!inner(member_id)')
      .eq('task_assignees.member_id', memberId).neq('status', '完了'),
    supabase.from('invoices').select('case_id,invoice_type,status,due_date,created_at').in('case_id', myCaseIds),
    supabase.from('progress_reports').select('case_id,status,confirmed_date,confirmer_id,requested_date,report_state').in('case_id', myCaseIds),
    // 「検討状況の確認」(sys_review_status) が完了済みの案件 → 回答予定日アラートを抑制
    supabase.from('tasks').select('case_id,status,template_key')
      .in('case_id', myCaseIds).eq('template_key', 'sys_review_status').in('status', ['完了', 'キャンセル']),
    // 契約手続き（契約関連書類の受領状況）→ 未回収アラート判定用
    supabase.from('contract_documents').select('case_id,status,arrival_date').in('case_id', myCaseIds),
    // 事務管理タスク（task_kind='case'）の有無 → 「タスク未生成」判定用
    supabase.from('tasks').select('case_id').eq('task_kind', 'case').in('case_id', myCaseIds),
    // 受注/管理宛の郵送物一式（未開封・到着連絡済み）→ 到着物あり アラート
    supabase.from('document_receipts').select('id, case_id, cases(case_number, deal_name)')
      .in('case_id', myCaseIds).eq('is_parcel', true).not('arrival_notified_at', 'is', null).is('opened_at', null),
    // 報連相（要対応の未回答）→ 1営業日で要確認・3営業日で要注意
    supabase.from('case_reports').select('case_id,kind,status,requested_date').in('case_id', myCaseIds),
  ])

  type CaseRow = {
    id: string; case_number: string; deal_name: string; status: string; has_complaint: boolean | null
    expected_completion_date: string | null; completion_date: string | null
    meeting_date: string | null; meeting_executed_date: string | null
    client_response_due_date: string | null; order_received_date: string | null
    order_sheet_completed_at: string | null; management_started_at: string | null
  }
  const cases = (casesRaw ?? []) as CaseRow[]
  const tasks = (taskRaw ?? []) as Array<{ id: string; title: string; due_date: string | null; status: string; case_id: string; template_key: string | null; source_rid: string | null; task_kind: string | null; priority: string | null }>
  const invoices = (invRaw ?? []) as Array<{ case_id: string; invoice_type: string; status: string; due_date: string | null; created_at: string | null }>
  const reports = (reportRaw ?? []) as Array<{ case_id: string; status: string; confirmed_date: string | null; confirmer_id: string | null; requested_date: string | null; report_state: string | null }>

  // 「検討状況の確認」(sys_review_status) が完了済みの案件
  const reviewDoneCaseIds = new Set(((reviewDoneRaw ?? []) as Array<{ case_id: string }>).map(r => r.case_id))

  const advanceStatusByCase = new Map<string, string>()
  const advanceCreatedByCase = new Map<string, string | null>()
  for (const i of invoices) if (i.invoice_type === '前受金' && !advanceStatusByCase.has(i.case_id)) {
    advanceStatusByCase.set(i.case_id, i.status)
    advanceCreatedByCase.set(i.case_id, i.created_at)
  }
  // 管理担当がアサイン済の案件（管理担当 未アサイン の判定用）
  const { data: mgrRaw } = await supabase.from('case_members').select('case_id').eq('role', 'manager').in('case_id', myCaseIds)
  const managerExistsCaseIds = new Set(((mgrRaw ?? []) as Array<{ case_id: string }>).map(r => r.case_id))
  // 契約手続き未了（受領状況が「後日郵送 / 依頼者が取得」で未到着の書類がある）案件
  const contractDocs = (contractDocRaw ?? []) as Array<{ case_id: string; status: string | null; arrival_date: string | null }>
  const contractPendingCaseIds = new Set(
    contractDocs.filter(d => CONTRACT_PENDING_STATUSES.includes(d.status ?? '') && !d.arrival_date).map(d => d.case_id),
  )
  // 入金期日を過ぎた未入金の請求がある案件
  const overduePayCaseIds = new Set(invoices.filter(i => i.due_date && i.due_date < todayStr && i.status !== '入金済').map(i => i.case_id))
  const recentConfirmed = new Set(reports.filter(r => r.status === '確認済' && (r.confirmed_date ?? '') >= weekAgoStr).map(r => r.case_id))
  // 事務管理タスク（task_kind='case'）が1件でもある案件
  const hasCaseTasks = new Set(((caseTaskRaw ?? []) as Array<{ case_id: string }>).map(r => r.case_id))
  // 報連相（要対応）が未回答のまま放置されている案件（最大の深刻度と件数）
  const reportSevByCase = new Map<string, 'high' | 'mid'>()
  const reportCntByCase = new Map<string, number>()
  for (const r of ((hourensouRaw ?? []) as Array<{ case_id: string; kind: string; status: string; requested_date: string | null }>)) {
    const sv = caseReportSeverity(r, todayStr)
    if (!sv) continue
    const s = sv === 'chui' ? 'high' : 'mid'
    reportCntByCase.set(r.case_id, (reportCntByCase.get(r.case_id) ?? 0) + 1)
    if (s === 'high' || reportSevByCase.get(r.case_id) !== 'high') reportSevByCase.set(r.case_id, s)
  }

  const alerts: AlertItem[] = []
  const push = (a: AlertItem) => alerts.push(a)

  for (const c of cases) {
    const roles = roleByCase.get(c.id) ?? new Set<string>()
    const isMySales = roles.has('sales')
    const isMyManager = roles.has('manager') || roles.has('sub_manager')
    const name = `${c.case_number} ${c.deal_name}`

    // 判定は alertRules.ts に集約。ここは「自分向けか」で絞って並べるだけ。
    const hits = evaluateCaseAlerts(c, {
      managerExists: managerExistsCaseIds.has(c.id),
      advanceInvoiceStatus: advanceStatusByCase.get(c.id) ?? null,
      advanceInvoiceCreatedAt: advanceCreatedByCase.get(c.id) ?? null,
      hasCaseTasks: hasCaseTasks.has(c.id),
      contractPending: contractPendingCaseIds.has(c.id),
      recentWeeklyConfirmed: recentConfirmed.has(c.id),
      responseCheckDone: reviewDoneCaseIds.has(c.id),
      billOverdue: overduePayCaseIds.has(c.id) ? 'mid' : null,
      reportActionOverdue: reportSevByCase.get(c.id) ?? null,
      reportActionCount: reportCntByCase.get(c.id) ?? 0,
    }, todayStr)
    for (const h of hits) {
      if (h.audience === 'sales' && !isMySales) continue
      if (h.audience === 'manager' && !isMyManager) continue
      push({
        id: `${h.key}-${c.id}`, severity: h.severity, category: h.category, title: name,
        body: h.days != null ? `${h.reason}（${h.days}営業日経過）` : h.reason,
        href: h.href ?? (h.tab ? `/cases/${c.id}?tab=${h.tab}` : `/cases/${c.id}`),
      })
    }
  }

  // タスク期限超過（自分担当の未完了タスク）
  for (const t of tasks) {
    // 前受金の入金御礼連絡だけ早く鳴らす（1営業日=要確認／2営業日=要注意）。
    if (t.title === PREPAY_THANKS_TITLE) {
      const psev = t.status !== 'キャンセル' ? prepayThanksSeverity(t.due_date, todayStr) : null
      if (psev) {
        push({ id: `prepay-${t.id}`, severity: psev, category: '前受金入金御礼 未連絡', title: t.title,
          body: `入金を確認した ${t.due_date} から日がたっています。お客様へ御礼のご連絡をお願いします`, href: `/tasks/${t.id}` })
      }
      continue
    }
    // しきい値はバナー・案件色と共通（5営業日=黄／14日=赤）。1〜4営業日の軽微は出さない。
    const tsev = t.status !== 'キャンセル' ? overdueSeverity(t.due_date, todayStr) : null
    if (tsev) {
      push({ id: `task-${t.id}`, severity: tsev === 'chui' ? 'high' : 'mid', category: 'タスク期限超過', title: t.title, body: `期限 ${t.due_date} を超過`, href: `/tasks/${t.id}` })
    }
    // 超急ぎの未着手タスク（前受金入金御礼連絡 等）→ 至急タスクとして目立たせる
    if (t.priority === '超急ぎ' && t.status === '未着手') {
      push({ id: `urgent-${t.id}`, severity: 'high', category: '至急タスク', title: t.title, body: '超急ぎのタスクです。至急対応してください', href: `/tasks/${t.id}` })
    }
    // 自分宛てタスクあり：受注/管理担当タスク(system)で未着手のもの（一括生成の事務管理タスクは対象外）
    else if (t.task_kind === 'system' && t.status === '未着手') {
      push({ id: `newtask-${t.id}`, severity: 'info', category: '自分宛てタスク', title: t.title, body: '自分宛てのタスクがあります', href: `/tasks/${t.id}` })
    }
  }

  // 到着物あり（受注/管理宛の郵送物一式・未開封・到着連絡済み）→ 到着受信簿の該当レコードへ直行
  const parcels = (parcelRaw ?? []) as unknown as Array<{ id: string; case_id: string; cases: { case_number: string; deal_name: string } | null }>
  for (const p of parcels) {
    const roles = roleByCase.get(p.case_id) ?? new Set<string>()
    if (!roles.has('sales') && !roles.has('manager') && !roles.has('sub_manager')) continue
    const nm = p.cases ? `${p.cases.case_number} ${p.cases.deal_name}` : '到着物'
    push({ id: `parcel-${p.id}`, severity: 'mid', category: '到着物あり', title: nm, body: '受注/管理宛の郵送物が届いています。開封して到着受信簿で中身を再登録・紐付けしてください', href: `/documents?receipt=${p.id}` })
  }

  // 案件報告（自分が確認者で報告中）。至急=赤／3営業日たっても未確認=黄／それ以外は青。
  for (const r of reports) {
    if (r.status !== '依頼中' || r.confirmer_id !== memberId) continue
    const c = cases.find(x => x.id === r.case_id)
    const since = (r.requested_date ?? '').slice(0, 10) || null
    const days = since ? bizDaysOverdue(since, todayStr) : null
    const urgent = r.report_state === PROGRESS_REPORT_STATE_URGENT
    const sev = urgent ? 'high' : (days != null && days >= ALERT_DAYS.reportAnswer ? 'mid' : 'info')
    push({
      id: `review-${r.case_id}`, severity: sev,
      category: urgent ? '案件報告：至急' : sev === 'mid' ? '案件報告 未回答' : '案件報告',
      title: c ? `${c.case_number} ${c.deal_name}` : '案件報告',
      body: urgent ? '至急の案件報告が届いています' : days != null && sev === 'mid' ? `案件報告が届いてから${days}営業日たっています` : '案件報告が届いています',
      href: '/my?tab=reviews',
    })
  }

  alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
  return NextResponse.json({ alerts })
}

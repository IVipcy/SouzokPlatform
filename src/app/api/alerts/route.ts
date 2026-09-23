import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { ALERT_SEVERITY_ORDER, type AlertItem } from '@/lib/alerts'
import { evaluateCaseAlerts, hourensouOverdueReason } from '@/lib/alertRules'
import { fetchCaseAlertContexts } from '@/lib/caseAlertContext'
import { caseReportSeverity } from '@/lib/caseReports'
import { progressReportLevel, progressReportCategory, progressReportReason, progressReportHref, type ProgressReportLike } from '@/lib/caseStateAlerts'
import { PREPAY_THANKS_TITLE, prepayThanksSeverity } from '@/lib/prepayThanks'
import { overdueSeverity } from '@/lib/overdue'
import { toukiSeverity, toukiOverdueDays } from '@/lib/toukiRequests'
import { todayJstYmd } from '@/lib/today'

// アラートセンター（ベル）の中身。
//   ・案件アラート … 判定は alertRules.ts、材料は caseAlertContext.ts（バナー・案件色とまったく同じ）。自分が担当の案件ぶん
//   ・タスク／到着物／登記依頼 … 自分あてのもの
//   ・案件報告（管理担当→受注担当）と 報連相（要対応） … 自分の案件に加えて「同じチームの案件」も。
//     届いた直後は受注担当だけに青、1営業日たったら黄・3営業日で赤にしてチーム全員に出す（放置を周りが拾えるように）
export async function GET() {
  const user = await getCurrentUser()
  if (!user?.memberId) return NextResponse.json({ alerts: [] })
  const memberId = user.memberId
  const supabase = await createClient()
  const todayStr = todayJstYmd()

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

  // 同じチームの案件（受注担当か管理担当が自分と同じチーム）。マイページのバナーと同じ範囲
  const { data: memberRows } = await supabase.from('members').select('id, team_id').eq('is_active', true)
  const membersArr = (memberRows ?? []) as Array<{ id: string; team_id: string | null }>
  const myTeamId = membersArr.find(m => m.id === memberId)?.team_id ?? null
  const teamMemberIds = myTeamId ? membersArr.filter(m => m.team_id === myTeamId).map(m => m.id) : [memberId]
  const { data: teamCmRaw } = await supabase.from('case_members').select('case_id, member_id, role').in('member_id', teamMemberIds).in('role', ['sales', 'manager'])
  const teamCaseIds = [...new Set(((teamCmRaw ?? []) as Array<{ case_id: string }>).map(c => c.case_id))]
  const scopeIds = [...new Set([...myCaseIds, ...teamCaseIds])]
  const myCaseSet = new Set(myCaseIds)

  const empty = <T,>() => Promise.resolve({ data: [] as T[] })
  const [{ data: casesRaw }, { data: taskRaw }, { data: reportRaw }, { data: reviewDoneRaw }, { data: parcelRaw }, { data: hourensouRaw }, alertCtx] = await Promise.all([
    scopeIds.length
      ? supabase.from('cases')
        .select('id,case_number,deal_name,status,has_complaint,expected_completion_date,completion_date,meeting_date,meeting_executed_date,client_response_due_date,order_received_date,order_sheet_completed_at,management_started_at,last_opened_at,created_at,manager_assign_skipped')
        .in('id', scopeIds)
      : empty<unknown>(),
    // 自分が担当の未完了タスク
    supabase.from('tasks')
      .select('id,title,due_date,status,case_id,template_key,source_rid,task_kind,priority, task_assignees!inner(member_id)')
      .eq('task_assignees.member_id', memberId).neq('status', '完了'),
    // 案件報告（未確認）。自分の案件＋チームの案件
    scopeIds.length ? supabase.from('progress_reports').select('id,case_id,kind,status,report_state,requested_date,created_at').in('case_id', scopeIds).eq('status', '依頼中') : empty<unknown>(),
    // 「検討状況の確認」(sys_review_status) が完了済みの案件 → 回答予定日アラートを抑制
    myCaseIds.length ? supabase.from('tasks').select('case_id,status,template_key').in('case_id', myCaseIds).eq('template_key', 'sys_review_status').in('status', ['完了', 'キャンセル']) : empty<unknown>(),
    // 受注/管理宛の郵送物一式（未開封・到着連絡済み）→ 到着物あり アラート
    myCaseIds.length ? supabase.from('document_receipts').select('id, case_id, cases(case_number, deal_name)').in('case_id', myCaseIds).eq('is_parcel', true).not('arrival_notified_at', 'is', null).is('opened_at', null) : empty<unknown>(),
    // 報連相（要対応の未回答）。チームの案件ぶん（自分の案件ぶんは alertCtx に入っている）
    teamCaseIds.length ? supabase.from('case_reports').select('case_id,kind,status,requested_date').in('case_id', teamCaseIds).eq('kind', '要対応').neq('status', '確認済') : empty<unknown>(),
    // 案件アラートの材料（バナー・案件色と同じ取り方）
    fetchCaseAlertContexts(supabase, myCaseIds, todayStr),
  ])

  type CaseRow = {
    id: string; case_number: string; deal_name: string; status: string; has_complaint: boolean | null
    expected_completion_date: string | null; completion_date: string | null
    meeting_date: string | null; meeting_executed_date: string | null
    client_response_due_date: string | null; order_received_date: string | null
    order_sheet_completed_at: string | null; management_started_at: string | null
    last_opened_at: string | null; created_at: string | null; manager_assign_skipped: boolean | null
  }
  const cases = (casesRaw ?? []) as CaseRow[]
  const caseById = new Map(cases.map(c => [c.id, c]))
  const tasks = (taskRaw ?? []) as Array<{ id: string; title: string; due_date: string | null; status: string; case_id: string; template_key: string | null; source_rid: string | null; task_kind: string | null; priority: string | null }>
  const reports = (reportRaw ?? []) as ProgressReportLike[]
  const reviewDoneCaseIds = new Set(((reviewDoneRaw ?? []) as Array<{ case_id: string }>).map(r => r.case_id))

  const alerts: AlertItem[] = []
  const push = (a: AlertItem) => alerts.push(a)
  const caseLabelOf = (caseId: string) => { const c = caseById.get(caseId); return c ? `${c.case_number} ${c.deal_name}` : null }

  // ===== 案件アラート（自分が担当の案件） =====
  for (const c of cases) {
    if (!myCaseSet.has(c.id)) continue
    const roles = roleByCase.get(c.id) ?? new Set<string>()
    const isMySales = roles.has('sales')
    const isMyManager = roles.has('manager') || roles.has('sub_manager')
    const name = `${c.case_number} ${c.deal_name}`

    // 判定は alertRules.ts に集約。材料は caseAlertContext.ts（タスク期限超過・入金期日超過・御礼連絡・相続税申告 まで全部そろう）
    const hits = evaluateCaseAlerts(c, { ...(alertCtx.get(c.id) ?? {}), responseCheckDone: reviewDoneCaseIds.has(c.id) }, todayStr)
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

  // ===== 報連相（要対応）：自分が担当でない同じチームの案件ぶん（文言・しきい値は案件担当向けと同じ） =====
  {
    const byCase = new Map<string, { sev: 'high' | 'mid'; n: number }>()
    for (const r of ((hourensouRaw ?? []) as Array<{ case_id: string; kind: string; status: string; requested_date: string | null }>)) {
      if (myCaseSet.has(r.case_id)) continue
      const sv = caseReportSeverity(r, todayStr)
      if (!sv) continue
      const s = sv === 'chui' ? 'high' : 'mid'
      const cur = byCase.get(r.case_id)
      if (!cur) byCase.set(r.case_id, { sev: s, n: 1 })
      else { cur.n += 1; if (s === 'high') cur.sev = 'high' }
    }
    for (const [caseId, v] of byCase) {
      const c = caseById.get(caseId)
      push({ id: `report_action_overdue-${caseId}`, severity: v.sev, category: '報連相 未回答（チームの案件）', title: c ? `${c.case_number} ${c.deal_name}` : '報連相',
        body: hourensouOverdueReason(v.sev, v.n), href: `/cases/${caseId}?tab=progress` })
    }
  }

  // ===== タスク（自分担当の未完了） =====
  for (const t of tasks) {
    // 前受金の入金御礼連絡だけ早く鳴らす（1営業日=要確認／2営業日=要注意）。
    if (t.title === PREPAY_THANKS_TITLE) {
      const psev = t.status !== 'キャンセル' ? prepayThanksSeverity(t.due_date, todayStr) : null
      if (psev) {
        // 飛び先は依頼者連絡タブ（御礼の連絡はそこで記録する）
        push({ id: `prepay-${t.id}`, severity: psev, category: '前受金入金御礼 未連絡', title: t.title, caseLabel: caseLabelOf(t.case_id),
          body: `入金を確認した ${t.due_date} から日がたっています。お客様へ御礼のご連絡をお願いします`, href: `/cases/${t.case_id}?tab=clientInfo` })
      }
      continue
    }
    // しきい値はバナー・案件色と共通（5営業日=黄／14日=赤）。1〜4営業日の軽微は出さない。
    const tsev = t.status !== 'キャンセル' ? overdueSeverity(t.due_date, todayStr) : null
    if (tsev) {
      push({ id: `task-${t.id}`, severity: tsev === 'chui' ? 'high' : 'mid', category: 'タスク期限超過', title: t.title, caseLabel: caseLabelOf(t.case_id), body: `期限 ${t.due_date} を超過`, href: `/tasks/${t.id}` })
    }
    // 超急ぎの未着手タスク（前受金入金御礼連絡 等）→ 至急タスクとして目立たせる
    if (t.priority === '超急ぎ' && t.status === '未着手') {
      push({ id: `urgent-${t.id}`, severity: 'high', category: '至急タスク', title: t.title, caseLabel: caseLabelOf(t.case_id), body: '超急ぎのタスクです。至急対応してください', href: `/tasks/${t.id}` })
    }
    // 自分宛てタスクあり：受注/管理担当タスク(system)で未着手のもの（事務管理タスクは対象外）
    else if (t.task_kind === 'system' && t.status === '未着手') {
      push({ id: `newtask-${t.id}`, severity: 'info', category: '自分宛てタスク', title: t.title, caseLabel: caseLabelOf(t.case_id), body: '自分宛てのタスクがあります', href: `/tasks/${t.id}` })
    }
  }

  // ===== 到着物あり（受注/管理宛の郵送物一式・未開封・到着連絡済み）→ 到着受信簿の該当レコードへ直行 =====
  const parcels = (parcelRaw ?? []) as unknown as Array<{ id: string; case_id: string; cases: { case_number: string; deal_name: string } | null }>
  for (const p of parcels) {
    const roles = roleByCase.get(p.case_id) ?? new Set<string>()
    if (!roles.has('sales') && !roles.has('manager') && !roles.has('sub_manager')) continue
    const nm = p.cases ? `${p.cases.case_number} ${p.cases.deal_name}` : '到着物'
    push({ id: `parcel-${p.id}`, severity: 'mid', category: '到着物あり', title: nm, body: '受注/管理宛の郵送物が届いています。開封して到着受信簿で中身を再登録・紐付けしてください', href: `/documents?receipt=${p.id}` })
  }

  // ===== 案件報告（管理担当 → 受注担当の確認待ち） =====
  //   届いた直後（青）… その案件の受注担当だけ
  //   1営業日（黄）／3営業日（赤）／要至急対応（赤）… 自分の案件＋同じチームの案件（手が空いた人が代わりに確認できる）
  //   同じ案件に複数あれば一番重い1件。起点は依頼日
  {
    const best = new Map<string, { r: ProgressReportLike; l: NonNullable<ReturnType<typeof progressReportLevel>> }>()
    const rank = (l: NonNullable<ReturnType<typeof progressReportLevel>>) => (l.urgent ? 3 : l.level === 'high' ? 2 : l.level === 'mid' ? 1 : 0)
    for (const r of reports) {
      const l = progressReportLevel(r, todayStr)
      if (!l) continue
      const isMySales = (roleByCase.get(r.case_id) ?? new Set<string>()).has('sales')
      if (l.level === 'info' && !isMySales) continue
      const cur = best.get(r.case_id)
      if (!cur || rank(l) > rank(cur.l) || (rank(l) === rank(cur.l) && (l.days ?? 0) > (cur.l.days ?? 0))) best.set(r.case_id, { r, l })
    }
    for (const { r, l } of best.values()) {
      const c = caseById.get(r.case_id)
      const team = !myCaseSet.has(r.case_id)
      push({
        id: `review-${r.case_id}`, severity: l.level,
        category: `${progressReportCategory(l)}${team ? '（チームの案件）' : ''}`,
        title: c ? `${c.case_number} ${c.deal_name}` : l.label,
        body: progressReportReason(l),
        href: progressReportHref(r),
      })
    }
  }

  // ===== 登記依頼（管理担当 → 相続登記チーム）が止まっている：依頼中のまま1営業日で要確認・3営業日で要注意 =====
  //   依頼者（管理担当）には「返ってこない」、相続登記チームのメンバーには「未対応」として出す。
  //   案件メンバーでない人（登記チーム・事務）にも出るよう、案件の有無で早期 return しない
  {
    const [{ data: meRow }, { data: toukiRaw }] = await Promise.all([
      supabase.from('members').select('is_touki_team').eq('id', memberId).maybeSingle(),
      supabase.from('touki_requests').select('id, case_id, request_type, office, status, requested_at, requester_id, assignee_id, cases(case_number, deal_name)').in('status', ['依頼中', '対応中']),
    ])
    const isToukiTeam = !!(meRow as { is_touki_team?: boolean } | null)?.is_touki_team
    type TR = { id: string; case_id: string; request_type: string; office: string | null; status: '依頼中' | '対応中'; requested_at: string; requester_id: string | null; assignee_id: string | null; cases: { case_number: string; deal_name: string } | null }
    for (const r of ((toukiRaw ?? []) as unknown as TR[])) {
      const sev = toukiSeverity(r, todayStr)
      if (!sev) continue
      const severity = sev === 'chui' ? 'high' : 'mid'
      const days = toukiOverdueDays(r, todayStr)
      const name = r.cases ? `${r.cases.case_number} ${r.cases.deal_name}` : '登記依頼'
      const what = `${r.request_type}（${r.office || '法務局未設定'}）`
      if (r.requester_id === memberId) {
        push({ id: `touki-req-${r.id}`, severity, category: '登記依頼 返答待ち', title: name,
          body: `${what}を出してから${days}営業日たっています（${r.status}）。相続登記チームに声をかけてください`,
          href: `/cases/${r.case_id}?tab=registration${r.office ? `&focus=${encodeURIComponent(r.office)}` : ''}` })
      }
      if (isToukiTeam && (r.status === '依頼中' || r.assignee_id === memberId)) {
        push({ id: `touki-team-${r.id}`, severity, category: r.status === '依頼中' ? '登記依頼 未対応' : '登記依頼 対応中のまま', title: name,
          body: `${what}が届いてから${days}営業日たっています。ダッシュボードの「依頼」タブで対応してください`,
          href: '/dashboard/touki-team' })
      }
    }
  }

  alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
  return NextResponse.json({ alerts })
}

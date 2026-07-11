import { createClient } from '@/lib/supabase/server'
import { Briefcase } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import CaseViewsClient from '@/components/features/cases/CaseViewsClient'
import type { MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import type { ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import type { ReferralRow } from '@/components/features/my/ReferralCasesTable'
import type { LpCaseRow } from '@/components/features/cases/LpCasesTable'
import { CONSULT_STATUSES, REFERRAL_STATUSES } from '@/lib/constants'
import { advanceTotal } from '@/lib/advancePayment'

// 案件分類（constants の定義に一元化）
// 管理案件一覧 = 対応中（稼働中）のみ。完了はこの一覧には出さない（バッジ数＝表示と一致させる）。
// 相談案件 = 面談設定済〜受託・不受託 / 個別管理案件 = 紹介のみ
const MANAGEMENT_ACTIVE = new Set<string>(['対応中'])
const CONSULT = new Set<string>(CONSULT_STATUSES)
const REFERRAL = new Set<string>(REFERRAL_STATUSES)
// LP案件 = 受注ルートが「LP経由」
const LP_ROUTES = new Set(['LP経由'])

type CaseRowRaw = {
  id: string
  case_number: string
  lp_case_number: string | null
  deal_name: string
  status: string
  client_id: string | null
  has_complaint: boolean | null
  last_opened_at: string | null
  created_at: string | null
  updated_at: string | null
  order_route: string | null
  order_route_detail: string | null
  order_route_lp_name: string | null
  referral_name: string | null
  contract_type: string | null
  consideration_decline_reason: string | null
  consideration_decline_reason_detail: string | null
  procedure_type: string[] | null
  expected_completion_date: string | null
  order_sheet_completed_at: string | null
  fee_administrative: number | null
  fee_judicial: number | null
  fee_total: number | null
  advance_payment: number | null
  advance_payment_administrative: number | null
  advance_payment_judicial: number | null
  tax_advisor_name: string | null
  real_estate_appraisal_status: string | null
  meeting_executed_date: string | null
  client_response_due_date: string | null
  consideration_period: string | null
  meeting_other_notes: string | null
  clients: { id: string; name: string } | null
  case_members: Array<{ role: string; members: { id: string; name: string; team_id: string | null } | null }>
  // 他事業者紹介の依頼内容（partner_type='税理士'/'不動産' の content）
  case_referrals?: Array<{ partner_type: string; content: string | null }>
}

// 確定売上金額: 契約形態に応じて 行政単独=行政報酬 / 司法単独=司法報酬 / 連名=合計
function confirmedRevenue(c: CaseRowRaw): number | null {
  switch (c.contract_type) {
    case '行政書士法人単独': return c.fee_administrative
    case '司法書士法人単独': return c.fee_judicial
    case '行・司連名':
      return c.fee_total ?? (((c.fee_administrative ?? 0) + (c.fee_judicial ?? 0)) || null)
    default:
      return c.fee_total ?? null
  }
}
type TaskRowLite = { id: string; case_id: string; title: string; status: string; sort_order: number | null }
type ReportLite = { case_id: string; status: string; confirmed_date: string | null; requested_date: string | null }
type CommLite = { case_id: string; communicated_at: string | null; detail: string | null }

export default async function CasesPage() {
  const supabase = await createClient()
  const today = new Date()

  const [{ data: casesRaw }, { data: tasksRaw }, { data: reportsRaw }, { data: commsRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(id,name,furigana,phone,mobile_phone), case_members(role, members(id,name,team_id)), case_referrals(partner_type, content)')
      .order('created_at', { ascending: false }),
    supabase.from('tasks').select('id,case_id,title,status,sort_order'),
    supabase.from('progress_reports').select('case_id,status,confirmed_date,requested_date'),
    supabase.from('client_communications').select('case_id,communicated_at,detail').order('communicated_at', { ascending: false }),
    supabase.from('teams').select('id,name'),
  ])

  const cases = (casesRaw ?? []) as CaseRowRaw[]
  const tasks = (tasksRaw ?? []) as TaskRowLite[]
  const reports = (reportsRaw ?? []) as ReportLite[]
  const comms = (commsRaw ?? []) as CommLite[]
  const teamNameById = new Map<string, string>((((teamsRaw ?? []) as Array<{ id: string; name: string }>).map(t => [t.id, t.name])))

  // 担当者名 + 受注担当のチーム名
  const salesByCase = new Map<string, string>()
  const salesTeamByCase = new Map<string, string>()
  const managerByCase = new Map<string, string>()
  for (const c of cases) {
    for (const cm of c.case_members ?? []) {
      if (!cm.members) continue
      if (cm.role === 'sales' && !salesByCase.has(c.id)) {
        salesByCase.set(c.id, cm.members.name)
        const teamName = cm.members.team_id ? teamNameById.get(cm.members.team_id) : undefined
        if (teamName) salesTeamByCase.set(c.id, teamName)
      }
      if (cm.role === 'manager' && !managerByCase.has(c.id)) managerByCase.set(c.id, cm.members.name)
    }
  }

  // 進捗（次の未完了タスク + 完了/総数）
  const tasksByCase = new Map<string, TaskRowLite[]>()
  for (const t of tasks) {
    if (!tasksByCase.has(t.case_id)) tasksByCase.set(t.case_id, [])
    tasksByCase.get(t.case_id)!.push(t)
  }
  const isOpen = (s: string) => s !== '完了' && s !== 'キャンセル'
  const progressByCase = new Map<string, { nextTaskId: string | null; nextTaskTitle: string | null; done: number; total: number }>()
  for (const [cid, ts] of tasksByCase) {
    const sorted = [...ts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const next = sorted.find(t => isOpen(t.status)) ?? null
    progressByCase.set(cid, { nextTaskId: next?.id ?? null, nextTaskTitle: next?.title ?? null, done: ts.filter(t => t.status === '完了').length, total: ts.length })
  }

  // 週次報告状況（最新。確認済でも7日経過なら未対応）
  const latestReportByCase = new Map<string, ReportLite>()
  for (const pr of reports) {
    const cur = latestReportByCase.get(pr.case_id)
    if (!cur) { latestReportByCase.set(pr.case_id, pr); continue }
    if (pr.status === '依頼中' && cur.status !== '依頼中') { latestReportByCase.set(pr.case_id, pr); continue }
    if ((pr.requested_date ?? '') > (cur.requested_date ?? '')) latestReportByCase.set(pr.case_id, pr)
  }
  const weeklyStatusOf = (cid: string): '未対応' | '依頼中' | '確認済' => {
    const pr = latestReportByCase.get(cid)
    if (!pr) return '未対応'
    if (pr.status === '依頼中') return '依頼中'
    if (pr.confirmed_date) {
      const d = Math.floor((today.getTime() - new Date(pr.confirmed_date).getTime()) / 86_400_000)
      return d <= 7 ? '確認済' : '未対応'
    }
    return '未対応'
  }

  // 直近やり取り
  const lastCommByCase = new Map<string, { date: string | null; detail: string | null }>()
  for (const c of comms) {
    if (!lastCommByCase.has(c.case_id)) lastCommByCase.set(c.case_id, { date: c.communicated_at, detail: c.detail })
  }

  // 管理案件の行マッピング（対応中・完了で共通利用）
  const toMyCaseRow = (c: CaseRowRaw): MyCaseRow => {
    const prog = progressByCase.get(c.id)
    const lc = lastCommByCase.get(c.id)
    return {
      id: c.id,
      case_number: c.case_number,
      deal_name: c.deal_name,
      status: c.status,
      deceased_name: null,
      expected_completion_date: c.expected_completion_date,
      completion_date: null,
      has_complaint: c.has_complaint,
      last_opened_at: c.last_opened_at,
      created_at: c.created_at,
      updated_at: c.updated_at,
      sales_name: salesByCase.get(c.id) ?? null,
      manager_name: managerByCase.get(c.id) ?? null,
      team_name: salesTeamByCase.get(c.id) ?? null,
      procedure_type: c.procedure_type,
      order_sheet_completed_at: c.order_sheet_completed_at,
      nextTaskId: prog?.nextTaskId ?? null,
      nextTaskTitle: prog?.nextTaskTitle ?? null,
      progressDone: prog?.done ?? 0,
      progressTotal: prog?.total ?? 0,
      weeklyStatus: weeklyStatusOf(c.id),
      lastCommDate: lc?.date ?? null,
      lastCommDetail: lc?.detail ?? null,
    }
  }

  // 管理案件一覧（対応中 = 稼働中）／完了案件（別サブビューで閲覧・削除）
  const managerRows: MyCaseRow[] = cases.filter(c => MANAGEMENT_ACTIVE.has(c.status)).map(toMyCaseRow)
  const completedRows: MyCaseRow[] = cases.filter(c => c.status === '完了').map(toMyCaseRow)

  // 相談案件一覧
  const consultRows: ConsultCase[] = cases.filter(c => CONSULT.has(c.status)).map(c => ({
    id: c.id,
    case_number: c.case_number,
    deal_name: c.deal_name,
    status: c.status,
    created_at: c.created_at,
    updated_at: c.updated_at,
    meeting_executed_date: c.meeting_executed_date,
    client_response_due_date: c.client_response_due_date,
    consideration_period: c.consideration_period,
    order_route_detail: c.order_route_detail,
    team_name: salesTeamByCase.get(c.id) ?? null,
    sales_name: salesByCase.get(c.id) ?? null,
    manager_name: managerByCase.get(c.id) ?? null,
    procedure_type: c.procedure_type,
    order_amount: c.fee_administrative && c.fee_administrative > 0 ? c.fee_administrative : (c.fee_judicial ?? null),
    order_sheet_completed_at: c.order_sheet_completed_at,
  }))

  // LP案件一覧（受注ルート = LP経由）
  const lpRows: LpCaseRow[] = cases.filter(c => LP_ROUTES.has(c.order_route ?? '')).map(c => {
    const refMap = new Map<string, string | null>((c.case_referrals ?? []).map(r => [r.partner_type, r.content]))
    return {
      id: c.id,
      case_number: c.case_number,
      lp_case_number: c.lp_case_number,
      deal_name: c.deal_name,
      status: c.status,
      contract_type: c.contract_type,
      referral_source: c.order_route_detail || c.order_route_lp_name || c.referral_name || null,
      client_name: c.clients?.name ?? null,
      consideration_decline_reason: c.consideration_decline_reason,
      consideration_decline_reason_detail: c.consideration_decline_reason_detail,
      client_response_due_date: c.client_response_due_date,
      consideration_period: c.consideration_period,
      sales_name: salesByCase.get(c.id) ?? null,
      team_name: salesTeamByCase.get(c.id) ?? null,
      manager_name: managerByCase.get(c.id) ?? null,
      advance_payment: advanceTotal(c),
      confirmed_revenue: confirmedRevenue(c),
      expected_completion_date: c.expected_completion_date,
      updated_at: c.updated_at,
      tax_advisor_business: refMap.get('税理士') ?? null,
      real_estate_registration: refMap.get('不動産') ?? null,
      meeting_other_notes: c.meeting_other_notes,
    }
  })

  // 個別管理案件（紹介のみ）
  const referralRows: ReferralRow[] = cases.filter(c => REFERRAL.has(c.status)).map(c => ({
    id: c.id,
    case_number: c.case_number,
    deal_name: c.deal_name,
    status: c.status,
    updated_at: c.updated_at,
    order_route_detail: c.order_route_detail,
    procedure_type: c.procedure_type,
    client_name: c.clients?.name ?? null,
    manager_name: managerByCase.get(c.id) ?? null,
    sales_name: salesByCase.get(c.id) ?? null,
    team_name: salesTeamByCase.get(c.id) ?? null,
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Cases"
        title="案件一覧"
        icon={Briefcase}
        description="上のタブ（相談案件 / 管理案件 / 個別管理 / LP案件）で切り替え"
      />
      <CaseViewsClient managerRows={managerRows} completedRows={completedRows} consultRows={consultRows} referralRows={referralRows} lpRows={lpRows} />
    </div>
  )
}

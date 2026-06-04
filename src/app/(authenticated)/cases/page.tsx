import { createClient } from '@/lib/supabase/server'
import { Briefcase } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import CaseViewsClient from '@/components/features/cases/CaseViewsClient'
import type { MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import type { ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import type { ReferralRow } from '@/components/features/my/ReferralCasesTable'

const MANAGEMENT_ACTIVE = new Set(['対応中'])
const CONSULT = new Set(['面談設定済', '検討中', '検討中（契約書待ち）', '受注', '失注', '保留・長期'])

type CaseRowRaw = {
  id: string
  case_number: string
  deal_name: string
  status: string
  client_id: string | null
  has_complaint: boolean | null
  last_opened_at: string | null
  created_at: string | null
  order_route_detail: string | null
  procedure_type: string[] | null
  fee_administrative: number | null
  fee_judicial: number | null
  meeting_executed_date: string | null
  client_response_due_date: string | null
  clients: { id: string; name: string } | null
  case_members: Array<{ role: string; members: { id: string; name: string } | null }>
}
type TaskRowLite = { id: string; case_id: string; title: string; status: string; sort_order: number | null }
type ReportLite = { case_id: string; status: string; confirmed_date: string | null; requested_date: string | null }
type CommLite = { case_id: string; communicated_at: string | null; detail: string | null }

export default async function CasesPage() {
  const supabase = await createClient()
  const today = new Date()

  const [{ data: casesRaw }, { data: tasksRaw }, { data: reportsRaw }, { data: commsRaw }] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(id,name), case_members(role, members(id,name))')
      .order('created_at', { ascending: false }),
    supabase.from('tasks').select('id,case_id,title,status,sort_order'),
    supabase.from('progress_reports').select('case_id,status,confirmed_date,requested_date'),
    supabase.from('client_communications').select('case_id,communicated_at,detail').order('communicated_at', { ascending: false }),
  ])

  const cases = (casesRaw ?? []) as CaseRowRaw[]
  const tasks = (tasksRaw ?? []) as TaskRowLite[]
  const reports = (reportsRaw ?? []) as ReportLite[]
  const comms = (commsRaw ?? []) as CommLite[]

  // 担当者名
  const salesByCase = new Map<string, string>()
  const managerByCase = new Map<string, string>()
  for (const c of cases) {
    for (const cm of c.case_members ?? []) {
      if (!cm.members) continue
      if (cm.role === 'sales' && !salesByCase.has(c.id)) salesByCase.set(c.id, cm.members.name)
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

  // 管理案件一覧
  const managerRows: MyCaseRow[] = cases.filter(c => MANAGEMENT_ACTIVE.has(c.status)).map(c => {
    const prog = progressByCase.get(c.id)
    const lc = lastCommByCase.get(c.id)
    return {
      id: c.id,
      case_number: c.case_number,
      deal_name: c.deal_name,
      status: c.status,
      deceased_name: null,
      expected_completion_date: null,
      completion_date: null,
      has_complaint: c.has_complaint,
      last_opened_at: c.last_opened_at,
      created_at: c.created_at,
      sales_name: salesByCase.get(c.id) ?? null,
      manager_name: managerByCase.get(c.id) ?? null,
      nextTaskId: prog?.nextTaskId ?? null,
      nextTaskTitle: prog?.nextTaskTitle ?? null,
      progressDone: prog?.done ?? 0,
      progressTotal: prog?.total ?? 0,
      weeklyStatus: weeklyStatusOf(c.id),
      lastCommDate: lc?.date ?? null,
      lastCommDetail: lc?.detail ?? null,
    }
  })

  // 相談案件一覧
  const consultRows: ConsultCase[] = cases.filter(c => CONSULT.has(c.status)).map(c => ({
    id: c.id,
    case_number: c.case_number,
    deal_name: c.deal_name,
    status: c.status,
    meeting_executed_date: c.meeting_executed_date,
    client_response_due_date: c.client_response_due_date,
    order_route_detail: c.order_route_detail,
    manager_name: managerByCase.get(c.id) ?? null,
    procedure_type: c.procedure_type,
    order_amount: c.fee_administrative && c.fee_administrative > 0 ? c.fee_administrative : (c.fee_judicial ?? null),
  }))

  // 個別管理案件（紹介のみ）
  const referralRows: ReferralRow[] = cases.filter(c => c.status === '紹介のみ').map(c => ({
    id: c.id,
    case_number: c.case_number,
    deal_name: c.deal_name,
    status: c.status,
    order_route_detail: c.order_route_detail,
    procedure_type: c.procedure_type,
    client_name: c.clients?.name ?? null,
    manager_name: managerByCase.get(c.id) ?? null,
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Cases"
        title="案件管理"
        icon={Briefcase}
        description="管理案件一覧・相談案件一覧・個別管理案件を切り替えて表示"
      />
      <CaseViewsClient managerRows={managerRows} consultRows={consultRows} referralRows={referralRows} />
    </div>
  )
}

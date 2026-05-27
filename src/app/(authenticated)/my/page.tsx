import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCircle, Target, ClipboardList, ListChecks, Calendar } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import MyPageTargetInput from '@/components/features/my/MyPageTargetInput'
import MyPageCasesTab from '@/components/features/my/MyPageCasesTab'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
import MonthlyMeetingsTable from '@/components/features/dashboard/MonthlyMeetingsTable'
import type { TaskRow } from '@/types'

/**
 * マイページ — 認証ユーザー本人のみ閲覧可能。
 *
 * 役割 (primary_role) に応じて表示が切り替わる:
 *   - 受注担当 (sales)   : 月間「新規受注件数」目標 + 担当案件一覧 + 自分宛システムタスク
 *   - 管理担当 (manager) : 月間「請求完了件数」目標 + 担当案件一覧 + 自分宛システムタスク
 *   - その他            : 担当案件 + システムタスクのみ（目標非表示）
 */

type SearchParams = Promise<{ tab?: string }>
type TabKey = 'overview' | 'cases' | 'tasks' | 'meetings'

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const { tab } = await searchParams
  const validTabs: TabKey[] = ['overview', 'cases', 'tasks', 'meetings']
  const activeTab: TabKey = (validTabs as string[]).includes(tab ?? '') ? (tab as TabKey) : 'overview'

  const user = await getCurrentUser()
  if (!user?.memberId) {
    redirect('/login')
  }

  const memberId = user.memberId
  const role = user.primaryRole
  const isSales = role === 'sales'
  const isManager = role === 'manager' || role === 'sub_manager'

  const supabase = await createClient()
  const today = new Date()
  const ym = today.toISOString().slice(0, 7)

  // 必須クエリ
  const [{ data: myCaseRows }, { data: targetRow }, { data: allCaseMembersRaw }, { data: allMembersRaw }, { data: clientsRaw }] = await Promise.all([
    // cases の追加カラム (migration 049 未適用環境でも動くように * を使用)
    supabase
      .from('case_members')
      .select('case_id, role, cases(*)')
      .eq('member_id', memberId),
    supabase
      .from('member_targets')
      .select('new_orders_count, invoice_count')
      .eq('member_id', memberId)
      .eq('ym', ym)
      .maybeSingle(),
    supabase.from('case_members').select('case_id, member_id, role'),
    supabase.from('members').select('id, name').eq('is_active', true),
    supabase.from('clients').select('id, name'),
  ])

  // システムタスク (migration 046 未適用環境では空扱い)
  let systemTaskRows: unknown[] | null = null
  try {
    const { data } = await supabase
      .from('tasks')
      .select('*, cases(id, case_number, deal_name, status)')
      .eq('task_kind', 'system')
      .neq('status', '完了')
      .order('due_date', { ascending: true, nullsFirst: false })
    systemTaskRows = data
  } catch { /* ignore */ }

  // 自分担当の case_id セット
  const myCaseIds = new Set<string>(((myCaseRows ?? []) as Array<{ case_id: string }>).map(r => r.case_id))
  type MyCase = {
    id: string
    case_number: string
    deal_name: string
    status: string
    deceased_name: string | null
    expected_completion_date: string | null
    completion_date: string | null
    meeting_date: string | null
    meeting_executed_date: string | null
    client_response_due_date: string | null
    meeting_place: string | null
    lost_reason: string | null
    has_complaint: boolean | null
    client_id: string | null
  }
  const myCases = ((myCaseRows ?? []) as Array<{ cases: unknown }>)
    .map(r => r.cases)
    .filter((c): c is MyCase => !!c)

  // 受注担当・管理担当・依頼者名を解決
  const memberById = new Map<string, string>(
    ((allMembersRaw ?? []) as Array<{ id: string; name: string }>).map(m => [m.id, m.name]),
  )
  const clientById = new Map<string, string>(
    ((clientsRaw ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]),
  )
  const allCaseMembers = (allCaseMembersRaw ?? []) as Array<{ case_id: string; member_id: string; role: string }>
  const salesByCase = new Map<string, string>()
  const managerByCase = new Map<string, string>()
  for (const cm of allCaseMembers) {
    if (!myCaseIds.has(cm.case_id)) continue
    const name = memberById.get(cm.member_id)
    if (!name) continue
    if (cm.role === 'sales' && !salesByCase.has(cm.case_id)) salesByCase.set(cm.case_id, name)
    if (cm.role === 'manager' && !managerByCase.has(cm.case_id)) managerByCase.set(cm.case_id, name)
  }

  // MyPageCasesTab 用の行
  const myCasesEnriched = myCases.map(c => ({
    id: c.id,
    case_number: c.case_number,
    deal_name: c.deal_name,
    status: c.status,
    deceased_name: c.deceased_name,
    expected_completion_date: c.expected_completion_date,
    completion_date: c.completion_date,
    has_complaint: c.has_complaint,
    client_name: c.client_id ? clientById.get(c.client_id) ?? null : null,
    sales_name: salesByCase.get(c.id) ?? null,
    manager_name: managerByCase.get(c.id) ?? null,
  }))

  // 当月面談の絞り込み: meeting_date or meeting_executed_date が当月
  const myMonthlyMeetingCases = myCases.filter(c =>
    (c.meeting_date?.startsWith(ym)) || (c.meeting_executed_date?.startsWith(ym))
  )

  // 自分担当案件に紐づくシステムタスクを抽出
  const mySystemTasks = ((systemTaskRows ?? []) as TaskRow[]).filter(t => myCaseIds.has(t.case_id))

  const targetValue = isSales
    ? (targetRow?.new_orders_count ?? 0)
    : isManager
      ? (targetRow?.invoice_count ?? 0)
      : 0

  return (
    <div>
      <PageHeader
        eyebrow="My"
        title={`${user.memberName ?? 'マイページ'}`}
        icon={UserCircle}
        description={isSales ? '受注担当のマイページ — あなたのみ閲覧できます' : isManager ? '管理担当のマイページ — あなたのみ閲覧できます' : 'マイページ — あなたのみ閲覧できます'}
      />

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
        <TabLink href="/my" label="概要" Icon={UserCircle} active={activeTab === 'overview'} />
        <TabLink href="/my?tab=cases" label={`担当案件 (${myCases.length})`} Icon={ClipboardList} active={activeTab === 'cases'} />
        {isSales && (
          <TabLink href="/my?tab=meetings" label={`当月面談 (${myMonthlyMeetingCases.length})`} Icon={Calendar} active={activeTab === 'meetings'} />
        )}
        <TabLink href="/my?tab=tasks" label={`タスク (${mySystemTasks.length})`} Icon={ListChecks} active={activeTab === 'tasks'} />
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 月間目標入力（受注/管理担当のみ） */}
          {(isSales || isManager) && (
            <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
                <h3 className="text-[14px] font-bold text-gray-900">
                  {isSales ? '今月の新規受注件数 目標' : '今月の請求完了件数 目標'}
                </h3>
                <span className="text-[11px] text-gray-400 font-mono">{ym}</span>
              </div>
              <MyPageTargetInput
                memberId={memberId}
                ym={ym}
                field={isSales ? 'new_orders_count' : 'invoice_count'}
                initialValue={targetValue}
                label={isSales ? '新規受注件数 (件)' : '請求完了件数 (件)'}
              />
              <p className="text-[11px] text-gray-400 mt-2">
                {isSales
                  ? '達成するとアバターにレインボーリングが表示されます'
                  : '管理担当のKPIは「請求完了件数」と「担当案件数」'}
              </p>
            </section>
          )}

          {/* システムタスクのプレビュー */}
          <section className="lg:col-span-2">
            <SystemTaskList
              tasks={mySystemTasks}
              title="あなたのタスク"
              emptyText="未完了のタスクはありません"
              showCase={true}
              includeCompleted={false}
              limit={5}
              seeAllHref="/my?tab=tasks"
            />
          </section>

          {/* 担当案件のプレビュー */}
          <section className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
              <h3 className="text-[14px] font-bold text-gray-900">あなたの担当案件 (上位5件)</h3>
              <Link href="/my?tab=cases" className="ml-auto text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                すべて見る →
              </Link>
            </div>
            <MyPageCasesTab memberId={memberId} cases={myCasesEnriched.slice(0, 5)} compact />
          </section>
        </div>
      )}

      {activeTab === 'cases' && (
        <MyPageCasesTab memberId={memberId} cases={myCasesEnriched} />
      )}

      {activeTab === 'tasks' && (
        <SystemTaskList
          tasks={mySystemTasks}
          title="あなたのタスク"
          emptyText="未完了のタスクはありません"
          showCase={true}
          includeCompleted={false}
        />
      )}

      {activeTab === 'meetings' && (
        <div className="space-y-4">
          {/* サマリ: 面談数 / 新規受注件数 / 受注率 */}
          {(() => {
            const totalMeetings = myMonthlyMeetingCases.length
            const wonCount = myMonthlyMeetingCases.filter(c => c.status === '受注').length
            const winRate = totalMeetings > 0 ? Math.round((wonCount / totalMeetings) * 1000) / 10 : null
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MeetingKpi label="面談数" value={totalMeetings} suffix="件/月" />
                <MeetingKpi label="新規受注件数" value={wonCount} suffix="件/月" />
                <MeetingKpi label="受注率" value={winRate} suffix="%" />
              </div>
            )
          })()}
          <MonthlyMeetingsTable
            cases={myMonthlyMeetingCases}
            title={`📅 ${ym} の面談一覧`}
            showStatusFilter
          />
        </div>
      )}
    </div>
  )
}

function MeetingKpi({ label, value, suffix }: { label: string; value: number | null; suffix: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="text-[12px] font-semibold text-gray-500 mb-1.5">{label}</div>
      <div className="text-[24px] font-extrabold tracking-tight text-brand-700 leading-none">
        {value === null ? '—' : value}
        <span className="text-[12px] text-gray-400 ml-1 font-normal">{suffix}</span>
      </div>
    </div>
  )
}

function TabLink({ href, label, Icon, active }: { href: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </Link>
  )
}

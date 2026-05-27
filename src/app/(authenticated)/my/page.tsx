import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCircle, Target, ClipboardList, ListChecks } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import MyPageTargetInput from '@/components/features/my/MyPageTargetInput'
import MyPageCasesTab from '@/components/features/my/MyPageCasesTab'
import SystemTaskList from '@/components/features/tasks/SystemTaskList'
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

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const { tab } = await searchParams
  const activeTab: 'overview' | 'cases' | 'tasks' = tab === 'cases' || tab === 'tasks' ? tab : 'overview'

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

  // 自分担当の案件と、自分宛のシステムタスクを並行取得
  const [{ data: myCaseRows }, { data: targetRow }, { data: systemTaskRows }] = await Promise.all([
    supabase
      .from('case_members')
      .select('case_id, role, cases(id, case_number, deal_name, status, deceased_name, expected_completion_date, completion_date)')
      .eq('member_id', memberId),
    supabase
      .from('member_targets')
      .select('new_orders_count, invoice_count')
      .eq('member_id', memberId)
      .eq('ym', ym)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('*, cases(id, case_number, deal_name, status)')
      .eq('task_kind', 'system')
      .neq('status', '完了')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])

  // 自分担当の case_id セット
  const myCaseIds = new Set<string>(((myCaseRows ?? []) as Array<{ case_id: string }>).map(r => r.case_id))
  const myCases = ((myCaseRows ?? []) as Array<{ cases: unknown }>)
    .map(r => r.cases)
    .filter((c): c is { id: string; case_number: string; deal_name: string; status: string; deceased_name: string | null; expected_completion_date: string | null; completion_date: string | null } => !!c)

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
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <TabLink href="/my" label="概要" Icon={UserCircle} active={activeTab === 'overview'} />
        <TabLink href="/my?tab=cases" label={`担当案件 (${myCases.length})`} Icon={ClipboardList} active={activeTab === 'cases'} />
        <TabLink href="/my?tab=tasks" label={`システムタスク (${mySystemTasks.length})`} Icon={ListChecks} active={activeTab === 'tasks'} />
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
              title="🤖 あなたのシステムタスク"
              emptyText="未完了のシステムタスクはありません"
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
            <MyPageCasesTab memberId={memberId} cases={myCases.slice(0, 5)} compact />
          </section>
        </div>
      )}

      {activeTab === 'cases' && (
        <MyPageCasesTab memberId={memberId} cases={myCases} />
      )}

      {activeTab === 'tasks' && (
        <SystemTaskList
          tasks={mySystemTasks}
          title="🤖 あなたのシステムタスク"
          emptyText="未完了のシステムタスクはありません"
          showCase={true}
          includeCompleted={false}
        />
      )}
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

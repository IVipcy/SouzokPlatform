import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CaseDetailClient from '@/components/features/cases/CaseDetailClient'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, DivisionDetailRow, ExpenseRow } from '@/types'

type Props = {
  params: Promise<{ id: string }>
}

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [caseResult, membersResult, tasksResult, allMembersResult, templatesResult, heirsResult, propertiesResult, financialAssetsResult, divisionDetailsResult, expensesResult] = await Promise.all([
    supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', id)
      .single(),
    supabase
      .from('case_members')
      .select('*, members(*)')
      .eq('case_id', id),
    supabase
      .from('tasks')
      .select('*, task_assignees(*, members(*))')
      .eq('case_id', id)
      .order('sort_order'),
    supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('task_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('heirs')
      .select('*')
      .eq('case_id', id)
      .order('sort_order'),
    supabase
      .from('real_estate_properties')
      .select('*')
      .eq('case_id', id),
    supabase
      .from('financial_assets')
      .select('*')
      .eq('case_id', id),
    supabase
      .from('division_details')
      .select('*')
      .eq('case_id', id),
    supabase
      .from('expenses')
      .select('*')
      .eq('case_id', id)
      .order('expense_date'),
  ])

  if (caseResult.error || !caseResult.data) {
    notFound()
  }

  return (
    <CaseDetailClient
      caseData={caseResult.data as CaseRow}
      caseMembers={(membersResult.data ?? []) as CaseMemberRow[]}
      tasks={(tasksResult.data ?? []) as TaskRow[]}
      allMembers={(allMembersResult.data ?? []) as MemberRow[]}
      taskTemplates={(templatesResult.data ?? []) as TaskTemplateRow[]}
      heirs={(heirsResult.data ?? []) as HeirRow[]}
      properties={(propertiesResult.data ?? []) as RealEstatePropertyRow[]}
      financialAssets={(financialAssetsResult.data ?? []) as FinancialAssetRow[]}
      divisionDetails={(divisionDetailsResult.data ?? []) as DivisionDetailRow[]}
      expenses={(expensesResult.data ?? []) as ExpenseRow[]}
    />
  )
}

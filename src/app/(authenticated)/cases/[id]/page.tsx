import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CaseDetailClient from '@/components/features/cases/CaseDetailClient'
import type { CaseRow, CaseMemberRow, TaskRow, MemberRow, TaskTemplateRow } from '@/types'

type Props = {
  params: Promise<{ id: string }>
}

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [caseResult, membersResult, tasksResult, allMembersResult, templatesResult] = await Promise.all([
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
    />
  )
}

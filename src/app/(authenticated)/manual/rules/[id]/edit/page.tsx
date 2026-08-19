import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import ManualArticleEditor from '@/components/features/manual/ManualArticleEditor'
import type { ManualArticleRow } from '@/lib/manualArticle'

// 編集はシステム管理者だけ。URLを直接叩かれても閲覧画面へ戻す。
export default async function ManualRuleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  const canEdit = user?.primaryRole === 'system_manager' || (user?.roles ?? []).includes('system_manager')
  if (!canEdit) redirect(`/manual/rules/${id}`)

  const supabase = await createClient()
  const { data } = await supabase.from('manual_articles').select('*').eq('id', id).single()
  if (!data) notFound()

  return <ManualArticleEditor article={data as unknown as ManualArticleRow} />
}

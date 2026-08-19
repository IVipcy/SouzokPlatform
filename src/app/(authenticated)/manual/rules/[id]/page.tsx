import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import ManualArticleView from '@/components/features/manual/ManualArticleView'
import type { ManualArticleRow } from '@/lib/manualArticle'

export default async function ManualRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data }, user] = await Promise.all([
    supabase.from('manual_articles').select('*').eq('id', id).single(),
    getCurrentUser(),
  ])
  if (!data) notFound()
  const canEdit = user?.primaryRole === 'system_manager' || (user?.roles ?? []).includes('system_manager')

  return <ManualArticleView article={data as unknown as ManualArticleRow} canEdit={canEdit} />
}

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManualStepEditor from '@/components/features/manual/ManualStepEditor'
import type { ManualStepRow } from '@/lib/manualStep'

export default async function ManualStepEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data }, { data: chaptersRaw }, { data: articlesRaw }] = await Promise.all([
    supabase.from('manual_steps').select('*').eq('id', id).single(),
    supabase.from('manual_chapters').select('name').order('sort_order').order('created_at'),
    // 関連ページの候補（業務運用ルール）。URLを手打ちさせないため一覧から選ばせる。
    supabase.from('manual_articles').select('id,title,chapter').order('chapter').order('sort_order'),
  ])
  if (!data) notFound()
  const chapters = ((chaptersRaw ?? []) as Array<{ name: string }>).map(c => c.name)
  const articles = (articlesRaw ?? []) as Array<{ id: string; title: string; chapter: string }>
  return <ManualStepEditor step={data as unknown as ManualStepRow} chapters={chapters} articles={articles} />
}

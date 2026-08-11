import { Suspense } from 'react'
import { ListOrdered } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import ManualStepsClient from '@/components/features/manual/ManualStepsClient'
import type { ManualChapterRow, ManualStepRow } from '@/lib/manualStep'

// 操作ステップ（画面キャプチャ＋赤枠＋操作方法）。章タブで切り替え、その章は上から通しで読める。
// 読み物（考え方・ルール）は content/manual/*.md のまま。
export default async function ManualStepsPage() {
  const supabase = await createClient()
  const [{ data: chaptersRaw }, { data: stepsRaw }] = await Promise.all([
    supabase.from('manual_chapters').select('id,name,sort_order').order('sort_order').order('created_at'),
    supabase.from('manual_steps').select('*').order('sort_order').order('created_at'),
  ])
  const chapters = (chaptersRaw ?? []) as unknown as ManualChapterRow[]
  const steps = (stepsRaw ?? []) as unknown as ManualStepRow[]

  return (
    <div>
      <PageHeader
        eyebrow="Manual"
        title="マニュアル"
        icon={ListOrdered}
        description="画面キャプチャに赤枠と番号を振り、右に操作方法を書いたページです。章ごとに上から通して読めます。"
      />
      <Suspense fallback={<p className="text-[12px] text-gray-400">読み込み中…</p>}>
        <ManualStepsClient chapters={chapters} steps={steps} />
      </Suspense>
    </div>
  )
}

import Link from 'next/link'
import { ListOrdered, ArrowLeft } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import ManualStepList from '@/components/features/manual/ManualStepList'
import type { ManualStepRow } from '@/lib/manualStep'

// 操作ステップ（画面キャプチャ＋赤枠＋操作方法）の一覧。
// 読み物（考え方・ルール）は content/manual/*.md のまま。ここは手順だけを持つ。
export default async function ManualStepsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('manual_steps').select('*').order('chapter').order('sort_order')
  const steps = (data ?? []) as unknown as ManualStepRow[]

  return (
    <div>
      <PageHeader
        eyebrow="Manual"
        title="操作ステップ"
        icon={ListOrdered}
        description="画面キャプチャに赤枠と番号を振り、右に操作方法を書いたページを作ります。印刷もできます。"
        right={
          <Link href="/manual" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <ArrowLeft className="w-3.5 h-3.5" />マニュアルへ
          </Link>
        }
      />
      <ManualStepList steps={steps} />
    </div>
  )
}

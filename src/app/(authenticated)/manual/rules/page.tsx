import { Scale } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import ManualNav from '@/components/features/manual/ManualNav'
import ManualRulesClient from '@/components/features/manual/ManualRulesClient'
import type { ManualArticleRow } from '@/lib/manualArticle'

// 業務運用ルール（読み物）。アラートの定義・案件の色・請求の型など、
// 画面操作に紐づかない決めごとを章ごとに置く。編集はシステム管理者だけ。
export default async function ManualRulesPage() {
  const supabase = await createClient()
  const [{ data }, user] = await Promise.all([
    supabase.from('manual_articles').select('*').order('sort_order').order('created_at'),
    getCurrentUser(),
  ])
  const articles = (data ?? []) as unknown as ManualArticleRow[]
  const canEdit = user?.primaryRole === 'system_manager' || (user?.roles ?? []).includes('system_manager')

  return (
    <div>
      <PageHeader
        eyebrow="Manual"
        title="業務運用ルール"
        icon={Scale}
        description="アラートの定義、案件の色、請求の型など「なぜそうするか」をまとめた読み物です。操作方法のページから関連ページとして辿れます。"
      />
      <ManualNav active="rules" />
      <ManualRulesClient articles={articles} canEdit={canEdit} />
    </div>
  )
}

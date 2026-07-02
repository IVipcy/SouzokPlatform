import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { getAllArticles, MANUAL_CATEGORY_ORDER } from '@/lib/manual'
import ManualIndex from '@/components/features/manual/ManualIndex'
import { isMinimalMode } from '@/lib/featureMode'

export default function ManualPage() {
  if (isMinimalMode()) redirect('/my')
  const articles = getAllArticles()
  const items = articles.map(a => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    roles: a.roles,
    tags: a.tags,
    search: `${a.title} ${a.tags.join(' ')} ${a.category} ${a.body}`.toLowerCase(),
  }))
  return (
    <div>
      <PageHeader
        eyebrow="Manual"
        title="マニュアル"
        icon={BookOpen}
        description="業務の流れに沿ったシステムの使い方・ナレッジベース。キーワード検索でも探せます。"
      />
      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-[13px] text-gray-400">
          まだ記事がありません。<br />
          <span className="text-[12px]">（content/manual/ に .md を追加すると、この一覧と検索に反映されます）</span>
        </div>
      ) : (
        <ManualIndex items={items} categoryOrder={MANUAL_CATEGORY_ORDER} />
      )}
    </div>
  )
}

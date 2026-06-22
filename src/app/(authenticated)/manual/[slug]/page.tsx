import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getArticle, getAllArticles } from '@/lib/manual'
import MarkdownView from '@/components/features/manual/MarkdownView'

export function generateStaticParams() {
  return getAllArticles().map(a => ({ slug: a.slug }))
}

export default async function ManualArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) notFound()

  return (
    <div className="max-w-3xl">
      <Link href="/manual" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" />マニュアル一覧へ
      </Link>
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[11px] font-semibold text-brand-600">{article.category}</span>
          {article.roles.map(r => <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">{r}</span>)}
        </div>
        <h1 className="text-[20px] font-bold text-gray-900 mb-3">{article.title}</h1>
        <MarkdownView source={article.body} />
        {article.tags.length > 0 && (
          <div className="mt-5 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
            {article.tags.map(t => <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-50 border border-gray-200 text-gray-500">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

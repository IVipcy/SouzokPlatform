'use client'

// 業務運用ルール（読み物）の表示。ブロックを上から流すだけ。
// 図とその下の解説が1かたまりになるよう、画像と説明は続けて並べる。

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Printer, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MANUAL_BUCKET } from '@/lib/manualStep'
import type { ManualArticleRow } from '@/lib/manualArticle'

export default function ManualArticleView({ article, canEdit }: {
  article: ManualArticleRow
  canEdit: boolean
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    ;(async () => {
      const next: Record<string, string> = {}
      await Promise.all((article.blocks ?? [])
        .filter(b => b.kind === 'image' && b.path)
        .map(async b => {
          const { data } = await supabase.storage.from(MANUAL_BUCKET).createSignedUrl(b.path!, 3600)
          if (data?.signedUrl) next[b.id] = data.signedUrl
        }))
      if (alive) setUrls(next)
    })()
    return () => { alive = false }
  }, [article.blocks])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 print:hidden">
        <Link href="/manual/rules" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <ArrowLeft className="w-3.5 h-3.5" />一覧へ
        </Link>
        {canEdit && (
          <Link href={`/manual/rules/${article.id}/edit`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Pencil className="w-3.5 h-3.5" />編集
          </Link>
        )}
        <button type="button" onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Printer className="w-3.5 h-3.5" />印刷
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 max-w-3xl print:border-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[11px] font-semibold text-brand-600">{article.chapter}</span>
          {article.roles.map(r => (
            <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">{r}</span>
          ))}
        </div>
        <h1 className="text-[20px] font-bold text-brand-900 mb-4">{article.title || '（無題）'}</h1>

        <div className="space-y-3.5">
          {(article.blocks ?? []).map(b => {
            if (b.kind === 'heading') {
              return <h2 key={b.id} className="text-[15.5px] font-bold text-brand-900 pt-2">{b.body}</h2>
            }
            if (b.kind === 'text') {
              return <p key={b.id} className="text-[13.5px] text-gray-700 leading-[1.9] whitespace-pre-wrap">{linkify(b.body)}</p>
            }
            if (b.kind === 'list') {
              const lines = b.body.split('\n').map(s => s.trim()).filter(Boolean)
              return (
                <ul key={b.id} className="space-y-1.5">
                  {lines.map((l, i) => (
                    <li key={i} className="flex gap-2 text-[13.5px] text-gray-700 leading-[1.8]">
                      <span className="text-brand-400 flex-none">・</span><span>{linkify(l)}</span>
                    </li>
                  ))}
                </ul>
              )
            }
            if (b.kind === 'warn') {
              return (
                <div key={b.id} className="border-l-[3px] border-amber-400 bg-amber-50/70 px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" strokeWidth={2.25} />
                    <span className="text-[11px] font-semibold text-amber-700">注意</span>
                  </div>
                  <p className="text-[13px] text-gray-700 leading-[1.8] whitespace-pre-wrap">{linkify(b.body)}</p>
                </div>
              )
            }
            return (
              <figure key={b.id} className="my-1">
                {urls[b.id]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={urls[b.id]} alt={b.caption ?? ''} className="block max-w-full max-h-[560px] w-auto mx-auto border border-gray-200 rounded-lg" />
                  : <div className="h-32 flex items-center justify-center text-[12px] text-gray-300 border border-gray-100 rounded-lg">読み込み中…</div>}
                {b.caption && <figcaption className="mt-1.5 text-[11.5px] text-gray-400 text-center">{b.caption}</figcaption>}
              </figure>
            )
          })}
        </div>

        {article.tags.length > 0 && (
          <div className="mt-6 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
            {article.tags.map(t => (
              <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-50 border border-gray-200 text-gray-500">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 本文に直接書いたURLもクリックできるようにする（「貼ったのに押せない」を防ぐ）
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s、。）」]+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline underline-offset-2 hover:text-brand-700 break-all">{p}</a>
      : <span key={i}>{p}</span>)
}

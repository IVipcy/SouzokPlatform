'use client'

// 業務運用ルールの一覧。章で束ね、上から読める形で並べる。
// 文言検索は本文（ブロック）まで見る。手順を探しに来た人がルールに辿り着けるようにするため、
// 見出しだけでなく中身まで拾う。
//
// 追加・削除・並べ替えはシステム管理者だけ。閲覧は全員。

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Trash2, ChevronUp, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { articleText, articleExcerpt, DEFAULT_ARTICLE_CHAPTERS, type ManualArticleRow } from '@/lib/manualArticle'

export default function ManualRulesClient({ articles, canEdit }: {
  articles: ManualArticleRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  // 章の並び：既定の順を先に、そこに無い章は後ろへ
  const chapters = useMemo(() => {
    const present = [...new Set(articles.map(a => a.chapter))]
    const known = DEFAULT_ARTICLE_CHAPTERS.filter(c => present.includes(c))
    return [...known, ...present.filter(c => !DEFAULT_ARTICLE_CHAPTERS.includes(c as never))]
  }, [articles])

  const hit = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return null
    return articles.filter(a => articleText(a).toLowerCase().includes(key))
  }, [q, articles])

  const addArticle = async (chapter: string) => {
    setBusy(true)
    const n = articles.filter(a => a.chapter === chapter).length
    const { data, error } = await supabase.from('manual_articles')
      .insert({ chapter, title: '', sort_order: n }).select('id').single()
    setBusy(false)
    if (error || !data) { showToast(`作成に失敗: ${error?.message ?? ''}`, 'error'); return }
    router.push(`/manual/rules/${(data as { id: string }).id}/edit`)
  }

  const removeArticle = async (a: ManualArticleRow) => {
    if (!confirm(`「${a.title || '（無題）'}」を削除しますか。`)) return
    const { error } = await supabase.from('manual_articles').delete().eq('id', a.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }

  const move = async (list: ManualArticleRow[], i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    await Promise.all([
      supabase.from('manual_articles').update({ sort_order: j }).eq('id', list[i].id),
      supabase.from('manual_articles').update({ sort_order: i }).eq('id', list[j].id),
    ])
    router.refresh()
  }

  const Row = ({ a, list, i }: { a: ManualArticleRow; list: ManualArticleRow[]; i: number }) => (
    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
      <Link href={`/manual/rules/${a.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold text-gray-800">{a.title || '（無題）'}</span>
          {a.roles.map(r => (
            <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">{r}</span>
          ))}
        </div>
        {articleExcerpt(a) && <div className="text-[12px] text-gray-400 mt-0.5 truncate">{articleExcerpt(a)}</div>}
      </Link>
      {canEdit && (
        <div className="flex items-center gap-0.5 flex-none">
          <button type="button" onClick={() => move(list, i, -1)} disabled={i === 0}
            className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="上へ">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => move(list, i, 1)} disabled={i === list.length - 1}
            className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="下へ">
            <ChevronDown className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => removeArticle(a)}
            className="p-1 text-gray-300 hover:text-red-500" title="削除">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
      <ChevronRight className="w-4 h-4 text-gray-300 flex-none" />
    </div>
  )

  return (
    <div>
      {/* 文言検索（本文まで見る） */}
      <div className="relative mb-4 max-w-xl">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="本文から探す（例：前受金、案件の色、営業日）"
          className="w-full text-[13px] border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 bg-white outline-none focus:border-brand-400"
        />
      </div>

      {hit ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3.5 py-2 bg-brand-50/60 border-b border-brand-100 text-[11.5px] font-semibold text-brand-700">
            検索結果 {hit.length}件
          </div>
          {hit.length === 0
            ? <div className="px-4 py-8 text-center text-[13px] text-gray-400">見つかりませんでした</div>
            : hit.map((a, i) => <Row key={a.id} a={a} list={hit} i={i} />)}
        </div>
      ) : (
        <div className="space-y-4">
          {chapters.map(ch => {
            const list = articles.filter(a => a.chapter === ch)
            return (
              <div key={ch} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-brand-50/60 border-b border-brand-100 flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold text-brand-700">{ch}</span>
                  <span className="text-[11px] text-gray-400">{list.length}件</span>
                  {canEdit && (
                    <button type="button" onClick={() => addArticle(ch)} disabled={busy}
                      className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />}追加
                    </button>
                  )}
                </div>
                {list.length === 0
                  ? <div className="px-4 py-6 text-center text-[12.5px] text-gray-400">まだありません</div>
                  : list.map((a, i) => <Row key={a.id} a={a} list={list} i={i} />)}
              </div>
            )
          })}
          {canEdit && (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl px-3.5 py-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-gray-500">新しい章に追加：</span>
              {DEFAULT_ARTICLE_CHAPTERS.filter(c => !chapters.includes(c)).map(c => (
                <button key={c} type="button" onClick={() => addArticle(c)} disabled={busy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-brand-600 border border-brand-200 rounded-md hover:bg-brand-50">
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />{c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

// 操作方法の1行に付ける「関連ページ」。
//
// 考え方・ルールの詳しい説明は業務運用ルールに置き、手順からはリンクで飛ばす。
// 社内の読み物はURLを手打ちさせず一覧から選ぶ（打ち間違いとリンク切れを防ぐ）。
// 外部サイト（登記情報提供サービス等）だけURLを直接入れられる。

import { useState } from 'react'
import { BookOpen, ExternalLink, X, Plus } from 'lucide-react'
import type { ManualStepLink } from '@/lib/manualStep'

export type ArticleChoice = { id: string; title: string; chapter: string }

export default function StepLinksEditor({ links, articles, onChange }: {
  links: ManualStepLink[]
  articles: ArticleChoice[]
  onChange: (next: ManualStepLink[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  const addArticle = (a: ArticleChoice) => {
    if (links.some(l => l.kind === 'article' && l.id === a.id)) { setOpen(false); return }
    onChange([...links, { kind: 'article', id: a.id, label: a.title || '（無題）' }])
    setOpen(false)
  }
  const addUrl = () => {
    const u = url.trim()
    if (!/^https?:\/\//.test(u)) return
    onChange([...links, { kind: 'url', url: u, label: label.trim() || u }])
    setUrl(''); setLabel(''); setOpen(false)
  }
  const remove = (i: number) => onChange(links.filter((_, k) => k !== i))

  return (
    <div className="mt-1.5">
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {links.map((l, i) => (
            <span key={i} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md border border-gray-200 bg-white text-[11px] text-brand-700">
              {l.kind === 'article' ? <BookOpen className="w-3 h-3" strokeWidth={2} /> : <ExternalLink className="w-3 h-3" strokeWidth={2} />}
              <span className="max-w-[180px] truncate">{l.label}</span>
              <button type="button" onClick={() => remove(i)} className="p-0.5 text-gray-300 hover:text-red-500" title="外す">
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-brand-600 hover:text-brand-700">
          ＋ 関連ページを付ける
        </button>
      ) : (
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50/60">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-semibold text-gray-500">業務運用ルールから選ぶ</span>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[11px] text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
          {articles.length === 0 ? (
            <p className="text-[11px] text-gray-400 mb-2">まだ業務運用ルールがありません</p>
          ) : (
            <div className="max-h-36 overflow-y-auto mb-2 bg-white border border-gray-200 rounded">
              {articles.map(a => (
                <button key={a.id} type="button" onClick={() => addArticle(a)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-brand-50 border-b border-gray-100 last:border-b-0">
                  <BookOpen className="w-3.5 h-3.5 text-brand-500 flex-none" strokeWidth={2} />
                  <span className="text-[12px] text-gray-700 truncate">{a.title || '（無題）'}</span>
                  <span className="ml-auto text-[10.5px] text-gray-400 flex-none">{a.chapter}</span>
                </button>
              ))}
            </div>
          )}
          <div className="text-[11px] font-semibold text-gray-500 mb-1">外部サイトのURLを入れる</div>
          <div className="flex flex-wrap gap-1.5">
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="表示名（例：登記情報提供サービス）"
              className="flex-1 min-w-[140px] px-2 py-1 text-[11.5px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"
              className="flex-1 min-w-[160px] px-2 py-1 text-[11.5px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
            <button type="button" onClick={addUrl} disabled={!/^https?:\/\//.test(url.trim())}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-semibold text-brand-700 border border-brand-200 rounded bg-white hover:bg-brand-50 disabled:opacity-40">
              <Plus className="w-3 h-3" strokeWidth={2.5} />追加
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

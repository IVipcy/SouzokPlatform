'use client'

// 業務運用ルール（読み物）の編集。ブロックを積み上げて書く。
//
// 1本のテキストではなくブロックにしているのは、枠ごとにAIで文章を整えたいため。
// 保存は自動（入力が止まって0.8秒）。操作ステップの編集と同じ感覚で書ける。

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, Save, Trash2, ChevronUp, ChevronDown, Upload, Loader2, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MANUAL_BUCKET, MANUAL_ROLES } from '@/lib/manualStep'
import AiAssistButton from './AiAssistButton'
import {
  ARTICLE_BLOCK_LABEL, DEFAULT_ARTICLE_CHAPTERS, newBlock,
  type ArticleBlock, type ArticleBlockKind, type ManualArticleRow,
} from '@/lib/manualArticle'

const KINDS: ArticleBlockKind[] = ['heading', 'text', 'list', 'image', 'warn']

export default function ManualArticleEditor({ article }: { article: ManualArticleRow }) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState(article.title)
  const [chapter, setChapter] = useState(article.chapter)
  const [roles, setRoles] = useState<string[]>(article.roles ?? [])
  const [tags, setTags] = useState((article.tags ?? []).join(', '))
  const [blocks, setBlocks] = useState<ArticleBlock[]>(article.blocks ?? [])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // 画像の表示URL（署名付き。1時間）
  useEffect(() => {
    let alive = true
    ;(async () => {
      const next: Record<string, string> = {}
      await Promise.all(blocks.filter(b => b.kind === 'image' && b.path).map(async b => {
        const { data } = await supabase.storage.from(MANUAL_BUCKET).createSignedUrl(b.path!, 3600)
        if (data?.signedUrl) next[b.id] = data.signedUrl
      }))
      if (alive) setUrls(u => ({ ...next, ...u }))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.map(b => b.path ?? '').join('|')])

  // 自動保存（入力が止まって0.8秒）
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = useCallback(async (patch: Partial<ManualArticleRow>) => {
    setSaving(true)
    const { error } = await supabase.from('manual_articles').update(patch).eq('id', article.id)
    setSaving(false)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    setDirty(false)
  }, [supabase, article.id])

  const queue = useCallback((patch: Partial<ManualArticleRow>) => {
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(patch), 800)
  }, [save])

  const setBlocksAndSave = (next: ArticleBlock[]) => { setBlocks(next); queue({ blocks: next }) }
  const patchBlock = (id: string, patch: Partial<ArticleBlock>) =>
    setBlocksAndSave(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)))

  const addBlock = (kind: ArticleBlockKind) => setBlocksAndSave([...blocks, newBlock(kind)])
  const removeBlock = (id: string) => {
    if (!confirm('このブロックを削除しますか。')) return
    setBlocksAndSave(blocks.filter(b => b.id !== id))
  }
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    setBlocksAndSave(next)
  }

  const uploadImage = async (id: string, file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `articles/${article.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(MANUAL_BUCKET).upload(path, file, { upsert: true, cacheControl: '3600' })
    if (error) { showToast(`アップロードに失敗: ${error.message}`, 'error'); return }
    const { data } = await supabase.storage.from(MANUAL_BUCKET).createSignedUrl(path, 3600)
    if (data?.signedUrl) setUrls(u => ({ ...u, [id]: data.signedUrl }))
    patchBlock(id, { path })
  }

  // AIに渡す文脈（何のページの話か分からないと的外れな直しになる）
  const context = [title && `ページ：${title}`, chapter && `章：${chapter}`].filter(Boolean).join(' / ')

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Manual"
        title="業務運用ルールの編集"
        icon={Scale}
        description="図とその下の解説を積み上げて書きます。枠ごとにAIで文章を整えられます。"
        right={
          <div className="flex items-center gap-2">
            <Link href="/manual/rules" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <ArrowLeft className="w-3.5 h-3.5" />一覧へ
            </Link>
            <Link href={`/manual/rules/${article.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Eye className="w-3.5 h-3.5" />表示を見る
            </Link>
            <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg ${dirty || saving ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-gray-400 bg-gray-50 border border-gray-200'}`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? '保存中' : dirty ? '未保存' : '保存済み'}
            </span>
          </div>
        }
      />

      {/* 見出し・章・対象・キーワード */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 mb-3.5 space-y-2.5">
        <input
          type="text" value={title} placeholder="ページの題名（例：アラートの考え方）"
          onChange={e => { setTitle(e.target.value); queue({ title: e.target.value }) }}
          className="w-full px-2.5 py-1.5 text-[15px] font-semibold border border-gray-300 rounded-md outline-none focus:border-brand-400" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-gray-400">章</span>
          <select value={chapter} onChange={e => { setChapter(e.target.value); queue({ chapter: e.target.value }) }}
            className="px-2 py-1 text-[11.5px] text-gray-600 border border-gray-200 rounded-md bg-white outline-none focus:border-brand-400">
            {[...new Set([chapter, ...DEFAULT_ARTICLE_CHAPTERS])].filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-[11.5px] text-gray-400 ml-2">誰向け</span>
          {MANUAL_ROLES.map(r => {
            const on = roles.includes(r)
            return (
              <button key={r} type="button"
                onClick={() => { const next = on ? roles.filter(x => x !== r) : [...roles, r]; setRoles(next); queue({ roles: next }) }}
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors ${
                  on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-400 border-gray-200 hover:border-brand-300'}`}>
                {r}
              </button>
            )
          })}
          <span className="text-[11px] text-gray-400">選ばなければ全員に出ます</span>
        </div>
        <input
          type="text" value={tags} placeholder="検索キーワード（カンマ区切り。本文にない言い回しを拾わせたいとき）"
          onChange={e => { setTags(e.target.value); queue({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }) }}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none focus:border-brand-400" />
      </div>

      {/* 本文（ブロック） */}
      <div className="space-y-3">
        {blocks.length === 0 && (
          <p className="text-[12.5px] text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-lg">
            下の「＋ 見出し／本文／…」から書き始めてください
          </p>
        )}
        {blocks.map((b, i) => (
          <div key={b.id} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-gray-400">{ARTICLE_BLOCK_LABEL[b.kind]}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {b.kind !== 'image' && (
                  <AiAssistButton text={b.body} context={context} onAdopt={v => patchBlock(b.id, { body: v })} />
                )}
                <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0}
                  className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="上へ"><ChevronUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}
                  className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="下へ"><ChevronDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => removeBlock(b.id)}
                  className="p-1 text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            {b.kind === 'image' ? (
              <div>
                {b.path && urls[b.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[b.id]} alt="" className="block max-w-full max-h-[420px] w-auto mx-auto border border-gray-200 rounded-lg" />
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1.5 py-10 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-300">
                    <Upload className="w-5 h-5 text-brand-500" strokeWidth={2} />
                    <span className="text-[12.5px] font-semibold text-brand-600">画像を追加</span>
                    <span className="text-[11px] text-gray-400">PPTの図やキャプチャを貼れます</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage(b.id, f); e.target.value = '' }} />
                  </label>
                )}
                <input
                  type="text" defaultValue={b.caption ?? ''} placeholder="図の説明（任意）"
                  onBlur={e => { if (e.target.value !== (b.caption ?? '')) patchBlock(b.id, { caption: e.target.value }) }}
                  className="w-full mt-2 px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none focus:border-brand-400" />
                {b.path && (
                  <button type="button" onClick={() => patchBlock(b.id, { path: null })}
                    className="mt-1.5 text-[11px] text-gray-400 hover:text-red-500">画像を差し替える</button>
                )}
              </div>
            ) : (
              <textarea
                value={b.body}
                onChange={e => patchBlock(b.id, { body: e.target.value })}
                rows={b.kind === 'heading' ? 1 : b.kind === 'list' ? 4 : 5}
                placeholder={
                  b.kind === 'heading' ? '見出し'
                  : b.kind === 'list' ? '1行に1つ書きます（改行で区切る）'
                  : b.kind === 'warn' ? '守らないと事故になることを書きます'
                  : '本文。書き散らしてから「AIに任せる」で整えても構いません'}
                className={`w-full px-3 py-2 text-[13px] leading-relaxed border rounded outline-none resize-y ${
                  b.kind === 'heading' ? 'font-semibold text-[14.5px] border-gray-300'
                  : b.kind === 'warn' ? 'bg-amber-50/50 border-amber-200 focus:border-amber-400'
                  : 'bg-gray-50 border-transparent focus:border-brand-400 focus:bg-white'}`}
              />
            )}
            {b.kind === 'warn' && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700">
                <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />表示では琥珀の帯で出ます
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ブロックを足す */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {KINDS.map(k => (
          <button key={k} type="button" onClick={() => addBlock(k)}
            className="px-3 py-1.5 text-[12px] font-semibold text-gray-600 border border-dashed border-gray-300 rounded-lg hover:text-brand-700 hover:border-brand-300">
            ＋ {ARTICLE_BLOCK_LABEL[k]}
          </button>
        ))}
        <button type="button" onClick={() => router.refresh()}
          className="ml-auto px-3 py-1.5 text-[12px] font-semibold text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50">
          読み込み直す
        </button>
      </div>
    </div>
  )
}

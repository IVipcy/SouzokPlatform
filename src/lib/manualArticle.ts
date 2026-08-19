// マニュアルの「業務運用ルール」（manual_articles・migration 250）の型と共通処理。
//
// 操作方法（manual_steps）が「どこを押すか」なのに対し、こちらは「なぜそうするか」を書く。
// アラートの定義・案件の色・請求の型のように、画面操作に紐づかない決めごとを体系的に置く場所。
//
// 本文はブロックの並びで持つ。1本のテキストにしないのは、
// ブロック単位でAIに文章を整えさせたい（枠ごとにボタンを置きたい）ため。

export type ArticleBlockKind = 'heading' | 'text' | 'list' | 'image' | 'warn'

export type ArticleBlock = {
  id: string
  kind: ArticleBlockKind
  /** heading/text/warn は本文。list は改行区切りの各行。image は使わない */
  body: string
  /** image のときだけ。manual-images バケットのパス */
  path?: string | null
  /** image のときだけ。図の下に出す短い説明 */
  caption?: string | null
}

export type ManualArticleRow = {
  id: string
  chapter: string
  title: string
  roles: string[]
  tags: string[]
  blocks: ArticleBlock[]
  sort_order: number
  updated_at: string
}

/** 操作方法／業務運用ルール からの関連ページ */
export type ManualLink =
  | { kind: 'article'; id: string; label: string }
  | { kind: 'url'; url: string; label: string }

export const ARTICLE_BLOCK_LABEL: Record<ArticleBlockKind, string> = {
  heading: '見出し',
  text: '本文',
  list: '箇条書き',
  image: '画像',
  warn: '注意書き',
}

/** 章。操作方法の章とは別軸（考え方の分類）で持つ。 */
export const DEFAULT_ARTICLE_CHAPTERS = [
  'アラート・通知', '案件の進め方', '請求・入金', '書類・納品', '用語', 'その他',
] as const

export const newBlock = (kind: ArticleBlockKind): ArticleBlock => ({
  id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
  kind,
  body: '',
  path: null,
  caption: null,
})

/** 検索用のプレーンテキスト（見出し・本文・箇条書き・注意書き・画像の説明を全部つなぐ） */
export function articleText(a: Pick<ManualArticleRow, 'title' | 'tags' | 'blocks'>): string {
  const parts = [a.title, ...(a.tags ?? [])]
  for (const b of a.blocks ?? []) {
    if (b.body) parts.push(b.body)
    if (b.caption) parts.push(b.caption)
  }
  return parts.join('\n')
}

/** 一覧に出す1行の抜粋（最初の本文ブロックの先頭） */
export function articleExcerpt(a: Pick<ManualArticleRow, 'blocks'>, max = 60): string {
  const first = (a.blocks ?? []).find(b => (b.kind === 'text' || b.kind === 'warn') && b.body.trim())
  const s = (first?.body ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

import fs from 'fs'
import path from 'path'

// マニュアル記事（ナレッジベース）。content/manual/*.md を読み込む。
// frontmatter は簡易パース（title/category/roles/tags/order）。本文は markdown 文字列。
export type ManualRole = '受注' | '事務管理' | '経理' | '共通'

export type ManualArticle = {
  slug: string
  title: string
  category: string      // 業務フローの段（目次の見出し）
  roles: string[]       // 関係する役割
  tags: string[]        // キーワード（検索用）
  order: number         // カテゴリ内の並び順
  body: string          // markdown 本文
}

// 業務フロー軸の並び（目次の表示順）。未知カテゴリは末尾。
export const MANUAL_CATEGORY_ORDER = [
  '基本',
  '面談・新規登録',
  '契約・受注内容',
  '対応中・進行',
  '調査',
  'タスク',
  '請求・入金',
  '完了・精算',
  'FAQ',
]

const DIR = path.join(process.cwd(), 'content', 'manual')

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) meta[key] = val
  }
  return { meta, body: m[2].trim() }
}

const list = (v: string | undefined): string[] =>
  (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function getAllArticles(): ManualArticle[] {
  let files: string[] = []
  try {
    files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'))
  } catch {
    return []
  }
  const articles = files.map(f => {
    const raw = fs.readFileSync(path.join(DIR, f), 'utf-8')
    const { meta, body } = parseFrontmatter(raw)
    return {
      slug: f.replace(/\.md$/, ''),
      title: meta.title || f,
      category: meta.category || 'その他',
      roles: list(meta.roles),
      tags: list(meta.tags),
      order: Number(meta.order || '99'),
      body,
    } as ManualArticle
  })
  articles.sort((a, b) => {
    const ca = MANUAL_CATEGORY_ORDER.indexOf(a.category)
    const cb = MANUAL_CATEGORY_ORDER.indexOf(b.category)
    return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb) || a.order - b.order || a.title.localeCompare(b.title, 'ja')
  })
  return articles
}

export function getArticle(slug: string): ManualArticle | null {
  return getAllArticles().find(a => a.slug === slug) ?? null
}

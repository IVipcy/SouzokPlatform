'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, ChevronRight } from 'lucide-react'

export type ManualIndexItem = {
  slug: string
  title: string
  category: string
  roles: string[]
  tags: string[]
  search: string  // 検索用（title+tags+本文を小文字化）
}

const ROLES = ['すべて', '受注', '事務管理', '経理'] as const

export default function ManualIndex({ items, categoryOrder }: { items: ManualIndexItem[]; categoryOrder: string[] }) {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<string>('すべて')

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items.filter(it => {
      if (role !== 'すべて' && !it.roles.includes(role) && !it.roles.includes('共通')) return false
      if (query && !it.search.includes(query)) return false
      return true
    })
  }, [items, q, role])

  // カテゴリごとにグループ化（業務フロー順）
  const groups = useMemo(() => {
    const map = new Map<string, ManualIndexItem[]>()
    for (const it of filtered) {
      if (!map.has(it.category)) map.set(it.category, [])
      map.get(it.category)!.push(it)
    }
    return [...map.entries()].sort((a, b) => {
      const ia = categoryOrder.indexOf(a[0]); const ib = categoryOrder.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [filtered, categoryOrder])

  return (
    <div className="space-y-4">
      {/* 検索＋役割フィルタ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-3 py-2 w-[320px] max-w-full">
          <Search className="w-4 h-4 text-gray-400" strokeWidth={2} />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="キーワードで検索（例：返金、対応中、受領資料）"
            className="bg-transparent border-none outline-none text-[13px] text-gray-700 w-full placeholder:text-gray-400"
          />
        </div>
        <div className="flex gap-1">
          {ROLES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`px-2.5 py-1.5 rounded-md text-[12px] font-semibold border transition-colors ${role === r ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >{r}</button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-gray-400">{filtered.length} 件</span>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-[13px] text-gray-400">該当する記事がありません</div>
      ) : (
        <div className="space-y-4">
          {groups.map(([cat, arts]) => (
            <section key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
                <h2 className="text-[13px] font-bold text-gray-900">{cat}</h2>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                {arts.map(a => (
                  <Link key={a.slug} href={`/manual/${a.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/40 transition-colors group">
                    <BookOpen className="w-4 h-4 text-gray-300 group-hover:text-brand-500 flex-shrink-0" strokeWidth={2} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-gray-800 group-hover:text-brand-700 truncate">{a.title}</div>
                      {a.tags.length > 0 && <div className="text-[11px] text-gray-400 truncate">{a.tags.join(' / ')}</div>}
                    </div>
                    {a.roles.length > 0 && (
                      <div className="hidden sm:flex gap-1 flex-shrink-0">
                        {a.roles.map(r => <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">{r}</span>)}
                      </div>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

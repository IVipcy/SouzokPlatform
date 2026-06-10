'use client'

import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ClientHit = { id: string; name: string; furigana: string | null }

type Props = {
  value: string                 // 選択中の client_id（未選択は ''）
  displayName: string           // 選択中の依頼者名（入力欄表示）
  onSelect: (clientId: string, name: string) => void
  label?: string
}

/**
 * 過去客経由の「詳細」: 既存の依頼者(clients)を名前で検索して選択する。
 * 選択すると同一 client_id を新案件に紐付け、過去案件の履歴が辿れる。
 */
export default function PastClientLookup({ value, displayName, onSelect, label }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState(displayName)
  const [hits, setHits] = useState<ClientHit[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(displayName) }, [displayName])

  // 入力に応じて検索
  useEffect(() => {
    const q = query.trim()
    if (!q) { setHits([]); return }
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, furigana')
        .or(`name.ilike.%${q}%,furigana.ilike.%${q}%`)
        .order('name')
        .limit(10)
      if (alive) setHits((data ?? []) as ClientHit[])
    }, 200)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (h: ClientHit) => { onSelect(h.id, h.name); setQuery(h.name); setOpen(false) }

  return (
    <div className={label ? 'py-1.5' : ''} ref={boxRef}>
      {label && <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">{label}</div>}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onSelect('', e.target.value) }}
          onFocus={() => setOpen(true)}
          placeholder="過去の依頼者を氏名で検索"
          className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg pl-8 pr-3 py-2 text-[13px] text-gray-900 outline-none focus:border-brand-500 focus:bg-white transition"
        />
        {value && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-emerald-600">紐付け済</span>}
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {hits.map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => pick(h)}
                className="w-full text-left px-3 py-1.5 text-[13px] text-gray-700 hover:bg-brand-50"
              >
                {h.name}{h.furigana ? <span className="text-gray-400 ml-1.5 text-[11px]">{h.furigana}</span> : null}
              </button>
            ))}
            {query.trim() && hits.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-gray-400">該当する依頼者がいません（新規の方は通常どおり依頼者情報を入力）</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

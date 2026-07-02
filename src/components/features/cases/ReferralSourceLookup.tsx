'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

type Props = {
  route: string
  value: string | null
  onChange: (name: string) => void
  label?: string
  placeholder?: string
  staticOptions?: string[]
  defaultOptions?: string[]
}

export default function ReferralSourceLookup({ route, value, onChange, label, placeholder, staticOptions, defaultOptions }: Props) {
  const supabase = createClient()
  const [dbOptions, setDbOptions] = useState<string[]>([])
  const [query, setQuery] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const options = staticOptions ?? dbOptions

  useEffect(() => {
    if (staticOptions || !route) { setDbOptions([]); return }
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('referral_sources').select('name').eq('route', route).order('name')
      if (alive) setDbOptions(((data ?? []) as { name: string }[]).map(d => d.name))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, !!staticOptions])

  useEffect(() => { setQuery(value ?? '') }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim()
  const filtered = q
    ? options.filter(o => o.toLowerCase().includes(q.toLowerCase()))
    : (defaultOptions ?? options)
  const exact = options.some(o => o === q)

  const select = (name: string) => { onChange(name); setQuery(name); setOpen(false) }

  const addNew = async () => {
    if (!q || !route) return
    setBusy(true)
    const { error } = await supabase.from('referral_sources').insert({ route, name: q })
    setBusy(false)
    if (error && !error.message.includes('duplicate')) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    if (!staticOptions) {
      setDbOptions(prev => (prev.includes(q) ? prev : [...prev, q].sort()))
    }
    select(q)
  }

  return (
    <div className={label ? 'py-1.5' : ''} ref={boxRef}>
      {label && <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">{label}</div>}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          disabled={!route}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={route ? (placeholder ?? '紹介元を検索 / 入力して追加') : '先に面談ルートを選択'}
          className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg pl-8 pr-3 py-2 text-[13px] text-gray-900 outline-none focus:border-brand-500 focus:bg-white transition disabled:opacity-50"
        />
        {open && route && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {filtered.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => select(o)}
                className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-brand-50 ${o === value ? 'text-brand-700 font-semibold' : 'text-gray-700'}`}
              >
                {o}
              </button>
            ))}
            {q && !exact && !staticOptions && (
              <button
                type="button"
                onClick={addNew}
                disabled={busy}
                className="w-full text-left px-3 py-1.5 text-[13px] text-brand-700 font-semibold hover:bg-brand-50 border-t border-gray-100 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />「{q}」を追加
              </button>
            )}
            {filtered.length === 0 && !q && !staticOptions && (
              <div className="px-3 py-2 text-[12px] text-gray-400">候補がありません。入力して追加できます。</div>
            )}
            {filtered.length === 0 && q && staticOptions && (
              <div className="px-3 py-2 text-[12px] text-gray-400">該当する候補がありません</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

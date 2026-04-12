'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MemberRow } from '@/types'

type Props = {
  selectedTaskIds: string[]
  allMembers: MemberRow[]
  onDone: () => void
  onClearSelection: () => void
}

export default function BulkAssignBar({ selectedTaskIds, allMembers, onDone, onClearSelection }: Props) {
  const [primaryId, setPrimaryId] = useState('')
  const [subIds, setSubIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  if (selectedTaskIds.length === 0) return null

  const handleAssign = async () => {
    if (!primaryId && subIds.length === 0) return
    setSaving(true)
    const supabase = createClient()

    for (const taskId of selectedTaskIds) {
      // Remove existing assignees for selected roles only
      if (primaryId) {
        await supabase.from('task_assignees').delete().eq('task_id', taskId).eq('role', 'primary')
        await supabase.from('task_assignees').insert({ task_id: taskId, member_id: primaryId, role: 'primary' })
      }
      for (const subId of subIds) {
        // Upsert sub: delete if exists, then insert
        await supabase.from('task_assignees').delete().eq('task_id', taskId).eq('member_id', subId).eq('role', 'sub')
        await supabase.from('task_assignees').insert({ task_id: taskId, member_id: subId, role: 'sub' })
      }
    }

    setSaving(false)
    setPrimaryId('')
    setSubIds([])
    onClearSelection()
    onDone()
  }

  return (
    <div className="sticky top-0 z-20 bg-blue-600 text-white rounded-xl px-4 py-3 mb-3 shadow-lg flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">{selectedTaskIds.length}件</span>
        <span className="text-xs opacity-80">選択中</span>
      </div>

      <div className="h-5 w-px bg-white/30" />

      {/* Primary assignee */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] opacity-80">主担当:</span>
        <SearchableSelectCompact
          members={allMembers}
          value={primaryId}
          onChange={setPrimaryId}
          placeholder="選択..."
        />
      </div>

      {/* Sub assignees */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] opacity-80">副担当:</span>
        <MultiSelectCompact
          members={allMembers}
          selectedIds={subIds}
          onAdd={id => setSubIds(prev => [...prev, id])}
          onRemove={id => setSubIds(prev => prev.filter(i => i !== id))}
          placeholder="追加..."
        />
      </div>

      <div className="flex-1" />

      <button
        onClick={onClearSelection}
        className="text-xs text-white/70 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition"
      >
        選択解除
      </button>
      <button
        onClick={handleAssign}
        disabled={saving || (!primaryId && subIds.length === 0)}
        className="px-4 py-1.5 bg-white text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-50 disabled:opacity-50 transition"
      >
        {saving ? '割振り中...' : '割り振る'}
      </button>
    </div>
  )
}

// ─── Compact Searchable Select (for bar) ───
function SearchableSelectCompact({ members, value, onChange, placeholder }: {
  members: MemberRow[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = members.find(m => m.id === value)
  const filtered = query ? members.filter(m => m.name.toLowerCase().includes(query.toLowerCase())) : members

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery('') }}
        className="bg-white/20 hover:bg-white/30 border border-white/30 rounded-md px-2 py-1 text-xs flex items-center gap-1.5 min-w-[120px] transition"
      >
        {selected ? (
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0" style={{ backgroundColor: selected.avatar_color }}>
              {selected.name.charAt(0)}
            </span>
            <span>{selected.name}</span>
          </span>
        ) : (
          <span className="opacity-70">{placeholder}</span>
        )}
        <span className="text-[9px] ml-auto opacity-60">▼</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[180px]">
          <div className="p-1.5 border-b border-gray-100">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前で検索..."
              className="w-full px-2 py-1 text-xs text-gray-700 border border-gray-200 rounded focus:outline-none focus:border-blue-400" autoFocus />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <button onClick={() => { onChange(''); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">
              未選択
            </button>
            {filtered.map(m => (
              <button key={m.id} onClick={() => { onChange(m.id); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition ${m.id === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name.charAt(0)}</span>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Compact Multi Select (for bar) ───
function MultiSelectCompact({ members, selectedIds, onAdd, onRemove, placeholder }: {
  members: MemberRow[]
  selectedIds: string[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedMembers = members.filter(m => selectedIds.includes(m.id))
  const available = query
    ? members.filter(m => !selectedIds.includes(m.id) && m.name.toLowerCase().includes(query.toLowerCase()))
    : members.filter(m => !selectedIds.includes(m.id))

  return (
    <div ref={ref} className="relative">
      <div
        className="bg-white/20 hover:bg-white/30 border border-white/30 rounded-md px-2 py-1 flex items-center gap-1 min-w-[120px] cursor-pointer transition flex-wrap"
        onClick={() => { setOpen(true); setQuery('') }}
      >
        {selectedMembers.length > 0 ? (
          selectedMembers.map(m => (
            <span key={m.id} className="inline-flex items-center gap-0.5 bg-white/30 rounded px-1 py-0.5 text-[10px]">
              {m.name}
              <button onClick={e => { e.stopPropagation(); onRemove(m.id) }} className="hover:text-red-200 ml-0.5">✕</button>
            </span>
          ))
        ) : (
          <span className="text-xs opacity-70">{placeholder}</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[180px]">
          <div className="p-1.5 border-b border-gray-100">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前で検索..."
              className="w-full px-2 py-1 text-xs text-gray-700 border border-gray-200 rounded focus:outline-none focus:border-blue-400" autoFocus />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {available.map(m => (
              <button key={m.id} onClick={() => { onAdd(m.id); setQuery('') }}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 transition text-gray-700">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name.charAt(0)}</span>
                {m.name}
              </button>
            ))}
            {available.length === 0 && <div className="px-3 py-2 text-xs text-gray-400 text-center">{query ? '該当なし' : '全員選択済み'}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

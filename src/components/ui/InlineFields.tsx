'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CaseMemberRow, MemberRow } from '@/types'

// ─── Section ───
export function Section({ title, icon, children, actionLabel, onAction }: {
  title: string
  icon: string
  children: React.ReactNode
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
        {actionLabel && onAction && (
          <button onClick={onAction} className="ml-auto text-[11px] text-blue-600 font-semibold hover:text-blue-700">+ {actionLabel}</button>
        )}
      </div>
      <div className="px-4 py-3">
        {children}
      </div>
    </div>
  )
}

// ─── FieldGrid ───
export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return <div className={`grid ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-0`}>{children}</div>
}

// ─── Field (read-only) ───
export function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
        {value ?? '未設定'}
      </div>
    </div>
  )
}

// ─── QIRow (quick info row) ───
export function QIRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-b-0 text-xs">
      <span className="text-gray-500">{label}</span>
      {children}
    </div>
  )
}

// ─── InlineEdit (text) ───
export function InlineEdit({ label, value, onSave, mono, fullWidth, required }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  fullWidth?: boolean
  required?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleStartEdit = () => { setDraft(value ?? ''); setEditing(true) }

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(trimmed) } finally { setSaving(false); setEditing(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 ${mono ? 'font-mono' : ''} ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={handleStartEdit} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineSelect (picklist) ───
export function InlineSelect({ label, value, options, onSave, fullWidth, required, renderValue }: {
  label: string
  value?: string | null
  options: string[]
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
  renderValue?: (v: string) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleChange = async (newVal: string) => {
    if (newVal === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(newVal) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <select
          value={value ?? ''}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          disabled={saving}
          className={`w-full px-1 py-0.5 -ml-1 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
        >
          <option value="">（未設定）</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <div onClick={() => setEditing(true)} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {value ? (
            renderValue ? renderValue(value) : <span className="text-[13px] text-gray-700 font-medium">{value}</span>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">▼</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineMultiSelect ───
export function InlineMultiSelect({ label, value, options, onSave, fullWidth, required }: {
  label: string
  value?: string[] | null
  options: string[]
  onSave: (value: string[]) => Promise<void>
  fullWidth?: boolean
  required?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(value ?? [])
  const [saving, setSaving] = useState(false)

  const toggle = (opt: string) => {
    setDraft(prev => prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt])
  }

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false); setEditing(false) }
  }

  const handleOpen = () => { setDraft(value ?? []); setEditing(true) }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <div className="mt-1 p-2 border border-blue-400 rounded bg-blue-50/30">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={saving}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                  draft.includes(opt)
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {draft.includes(opt) && '✓ '}{opt}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400 hover:text-gray-600">キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="text-[10px] text-blue-600 font-semibold hover:text-blue-700">保存</button>
          </div>
        </div>
      ) : (
        <div onClick={handleOpen} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {value && value.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {value.map(item => (
                <span key={item} className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex-shrink-0">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineDate ───
export function InlineDate({ label, value, onSave, fullWidth, required }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const handleSave = async () => {
    if (draft === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] font-mono border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">📅</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineNumber ───
export function InlineNumber({ label, value, onSave, fullWidth, suffix }: {
  label: string
  value?: number | null
  onSave: (value: number | null) => Promise<void>
  fullWidth?: boolean
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])

  const handleSave = async () => {
    const parsed = draft.trim() === '' ? null : Number(draft)
    if (parsed === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(parsed) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value?.toString() ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] font-mono border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `${value.toLocaleString()}${suffix ?? ''}` : '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineCurrency ───
export function InlineCurrency({ label, value, onSave, fullWidth }: {
  label: string
  value?: number | null
  onSave: (value: number | null) => Promise<void>
  fullWidth?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editing])

  const handleSave = async () => {
    const parsed = draft.trim() === '' ? null : Number(draft.replace(/,/g, ''))
    if (parsed === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(parsed) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-gray-500">¥</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value?.toString() ?? ''); setEditing(false) } }}
            disabled={saving}
            className={`w-full px-1.5 py-0.5 text-[13px] font-mono border border-blue-400 rounded outline-none bg-blue-50/30 ${saving ? 'opacity-50' : ''}`}
          />
        </div>
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `¥${value.toLocaleString()}` : '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineCheckbox ───
export function InlineCheckbox({ label, value, onSave }: {
  label: string
  value?: boolean
  onSave: (value: boolean) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)

  const handleToggle = async () => {
    setSaving(true)
    try { await onSave(!value) } finally { setSaving(false) }
  }

  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className="flex items-center gap-2 min-h-[24px]">
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 hover:border-blue-400'
          } ${saving ? 'opacity-50' : ''}`}
        >
          {value && <span className="text-[11px]">✓</span>}
        </button>
        <span className={`text-[13px] ${value ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
          {value ? 'あり' : 'なし'}
        </span>
      </div>
    </div>
  )
}

// ─── InlineTextarea ───
export function InlineTextarea({ label, value, onSave, fullWidth }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) textareaRef.current.focus()
  }, [editing])

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try { await onSave(trimmed) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={saving}
            rows={3}
            className={`w-full px-1.5 py-1 -ml-1.5 text-[13px] border border-blue-400 rounded outline-none bg-blue-50/30 resize-y ${saving ? 'opacity-50' : ''}`}
          />
          <div className="flex gap-2 justify-end mt-1">
            <button onClick={() => { setDraft(value ?? ''); setEditing(false) }} className="text-[10px] text-gray-400 hover:text-gray-600">キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="text-[10px] text-blue-600 font-semibold hover:text-blue-700">保存</button>
          </div>
        </div>
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="group cursor-pointer flex items-start gap-1.5 min-h-[24px]">
          {value ? (
            <span className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</span>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex-shrink-0 mt-0.5">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineMemberSelect (担当者選択) ───
export function InlineMemberSelect({ label, roleKey, assigned, allMembers, caseId, onRefresh, multi }: {
  label: string
  roleKey: string
  assigned: CaseMemberRow[]
  allMembers: MemberRow[]
  caseId: string
  onRefresh?: () => void
  multi?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSelect = async (memberId: string) => {
    setSaving(true)
    const supabase = createClient()
    try {
      if (!multi) {
        // Single: remove existing, add new
        await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', roleKey)
        if (memberId) {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
        }
      } else {
        // Multi: toggle
        const existing = assigned.find(cm => cm.member_id === memberId)
        if (existing) {
          await supabase.from('case_members').delete().eq('id', existing.id)
        } else {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
        }
      }
      onRefresh?.()
    } finally {
      setSaving(false)
      if (!multi) setEditing(false)
    }
  }

  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div className="mt-1 p-2 border border-blue-400 rounded bg-blue-50/30">
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {!multi && (
              <button
                onClick={() => handleSelect('')}
                disabled={saving}
                className="w-full text-left px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 rounded"
              >
                （未設定）
              </button>
            )}
            {allMembers.map(member => {
              const isAssigned = assigned.some(cm => cm.member_id === member.id)
              return (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member.id)}
                  disabled={saving}
                  className={`w-full text-left px-2 py-1 text-xs rounded flex items-center gap-2 ${
                    isAssigned ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: member.avatar_color }}
                  >
                    {member.name.charAt(0)}
                  </span>
                  <span>{member.name}</span>
                  {isAssigned && <span className="ml-auto text-blue-500">✓</span>}
                </button>
              )
            })}
          </div>
          <div className="flex justify-end mt-2">
            <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {assigned.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {assigned.map(cm => (
                <div key={cm.member_id} className="flex items-center gap-1.5">
                  <span
                    className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: cm.members?.avatar_color ?? '#6B7280' }}
                  >
                    {cm.members?.name?.charAt(0) ?? '?'}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {cm.members?.name ?? '未設定'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-300 italic">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── FormField ───
export function FormField({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

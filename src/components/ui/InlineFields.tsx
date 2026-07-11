'use client'

import { useState, useRef, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import UserAvatar from '@/components/ui/UserAvatar'
import { toWareki } from '@/lib/wareki'
import type { CaseMemberRow, MemberRow } from '@/types'

/** 保存後にトーストを表示する共通ラッパ */
async function withToast<T>(op: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await op()
    showToast('保存しました', 'success')
    return result
  } catch (e) {
    console.error(e)
    showToast('保存に失敗しました', 'error')
    return undefined
  }
}

// ─── Section ───
// 大セクション（OSSection＝オーダーシートの親）の中に入ると、この Context が true になり、
// Section は「白カードの小セクション」ではなく「親の中の見出しブロック（枠なし・灰見出し）」に切り替わる。
// これにより、案件詳細の各タブ（単体表示）は従来の青カードのまま、オーダーシート内だけ階層表示になる。
export const NestedSectionContext = createContext(false)

export function Section({ title, icon: _icon, children, actionLabel, onAction, collapsible = false, defaultOpen = true }: {
  title: string
  icon?: string  // deprecated: 旧API互換のため受け取るだけ。表示はしない
  children: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  collapsible?: boolean  // true でアコーディオン（タイトルクリックで開閉）
  defaultOpen?: boolean
}) {
  const nested = useContext(NestedSectionContext)
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = collapsible ? open : true

  // nested=false（通常）: 白背景＋薄枠＋青見出しのカード型。
  // nested=true（オーダーシート内）: 枠なし・灰の細見出し＋インデントで、親の中の一部だと分かる小見出しに。
  const sectionCls = nested ? '' : 'bg-white border border-gray-200 rounded'
  const headerCls = nested
    ? 'flex items-center gap-2 mb-2'
    : 'flex items-center gap-2 px-4 py-2.5 bg-brand-50 border-b border-brand-100 rounded-t-[3px]'
  const tickCls = nested ? 'inline-block w-[3px] h-3.5 bg-brand-500 rounded-[1px] flex-shrink-0' : 'inline-block w-[3px] h-3.5 bg-brand-600 rounded-[1px] flex-shrink-0'
  const titleCls = nested ? 'text-[12.5px] font-semibold text-gray-600 tracking-[0.02em]' : 'text-[13px] font-semibold text-brand-800 tracking-[0.02em]'
  const contentCls = nested ? 'pl-[11px]' : 'px-4 py-3.5'

  return (
    <section className={sectionCls}>
      <div className={headerCls}>
        <span className={tickCls} />
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 text-left group"
          >
            <h3 className={`${titleCls} group-hover:text-brand-900 transition-colors`}>{title}</h3>
            <svg
              className={`w-4 h-4 text-brand-400 transition-transform group-hover:text-brand-600 ${isOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[11px] text-brand-400 group-hover:text-brand-600">{isOpen ? '閉じる' : '開く'}</span>
          </button>
        ) : (
          <h3 className={titleCls}>{title}</h3>
        )}
        {actionLabel && onAction && (
          <button onClick={onAction} className="ml-auto text-[12.5px] text-brand-600 font-semibold hover:text-brand-700">＋ {actionLabel}</button>
        )}
      </div>
      {isOpen && (
        <div className={contentCls}>
          {children}
        </div>
      )}
    </section>
  )
}

// ─── SectionHeading ───
// Section と同じ見出しスタイル（縦棒＋12.5px bold gray-700）。
// カードヘッダー等、Section コンポーネントを使えない場所で見出しを揃えたいとき用。
export function SectionHeading({ title, right, className = '' }: { title: string; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="inline-block w-[3px] h-3.5 bg-brand-600 rounded-[1px]" />
      <h3 className="text-[12.5px] font-semibold text-brand-800 tracking-[0.02em]">{title}</h3>
      {right && <div className="ml-auto flex items-center">{right}</div>}
    </div>
  )
}

// ─── FieldGrid ───
// 2項目/行を基本にした、テーブル風の見た目で統一（白セル＋薄いグリッド線）。
// 各タブで共通利用するため、ここを変えると全タブのフィールド表示が揃う。
export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      className={`grid ${cols === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100 [&>*]:bg-white [&>*]:px-3`}
    >
      {children}
    </div>
  )
}

// ─── Field (read-only) ───
export function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
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
export function InlineEdit({ label, value, onSave, mono, fullWidth, required, action, hint }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  fullWidth?: boolean
  required?: boolean
  action?: React.ReactNode  // ラベル横に置く補助ボタン（例: 「依頼者と同じ」自動入力）
  hint?: string             // 値の下に出す補助説明（例: 郵便番号で住所自動入力）
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)
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
    await withToast(() => onSave(trimmed))
    setSaving(false); setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME合成中はEnterで確定しない
    if (composingRef.current) return
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="text-[12px] font-semibold text-gray-400 tracking-wide">
          {label}
        </div>
        {action}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onBlur={() => { if (!composingRef.current) handleSave() }}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 ${mono ? 'font-mono' : ''} ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div
          onClick={handleStartEdit}
          className="group cursor-pointer flex items-center gap-1.5 min-h-[24px] -ml-1 pl-1 pr-1 rounded hover:bg-brand-50 transition-colors"
          title="クリックして編集"
        >
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium border-b border-dashed border-gray-200 group-hover:border-brand-400' : 'text-gray-300 italic text-xs border-b border-dashed border-gray-200 group-hover:border-brand-400'}`}>
            {value ?? 'クリックして入力'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px]">✏️</span>
        </div>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

// ─── InlineSelect (picklist) ───
export function InlineSelect({ label, value, options, onSave, fullWidth, required, renderValue, optionLabel }: {
  label: string
  value?: string | null
  options: string[]
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
  renderValue?: (v: string) => React.ReactNode
  optionLabel?: (v: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleChange = async (newVal: string) => {
    if (newVal === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(newVal))
    setSaving(false); setEditing(false)
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">
        {label}
      </div>
      {editing ? (
        <select
          value={value ?? ''}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          disabled={saving}
          className={`w-full px-1 py-0.5 -ml-1 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 ${saving ? 'opacity-50' : ''}`}
        >
          <option value="">（未設定）</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{optionLabel ? optionLabel(opt) : opt}</option>
          ))}
        </select>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="group cursor-pointer flex items-center gap-1.5 min-h-[24px] -ml-1 pl-1 pr-1 rounded hover:bg-brand-50 transition-colors"
          title="クリックして選択"
        >
          {value ? (
            renderValue ? renderValue(value) : <span className="text-[13px] text-gray-700 font-medium border-b border-dashed border-gray-200 group-hover:border-brand-400">{value}</span>
          ) : (
            <span className="text-gray-400 text-xs border-b border-dashed border-gray-200 group-hover:border-brand-400">クリックして選択</span>
          )}
          <span className="text-gray-400 group-hover:text-brand-500 text-[12px]">▼</span>
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
  const containerRef = useRef<HTMLDivElement>(null)

  const toggle = (opt: string) => {
    setDraft(prev => prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt])
  }

  const commit = async (finalDraft: string[]) => {
    // 変更なしならそのまま閉じる
    const current = value ?? []
    const same = current.length === finalDraft.length && current.every(v => finalDraft.includes(v))
    if (same) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(finalDraft))
    setSaving(false); setEditing(false)
  }

  const handleOpen = () => { setDraft(value ?? []); setEditing(true) }

  // 外クリックで保存して閉じる
  useEffect(() => {
    if (!editing) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commit(draft)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft])

  return (
    <div ref={containerRef} className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">
        {label}
      </div>
      {editing ? (
        <div className="mt-1 p-2 border border-brand-400 rounded bg-brand-50/30">
          <div className="flex flex-wrap gap-1.5">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={saving}
                className={`px-2 py-0.5 rounded text-[13px] font-semibold border transition ${
                  draft.includes(opt)
                    ? 'bg-brand-100 text-brand-700 border-brand-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {draft.includes(opt) && '✓ '}{opt}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-gray-400 mt-1.5">他の場所をクリックで保存</div>
        </div>
      ) : (
        <div onClick={handleOpen} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {value && value.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {value.map(item => (
                <span key={item} className="px-2 py-0.5 rounded text-[13px] font-semibold border bg-brand-50 text-brand-700 border-brand-200">
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px] flex-shrink-0">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineDate ───
export function InlineDate({ label, value, onSave, fullWidth, required, max, wareki }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
  /** 選択可能な上限日（YYYY-MM-DD）。検討期間区分による回答予定日の制約等に使う。 */
  max?: string
  /** 値の下に和暦を表示する（生年月日など役所申請で和暦が要る項目用） */
  wareki?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      // 編集モードに入ったら即カレンダーを開く（対応ブラウザのみ）
      try { inputRef.current.showPicker?.() } catch { /* unsupported */ }
    }
  }, [editing])

  const handleSave = async () => {
    if (draft === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(draft))
    setSaving(false); setEditing(false)
  }

  const missing = required && !value

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          max={max}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onClick={() => { try { inputRef.current?.showPicker?.() } catch { /* unsupported */ } }}
          onFocus={() => { try { inputRef.current?.showPicker?.() } catch { /* unsupported */ } }}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 cursor-pointer ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div
          onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          className={`group cursor-pointer flex items-center gap-1.5 min-h-[24px] -ml-1 pl-1 pr-1 rounded transition-colors ${missing ? 'hover:bg-red-50' : 'hover:bg-brand-50'}`}
          title="クリックして日付を選択"
        >
          <span className={`text-[13px] font-mono border-b border-dashed group-hover:border-brand-400 ${
            value ? 'text-gray-700 font-medium border-gray-200'
                  : missing ? 'text-red-500 text-xs border-red-300'
                            : 'text-gray-400 text-xs border-gray-200'}`}>
            {value ?? (missing ? '⚠ 未設定（必須）' : 'クリックして日付入力')}
          </span>
          <span className="text-gray-400 group-hover:opacity-100 opacity-60 transition-opacity text-[12px]">📅</span>
        </div>
      )}
      {wareki && value && toWareki(value) && (
        <div className="mt-0.5 text-[11px] text-gray-500">和暦：{toWareki(value)}</div>
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
    await withToast(() => onSave(parsed))
    setSaving(false); setEditing(false)
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value?.toString() ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `${value.toLocaleString()}${suffix ?? ''}` : '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px]">✏️</span>
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
    await withToast(() => onSave(parsed))
    setSaving(false); setEditing(false)
  }

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
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
            className={`w-full px-1.5 py-0.5 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 ${saving ? 'opacity-50' : ''}`}
          />
        </div>
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `¥${value.toLocaleString()}` : '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineCheckbox ───
// 楽観的更新: クリック直後にUIを更新、保存失敗時のみロールバック
export function InlineCheckbox({ label, value, onSave }: {
  label: string
  value?: boolean
  onSave: (value: boolean) => Promise<void>
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const shown = optimistic ?? !!value

  // propの値が更新されたら楽観値をクリア
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOptimistic(null) }, [value])

  const handleToggle = async () => {
    const next = !shown
    setOptimistic(next)
    try {
      await onSave(next)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      setOptimistic(!next) // rollback
      showToast('保存に失敗しました', 'error')
    }
  }

  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className="flex items-center gap-2 min-h-[24px]">
        <button
          type="button"
          onClick={handleToggle}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            shown ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-300 hover:border-brand-400'
          }`}
        >
          {shown && <span className="text-[13px]">✓</span>}
        </button>
        <span className={`text-[13px] ${shown ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
          {shown ? 'あり' : 'なし'}
        </span>
      </div>
    </div>
  )
}

// ─── InlineTextarea ───
export function InlineTextarea({ label, value, onSave, fullWidth, placeholder }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      // 既存内容に合わせて高さを自動調整
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [editing])

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(trimmed))
    setSaving(false); setEditing(false)
  }

  // 外クリックで保存
  useEffect(() => {
    if (!editing) return
    const onDocClick = (e: MouseEvent) => {
      if (composingRef.current) return
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSave()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft])

  return (
    <div ref={containerRef} className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'sm:col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            disabled={saving}
            placeholder={placeholder}
            className={`w-full px-1.5 py-1 -ml-1.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 resize-y min-h-[140px] max-h-[60vh] overflow-y-auto leading-relaxed ${saving ? 'opacity-50' : ''}`}
          />
          <div className="text-[12px] text-gray-400 mt-0.5">Escでキャンセル / 他の場所をクリックで保存</div>
        </div>
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="group cursor-pointer flex items-start gap-1.5 min-h-[24px]">
          {value ? (
            <span className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</span>
          ) : placeholder ? (
            <span className="text-[12px] text-gray-300 whitespace-pre-wrap leading-relaxed">{placeholder}</span>
          ) : (
            <span className="text-gray-300 italic text-xs">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px] flex-shrink-0 mt-0.5">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── InlineMemberSelect (担当者選択) ───
export function InlineMemberSelect({ label, roleKey, assigned, allMembers, caseId, onRefresh, multi, searchable, candidateRoles }: {
  label: string
  roleKey: string
  assigned: CaseMemberRow[]
  allMembers: MemberRow[]
  caseId: string
  onRefresh?: () => void
  multi?: boolean
  /** true のとき候補を名前で絞り込む検索ボックスを表示 */
  searchable?: boolean
  /** 指定時、この primary_role の候補のみ表示（例: ['manager','sub_manager']） */
  candidateRoles?: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // 候補: ロール絞り込み＋名前検索
  const candidates = allMembers.filter(m => {
    if (candidateRoles && candidateRoles.length > 0 && !candidateRoles.includes((m.primary_role as string) ?? '')) return false
    const q = query.trim().toLowerCase()
    if (q) return (m.name ?? '').toLowerCase().includes(q)
    return true
  })

  // 外クリックで閉じる
  useEffect(() => {
    if (!editing) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [editing])

  const handleSelect = async (memberId: string) => {
    setSaving(true)
    const supabase = createClient()
    try {
      if (!multi) {
        await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', roleKey)
        if (memberId) {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
        }
      } else {
        const existing = assigned.find(cm => cm.member_id === memberId)
        if (existing) {
          await supabase.from('case_members').delete().eq('id', existing.id)
        } else {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
        }
      }
      onRefresh?.()
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      if (!multi) setEditing(false)
    }
  }

  return (
    <div ref={containerRef} className="py-1.5 border-b border-gray-50">
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <div className="mt-1 p-2 border border-brand-400 rounded bg-brand-50/30">
          {searchable && (
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="名前で検索"
              autoFocus
              className="w-full mb-1.5 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded outline-none focus:border-brand-500"
            />
          )}
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
            {candidates.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-gray-400">該当する候補がありません</div>
            )}
            {candidates.map(member => {
              const isAssigned = assigned.some(cm => cm.member_id === member.id)
              return (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member.id)}
                  disabled={saving}
                  className={`w-full text-left px-2 py-1 text-xs rounded flex items-center gap-2 ${
                    isAssigned ? 'bg-brand-100 text-brand-700' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <UserAvatar
                    name={member.name}
                    role={member.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
                    url={member.avatar_url}
                    size="sm"
                  />
                  <span>{member.name}</span>
                  {isAssigned && <span className="ml-auto text-brand-500">✓</span>}
                </button>
              )
            })}
          </div>
          <div className="text-[12px] text-gray-400 mt-2">他の場所をクリックで閉じる</div>
        </div>
      ) : (
        <div onClick={() => { setQuery(''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          {assigned.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {assigned.map(cm => (
                <div key={cm.member_id} className="flex items-center gap-1.5">
                  <UserAvatar
                    name={cm.members?.name ?? '?'}
                    role={cm.members?.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
                    url={cm.members?.avatar_url}
                    size="md"
                  />
                  {cm.members?.id ? (
                    <Link
                      href={`/profile/${cm.members.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-sm font-medium text-gray-700 hover:text-brand-700 hover:underline"
                    >
                      {cm.members.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-gray-700">
                      {cm.members?.name ?? '未設定'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-300 italic">未設定</span>
          )}
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px]">✏️</span>
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
        {label}
      </label>
      {children}
    </div>
  )
}

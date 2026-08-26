'use client'

import { Pencil, CalendarDays } from 'lucide-react'
import { useState, useRef, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import AddressHint from '@/components/ui/AddressHint'
import { normalizeAddress } from '@/lib/address'
import { notifyManagerAssigned } from '@/lib/managerAssignNotify'
import UserAvatar from '@/components/ui/UserAvatar'
import HintTip from '@/components/ui/HintTip'
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

export function Section({ title, icon: _icon, children, actionLabel, onAction, collapsible = false, defaultOpen = true, hint, titleRight }: {
  title: string
  icon?: string  // deprecated: 旧API互換のため受け取るだけ。表示はしない
  children: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  collapsible?: boolean  // true でアコーディオン（タイトルクリックで開閉）
  defaultOpen?: boolean
  hint?: string        // 見出し横の「?」ホバーで表示する補足（常時表示のヘルプ文を畳む）
  titleRight?: React.ReactNode  // タイトル直後に置く小要素（必須バッジ等）
}) {
  const nested = useContext(NestedSectionContext)
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = collapsible ? open : true

  // nested=false（通常）: 白背景・四角・枠線なし＋濃い青帯見出しのカード型。
  // nested=true（オーダーシート内）: 枠なし・灰の細見出し＋インデントで、親の中の一部だと分かる小見出しに。
  const sectionCls = nested ? '' : 'bg-white'
  const headerCls = nested
    ? 'flex items-center gap-2 mb-2'
    : 'flex items-center gap-2 px-4 py-2.5 bg-brand-600'
  const titleCls = nested ? 'text-[12.5px] font-semibold text-gray-600 tracking-[0.02em]' : 'text-[13px] font-bold text-white tracking-[0.02em]'
  const chevronCls = nested ? 'text-brand-400 group-hover:text-brand-600' : 'text-white/70 group-hover:text-white'
  const toggleTextCls = nested ? 'text-brand-400 group-hover:text-brand-600' : 'text-white/70 group-hover:text-white'
  const actionCls = nested ? 'text-brand-600 hover:text-brand-700' : 'text-white/90 hover:text-white'
  const contentCls = nested ? 'pl-[11px]' : 'px-4 py-3.5'

  return (
    <section className={sectionCls}>
      <div className={headerCls}>
        {nested && <span className="inline-block w-[3px] h-3.5 bg-brand-500 rounded-[1px] flex-shrink-0" />}
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 text-left group"
          >
            <h3 className={titleCls}>{title}</h3>
            <svg
              className={`w-4 h-4 transition-transform ${chevronCls} ${isOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`text-[11px] ${toggleTextCls}`}>{isOpen ? '閉じる' : '開く'}</span>
          </button>
        ) : (
          <h3 className={titleCls}>{title}</h3>
        )}
        {titleRight}
        {hint && <HintTip text={hint} />}
        {actionLabel && onAction && (
          <button onClick={onAction} className={`ml-auto text-[12.5px] font-semibold ${actionCls}`}>＋ {actionLabel}</button>
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
export function SectionHeading({ title, right, hint, className = '' }: { title: string; right?: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="inline-block w-[3px] h-3.5 bg-brand-600 rounded-[1px]" />
      <h3 className="text-[12.5px] font-semibold text-brand-800 tracking-[0.02em]">{title}</h3>
      {hint && <HintTip text={hint} />}
      {right && <div className="ml-auto flex items-center">{right}</div>}
    </div>
  )
}

// ─── FieldGrid ───
// 2項目/行を基本にした、テーブル風の見た目で統一（白セル＋薄いグリッド線）。
// 各タブで共通利用するため、ここを変えると全タブのフィールド表示が揃う。
export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  // 1項目=1行はスマホのみ。PC(sm以上)は2列で見やすく。
  // cols={1} を明示したときだけ常に1列。
  const oneCol = cols === 1
  // 区切りは「セルの下線」で引く（以前の gap-px＋灰背景方式だと、奇数個のとき
  // 空きマスに容器の灰色がベタで見えて「死にスペース」になっていた。空きは白のまま残す）。
  return (
    <div
      className={`grid ${oneCol ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} bg-white [&>*]:bg-white [&>*]:border-b [&>*]:border-slate-300`}
    >
      {children}
    </div>
  )
}

// ─── FieldRow ───
// 1項目ぶんの器。項目名を左のマス、内容を右のマスに置いて、表のように読ませる。
//
// 項目名の下に内容を積む形だと、どこまでが1項目か分からず、内容の幅もばらばらだった。
// 左右に割ると項目名の右端がそろうので、項目が多い画面（オーダーシート等）でも目で追える。
//
// グリッドの列送りには一切手を出さない（1項目=1マスのまま）。
// 左右の余白は FieldGrid ではなくこの行が持つ。左のマスをマスの端まで届かせるため。
export function FieldRow({ label, children, fullWidth, labelNote, containerRef, bare, hint }: {
  label?: React.ReactNode
  children: React.ReactNode
  fullWidth?: boolean
  /** 項目名の下に置く小さな注記（「2名まで」など） */
  labelNote?: React.ReactNode
  containerRef?: React.Ref<HTMLDivElement>
  /** 見出しと内容が重複する欄。項目名のマスを作らず、内容だけを横いっぱいに置く */
  bare?: boolean
  /** 項目名の横に置く「?」ヘルプ。常時表示のヒント文はここに畳む（場所を取らない） */
  hint?: string
}) {
  const span = fullWidth ? 'sm:col-span-2' : ''
  if (bare) {
    return <div ref={containerRef} className={`px-3 py-2 ${span}`}>{children}</div>
  }
  return (
    <div ref={containerRef} className={`flex items-stretch ${span}`}>
      <div className="w-[6.5rem] sm:w-[8.5rem] flex-shrink-0 bg-slate-100 border-r border-slate-300 px-3 py-2 flex flex-col justify-center text-[12.5px] font-semibold text-gray-600 tracking-wide leading-snug">
        <span className="break-words">{label}{hint && <HintTip text={hint} className="ml-1" />}</span>
        {labelNote}
      </div>
      <div className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-1 min-h-[42px]">
        {children}
      </div>
    </div>
  )
}

// ─── Field (read-only) ───
export function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <FieldRow label={label}>
      <div className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
        {value ?? '未設定'}
      </div>
    </FieldRow>
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
export function InlineEdit({ label, value, onSave, mono, fullWidth, required, action, hint, ai, address }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  fullWidth?: boolean
  required?: boolean
  // ラベル横に置く補助ボタン（例: 「依頼者と同じ」自動入力）。
  // 関数を渡すと「現在の入力値」を受け取れる（例: 郵便番号→住所取得ボタンが入力中の値で有効化される）。
  action?: React.ReactNode | ((current: string) => React.ReactNode)
  hint?: string             // 値の下に出す補助説明（例: 郵便番号で住所自動入力）
  ai?: boolean              // AIが自動入力した値は青文字で表示（人が手直しすると消す運用）
  /** 住所・本籍の欄。数字と英字を半角に揃えて保存し、都道府県から始まっていなければ注意文を出す */
  address?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  // action に「現在の値」を渡す（編集中は draft、非編集時は保存値）。ボタン側が入力中の値で判定できる。
  const renderAction = (current: string) => (typeof action === 'function' ? action(current) : action)
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // オーダーシート内（NestedSectionContext=true）は「常時表示の入力欄」にする
  const alwaysEdit = useContext(NestedSectionContext)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (alwaysEdit) setDraft(value ?? '') }, [value, alwaysEdit])

  const handleStartEdit = () => { setDraft(value ?? ''); setEditing(true) }

  const handleSave = async () => {
    // 住所欄は保存時に半角へ揃える（全角数字だと書類のレイアウトが崩れ、検索も一致しないため）
    const trimmed = address ? normalizeAddress(draft) : draft.trim()
    if (trimmed !== draft) setDraft(trimmed)
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

  if (alwaysEdit) {
    return (
      <FieldRow label={label} fullWidth={fullWidth} hint={hint}>
        {/* ボタン（住所を取得・フリガナ取得等）は入力欄の「中」に内蔵する。
            外に並べると行ごとに入力欄の幅がバラつくため、容器が面とフォーカスリングを持ち、
            input は素通し（.input-naked）にして全行の見た目幅をそろえる。 */}
        <div className="flex items-center flex-1 min-w-0 h-9 rounded-md bg-[#f3f5f8] focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-400 transition-colors">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            onBlur={() => { if (!composingRef.current) { const t = draft.trim(); if (t !== (value ?? '')) withToast(() => onSave(t)) } }}
            placeholder="入力"
            className={`input-naked flex-1 min-w-0 h-full px-2.5 text-[13px] rounded-md outline-none ${mono ? 'font-mono' : ''} ${ai ? 'text-blue-600' : ''}`}
          />
          {action != null && <div className="flex-none pr-1">{renderAction(draft)}</div>}
        </div>
        {address && <AddressHint value={draft} />}
      </FieldRow>
    )
  }

  return (
    <FieldRow label={<>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</>} fullWidth={fullWidth} hint={hint}>
      <div className="flex items-center gap-2">
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
            className={`flex-1 min-w-0 px-2 py-1 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 ${mono ? 'font-mono' : ''} ${saving ? 'opacity-50' : ''}`}
          />
        ) : (
          <div
            onClick={handleStartEdit}
            className="group cursor-pointer flex flex-1 min-w-0 items-center gap-1.5 min-h-[24px] px-1 -mx-1 rounded hover:bg-brand-50 transition-colors"
            title="クリックして編集"
          >
            <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? `${ai ? 'text-blue-600' : 'text-gray-700'} font-medium border-b border-dashed border-gray-200 group-hover:border-brand-400` : 'text-gray-300 italic text-xs border-b border-dashed border-gray-200 group-hover:border-brand-400'}`}>
              {value ?? 'クリックして入力'}
            </span>
            <Pencil className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity " strokeWidth={2} />
          </div>
        )}
        {renderAction(editing ? draft : (value ?? ''))}
      </div>
    </FieldRow>
  )
}

// ─── InlineSelect (picklist) ───
export function InlineSelect({ label, value, options, onSave, fullWidth, required, renderValue, optionLabel, width }: {
  label: string
  value?: string | null
  options: string[]
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
  renderValue?: (v: string) => React.ReactNode
  optionLabel?: (v: string) => string
  /** 常時入力(オーダーシート)時の入力欄幅。短い選択肢を全幅にしないため。compact=あり/なし等・md=短い区分 */
  width?: 'compact' | 'md'
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const alwaysEdit = useContext(NestedSectionContext)

  const handleChange = async (newVal: string) => {
    if (newVal === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(newVal))
    setSaving(false); setEditing(false)
  }

  if (alwaysEdit) {
    const selCls = width === 'compact' ? 'w-[110px]' : width === 'md' ? 'w-full sm:w-[240px]' : 'w-full'
    return (
      <FieldRow label={label} fullWidth={fullWidth}>
        <select value={value ?? ''} onChange={e => handleChange(e.target.value)} disabled={saving} className={`${selCls} h-9 px-2.5 text-[13px] bg-white border border-gray-200 rounded-md outline-none focus:border-brand-400`}>
          <option value="">（未設定）</option>
          {options.map(opt => <option key={opt} value={opt}>{optionLabel ? optionLabel(opt) : opt}</option>)}
        </select>
      </FieldRow>
    )
  }

  return (
    <FieldRow label={<>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</>} fullWidth={fullWidth}>
      {editing ? (
        <select
          value={value ?? ''}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          disabled={saving}
          className={`w-full px-2 py-1 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 ${saving ? 'opacity-50' : ''}`}
        >
          <option value="">（未設定）</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{optionLabel ? optionLabel(opt) : opt}</option>
          ))}
        </select>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="group cursor-pointer flex items-center gap-1.5 min-h-[24px] px-1 -mx-1 rounded hover:bg-brand-50 transition-colors"
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
    </FieldRow>
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
    <FieldRow
      containerRef={containerRef}
      label={<>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</>}
      fullWidth={fullWidth}
    >
      {editing ? (
        <div className="p-2 border border-brand-400 rounded bg-brand-50/30">
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
          <Pencil className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" strokeWidth={2} />
        </div>
      )}
    </FieldRow>
  )
}

// ─── InlineDate ───
export function InlineDate({ label, value, onSave, fullWidth, required, max, wareki, hint, ai }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  required?: boolean
  /** 選択可能な上限日（YYYY-MM-DD）。検討期間区分による回答予定日の制約等に使う。 */
  max?: string
  /** 値の下に和暦を表示する（生年月日など役所申請で和暦が要る項目用） */
  wareki?: boolean
  /** 値の下に出す補助説明（目安の期間など） */
  hint?: string
  ai?: boolean              // AIが自動入力した値は青文字で表示（InlineEditと同じ運用）
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

  const alwaysEdit = useContext(NestedSectionContext)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (alwaysEdit) setDraft(value ?? '') }, [value, alwaysEdit])

  const handleSave = async () => {
    if (draft === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(draft))
    setSaving(false); setEditing(false)
  }

  const missing = required && !value

  if (alwaysEdit) {
    return (
      <FieldRow label={<>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</>} fullWidth={fullWidth} hint={hint}>
        <input type="date" max={max} value={draft} onChange={e => { setDraft(e.target.value); if (e.target.value !== (value ?? '')) withToast(() => onSave(e.target.value)) }} className={`w-full sm:w-[170px] h-9 px-2.5 text-[13px] bg-white border border-gray-200 rounded-md outline-none focus:border-brand-400 ${ai ? 'text-blue-600' : ''}`} />
        {wareki && value && toWareki(value) && <div className="text-[11px] text-gray-500">和暦：{toWareki(value)}</div>}
      </FieldRow>
    )
  }

  return (
    <FieldRow label={<>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</>} fullWidth={fullWidth} hint={hint}>
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
          className={`w-full sm:w-[170px] px-2 py-1 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 cursor-pointer ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div
          onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          className={`group cursor-pointer flex items-center gap-1.5 min-h-[24px] px-1 -mx-1 rounded transition-colors ${missing ? 'hover:bg-red-50' : 'hover:bg-brand-50'}`}
          title="クリックして日付を選択"
        >
          <span className={`text-[13px] font-mono border-b border-dashed group-hover:border-brand-400 ${
            value ? `${ai ? 'text-blue-600' : 'text-gray-700'} font-medium border-gray-200`
                  : missing ? 'text-red-500 text-xs border-red-300'
                            : 'text-gray-400 text-xs border-gray-200'}`}>
            {value ?? (missing ? '⚠ 未設定（必須）' : 'クリックして日付入力')}
          </span>
          <CalendarDays className="w-3.5 h-3.5 text-gray-400 group-hover:opacity-100 opacity-60 transition-opacity " strokeWidth={2} />
        </div>
      )}
      {wareki && value && toWareki(value) && (
        <div className="text-[11px] text-gray-500">和暦：{toWareki(value)}</div>
      )}
    </FieldRow>
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
    <FieldRow label={label} fullWidth={fullWidth}>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value?.toString() ?? ''); setEditing(false) } }}
          disabled={saving}
          className={`w-full sm:w-[160px] px-2 py-1 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `${value.toLocaleString()}${suffix ?? ''}` : '未設定'}
          </span>
          <Pencil className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity " strokeWidth={2} />
        </div>
      )}
    </FieldRow>
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

  const alwaysEdit = useContext(NestedSectionContext)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (alwaysEdit) setDraft(value?.toString() ?? '') }, [value, alwaysEdit])

  const handleSave = async () => {
    const parsed = draft.trim() === '' ? null : Number(draft.replace(/,/g, ''))
    if (parsed === value) { setEditing(false); return }
    setSaving(true)
    await withToast(() => onSave(parsed))
    setSaving(false); setEditing(false)
  }

  if (alwaysEdit) {
    return (
      <FieldRow label={label} fullWidth={fullWidth}>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-gray-500">¥</span>
          <input type="text" inputMode="numeric" value={draft} onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => { const parsed = draft.trim() === '' ? null : Number(draft.replace(/,/g, '')); if (parsed !== value) withToast(() => onSave(parsed)) }} className="w-full sm:w-[170px] h-9 px-2.5 text-[13px] font-mono bg-white border border-gray-200 rounded-md outline-none focus:border-brand-400" />
        </div>
      </FieldRow>
    )
  }

  return (
    <FieldRow label={label} fullWidth={fullWidth}>
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
            className={`w-full sm:w-[170px] px-2 py-1 text-[13px] font-mono border border-brand-400 rounded outline-none bg-brand-50/30 ${saving ? 'opacity-50' : ''}`}
          />
        </div>
      ) : (
        <div onClick={() => { setDraft(value?.toString() ?? ''); setEditing(true) }} className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]">
          <span className={`text-[13px] font-mono ${value != null ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value != null ? `¥${value.toLocaleString()}` : '未設定'}
          </span>
          <Pencil className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity " strokeWidth={2} />
        </div>
      )}
    </FieldRow>
  )
}

// ─── InlineCheckbox ───
// 楽観的更新: クリック直後にUIを更新、保存失敗時のみロールバック
export function InlineCheckbox({ label, value, onSave, fullWidth }: {
  label: string
  value?: boolean
  onSave: (value: boolean) => Promise<void>
  fullWidth?: boolean
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
    <FieldRow label={label} fullWidth={fullWidth}>
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
    </FieldRow>
  )
}

// ─── InlineTextarea ───
export function InlineTextarea({ label, value, onSave, fullWidth, placeholder, hideLabel = false }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  fullWidth?: boolean
  placeholder?: string
  hideLabel?: boolean   // 見出しと重複する場合にラベルを非表示（入力欄だけ表示）
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

  const alwaysEdit = useContext(NestedSectionContext)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (alwaysEdit) setDraft(value ?? '') }, [value, alwaysEdit])

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

  if (alwaysEdit) {
    return (
      <FieldRow label={label} fullWidth={fullWidth} bare={hideLabel}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onBlur={() => { if (!composingRef.current) { const t = draft.trim(); if (t !== (value ?? '')) withToast(() => onSave(t)) } }}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 text-[13px] bg-white border border-gray-200 rounded-lg outline-none focus:border-brand-400 resize-y min-h-[96px] leading-relaxed"
        />
      </FieldRow>
    )
  }

  return (
    <FieldRow containerRef={containerRef} label={label} fullWidth={fullWidth} bare={hideLabel}>
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
            className={`w-full px-2 py-1 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 resize-y min-h-[140px] max-h-[60vh] overflow-y-auto leading-relaxed ${saving ? 'opacity-50' : ''}`}
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
          <Pencil className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" strokeWidth={2} />
        </div>
      )}
    </FieldRow>
  )
}

// ─── InlineMemberSelect (担当者選択) ───
export function InlineMemberSelect({ label, roleKey, assigned, allMembers, caseId, onRefresh, multi, searchable, candidateRoles, maxSelect }: {
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
  /** multi のときの上限人数（管理担当は2名まで。引継ぎ・サブ担当のため） */
  maxSelect?: number
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
    // 書き込みの失敗を握りつぶさない。以前はエラーを見ずに「保存しました」と出していたため、
    // 実際には保存できていないのに成功したように見えていた。
    const check = (label: string, error: { message: string } | null) => {
      if (error) throw new Error(`${label}: ${error.message}`)
    }
    try {
      let assignedManagerId: string | null = null
      if (!multi) {
        const { error: delErr } = await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', roleKey)
        check('既存の担当を外せませんでした', delErr)
        if (memberId) {
          const { error } = await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
          check('担当を登録できませんでした', error)
          assignedManagerId = memberId
        }
      } else {
        const existing = assigned.find(cm => cm.member_id === memberId)
        if (existing) {
          const { error } = await supabase.from('case_members').delete().eq('id', existing.id)
          check('担当を外せませんでした', error)
        } else if (maxSelect && assigned.length >= maxSelect) {
          showToast(`${label}は${maxSelect}名までです。入れ替えるときは先に外してください`, 'error')
        } else {
          const { error } = await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: roleKey })
          check('担当を登録できませんでした', error)
          assignedManagerId = memberId
        }
      }
      // 管理担当が付いたら受注担当へ「割振り完了」を知らせる。
      // 通知が失敗しても担当の登録は済んでいるので、ここでは止めない（前は道連れで失敗扱いになっていた）。
      if (roleKey === 'manager' && assignedManagerId) {
        try { await notifyManagerAssigned(caseId, assignedManagerId) } catch (e) { console.error('[割振り完了の通知に失敗]', e) }
      }
      onRefresh?.()
      showToast('保存しました', 'success')
    } catch (e) {
      console.error('[担当者の保存に失敗]', e)
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      if (!multi) setEditing(false)
    }
  }

  return (
    <FieldRow
      containerRef={containerRef}
      label={label}
      labelNote={multi && maxSelect ? <span className="font-normal text-[11px] text-gray-400">{maxSelect}名まで（{assigned.length}/{maxSelect}）</span> : undefined}
    >
      {editing ? (
        <div className="p-2 border border-brand-400 rounded bg-brand-50/30">
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
          {/* 複数選べる欄は選んでも一覧が開いたままで、名前の入った表示に切り替わらない。
              保存できたのか分からないので、閉じるボタンを出して結果を見せる。 */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[12px] text-gray-400">他の場所をクリックでも閉じます</span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ml-auto px-2.5 py-1 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"
            >
              閉じる
            </button>
          </div>
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
          <Pencil className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity " strokeWidth={2} />
        </div>
      )}
    </FieldRow>
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

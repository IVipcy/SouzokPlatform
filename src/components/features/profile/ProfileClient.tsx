'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Phone, MapPin, Utensils, Heart, Sparkles, MessageCircleHeart, Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import UserAvatar from '@/components/ui/UserAvatar'
import { tenureLabel } from '@/lib/dashboardMetrics'
import type { MemberRow } from '@/types'

const ROLE_LABEL: Record<string, string> = {
  sales: '受注担当',
  manager: '管理担当',
  assistant: '事務管理',
  lp: 'LP担当',
  accounting: '経理担当',
  system_manager: 'システム管理者',
}

type Props = {
  member: MemberRow
  teamName: string | null
  isOwner: boolean
}

export default function ProfileClient({ member, teamName, isOwner }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const supabase = createClient()

  const refresh = () => startTransition(() => router.refresh())

  const updateField = async (field: keyof MemberRow, value: unknown) => {
    const { error } = await supabase
      .from('members')
      .update({ [field]: value })
      .eq('id', member.id)
    if (error) throw error
    refresh()
  }

  const today = new Date()
  const tenure = member.joined_at ? tenureLabel(member.joined_at, today) : null
  const role = member.primary_role ? ROLE_LABEL[member.primary_role] ?? member.primary_role : null

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <p className="text-xs font-medium text-brand-600 tracking-wider uppercase mb-3">Profile</p>
      {/* ヘッダー */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 mb-5">
        <div className="flex items-start gap-5">
          <AvatarBlock
            member={member}
            isOwner={isOwner}
            onUploaded={(url) => updateField('avatar_url', url).catch(e => { console.error(e); showToast('保存に失敗しました', 'error') })}
          />
          <div className="flex-1 min-w-0 pt-1">
            {isOwner ? (
              <NameEdit value={member.name} onSave={(v) => updateField('name', v)} />
            ) : (
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{member.name}</h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-gray-600">
              {role && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-[12px] font-semibold">
                  {role}
                </span>
              )}
              {teamName && (
                <span className="text-gray-700 font-medium">{teamName}</span>
              )}
              {member.job_type && (
                <>
                  <span className="text-gray-300">・</span>
                  <span>{member.job_type}</span>
                </>
              )}
              {tenure && (
                <>
                  <span className="text-gray-300">・</span>
                  <span className="text-gray-500">入社 {tenure}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 自己紹介 */}
      <Section icon={<MessageCircleHeart className="w-4 h-4 text-brand-600" />} title="自己紹介">
        {isOwner ? (
          <BioEdit value={member.bio} onSave={(v) => updateField('bio', v)} />
        ) : (
          <ReadOnlyText value={member.bio} placeholder="まだ自己紹介はありません" multiline />
        )}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* コンタクト */}
        <Section icon={<Mail className="w-4 h-4 text-brand-600" />} title="コンタクト">
          <FieldRow icon={<Mail className="w-3.5 h-3.5 text-gray-400" />} label="メール">
            <span className="text-[13px] text-gray-700 font-mono">{member.email ?? '—'}</span>
          </FieldRow>
          <FieldRow icon={<Phone className="w-3.5 h-3.5 text-gray-400" />} label="電話">
            {isOwner ? (
              <TextEdit value={member.phone} onSave={(v) => updateField('phone', v)} placeholder="090-1234-5678" mono />
            ) : (
              <ReadOnlyText value={member.phone} placeholder="—" mono />
            )}
          </FieldRow>
        </Section>

        {/* プロフィール */}
        <Section icon={<Sparkles className="w-4 h-4 text-brand-600" />} title="プロフィール">
          <FieldRow icon={<MapPin className="w-3.5 h-3.5 text-gray-400" />} label="出身地">
            {isOwner ? (
              <TextEdit value={member.hometown} onSave={(v) => updateField('hometown', v)} placeholder="東京都" />
            ) : (
              <ReadOnlyText value={member.hometown} placeholder="—" />
            )}
          </FieldRow>
          <FieldRow icon={<Utensils className="w-3.5 h-3.5 text-gray-400" />} label="好きな食べ物">
            {isOwner ? (
              <TextEdit value={member.favorite_food} onSave={(v) => updateField('favorite_food', v)} placeholder="ラーメン" />
            ) : (
              <ReadOnlyText value={member.favorite_food} placeholder="—" />
            )}
          </FieldRow>
        </Section>

        {/* 趣味 */}
        <Section icon={<Heart className="w-4 h-4 text-brand-600" />} title="趣味">
          <TagsField
            tags={member.hobbies ?? []}
            editable={isOwner}
            placeholder="趣味を追加…"
            onSave={(v) => updateField('hobbies', v)}
          />
        </Section>

        {/* 特技 */}
        <Section icon={<Sparkles className="w-4 h-4 text-brand-600" />} title="特技">
          <TagsField
            tags={member.specialties ?? []}
            editable={isOwner}
            placeholder="特技を追加…"
            onSave={(v) => updateField('specialties', v)}
          />
        </Section>
      </div>

      {/* もらったサンクス（Phase B プレースホルダー） */}
      <div className="mt-5 bg-gradient-to-br from-amber-50/60 to-white border border-amber-100 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Heart className="w-4 h-4 text-amber-500" />
          <h3 className="text-[14px] font-semibold text-gray-900">もらったサンクス</h3>
          <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Phase B で実装予定</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-amber-600 font-mono">--</span>
          <span className="text-sm text-gray-500">件（今月）</span>
        </div>
      </div>
    </div>
  )
}

// ───────── Section ─────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        {icon}
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function FieldRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-gray-50 last:border-b-0">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function ReadOnlyText({ value, placeholder, mono, multiline }: { value?: string | null; placeholder: string; mono?: boolean; multiline?: boolean }) {
  if (!value) return <span className="text-gray-300 italic text-xs">{placeholder}</span>
  return (
    <span className={`text-[13px] text-gray-700 ${mono ? 'font-mono' : ''} ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>
      {value}
    </span>
  )
}

// ───────── Avatar block ─────────
function AvatarBlock({ member, isOwner, onUploaded }: { member: MemberRow; isOwner: boolean; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const handleClick = () => {
    if (!isOwner || uploading) return
    fileRef.current?.click()
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${member.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      onUploaded(data.publicUrl)
      showToast('プロフィール画像を更新しました', 'success')
    } catch (err) {
      console.error(err)
      showToast('画像のアップロードに失敗しました', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div
      className={`relative group ${isOwner ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
      title={isOwner ? 'クリックして画像を変更' : undefined}
    >
      <UserAvatar
        name={member.name}
        role={member.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
        url={member.avatar_url}
        size="xl"
      />
      {isOwner && (
        <>
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
        </>
      )}
    </div>
  )
}

// ───────── Inline name edit (large) ─────────
function NameEdit({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) { setEditing(false); setDraft(value); return }
    setSaving(true)
    try {
      await onSave(trimmed)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onBlur={() => { if (!composingRef.current) handleSave() }}
        onKeyDown={e => {
          if (composingRef.current) return
          if (e.key === 'Enter') { e.preventDefault(); handleSave() }
          else if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        disabled={saving}
        className="text-2xl font-bold text-gray-900 tracking-tight px-2 py-0.5 -ml-2 border border-brand-400 rounded outline-none bg-brand-50/30"
      />
    )
  }
  return (
    <h1
      onClick={() => { setDraft(value); setEditing(true) }}
      className="text-2xl font-bold text-gray-900 tracking-tight cursor-pointer hover:bg-brand-50 -ml-2 pl-2 pr-2 py-0.5 rounded inline-block"
      title="クリックして編集"
    >
      {value}
    </h1>
  )
}

// ───────── Inline text (single line) ─────────
function TextEdit({ value, onSave, placeholder, mono }: { value?: string | null; onSave: (v: string) => Promise<void>; placeholder?: string; mono?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(trimmed)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onBlur={() => { if (!composingRef.current) handleSave() }}
        onKeyDown={e => {
          if (composingRef.current) return
          if (e.key === 'Enter') { e.preventDefault(); handleSave() }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        disabled={saving}
        className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 ${mono ? 'font-mono' : ''}`}
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className="group cursor-pointer inline-flex items-center gap-1 -ml-1 pl-1 pr-1 rounded hover:bg-brand-50 transition-colors"
      title="クリックして編集"
    >
      <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700' : 'text-gray-300 italic text-xs'} border-b border-dashed border-gray-200 group-hover:border-brand-400`}>
        {value ?? 'クリックして入力'}
      </span>
    </span>
  )
}

// ───────── Inline textarea (bio) ─────────
function BioEdit({ value, onSave }: { value?: string | null; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(trimmed)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div>
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onBlur={() => { if (!composingRef.current) handleSave() }}
          onKeyDown={e => {
            if (composingRef.current) return
            if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
          }}
          disabled={saving}
          rows={4}
          placeholder="自己紹介・チームへの一言など"
          className="w-full px-2 py-1.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 resize-y"
        />
        <div className="text-[12px] text-gray-400 mt-0.5">Esc でキャンセル / 他の場所をクリックで保存</div>
      </div>
    )
  }

  return (
    <div
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className="cursor-pointer rounded hover:bg-brand-50/50 -mx-1 px-1 py-1 min-h-[2.5rem]"
      title="クリックして編集"
    >
      {value ? (
        <span className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</span>
      ) : (
        <span className="text-gray-300 italic text-xs">クリックして自己紹介を入力</span>
      )}
    </div>
  )
}

// ───────── Tags field ─────────
function TagsField({ tags, editable, placeholder, onSave }: { tags: string[]; editable: boolean; placeholder: string; onSave: (v: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)

  const commit = async (next: string[]) => {
    setSaving(true)
    try {
      await onSave(next)
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    const v = draft.trim()
    if (!v) return
    if (tags.includes(v)) { setDraft(''); return }
    commit([...tags, v])
    setDraft('')
  }

  const handleRemove = (t: string) => {
    commit(tags.filter(x => x !== t))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.length === 0 && !editable && (
        <span className="text-gray-300 italic text-xs">未設定</span>
      )}
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">
          {t}
          {editable && (
            <button
              type="button"
              onClick={() => handleRemove(t)}
              disabled={saving}
              className="text-brand-500 hover:text-brand-700 leading-none text-[14px]"
              aria-label={`${t} を削除`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {editable && (
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={e => {
            if (composingRef.current) return
            if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
            else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              handleRemove(tags[tags.length - 1])
            }
          }}
          disabled={saving}
          placeholder={placeholder}
          className="text-[13px] px-2 py-0.5 border border-dashed border-gray-300 rounded-full outline-none focus:border-brand-400 focus:bg-brand-50/30 min-w-[8rem]"
        />
      )}
    </div>
  )
}

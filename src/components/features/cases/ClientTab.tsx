'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow, HeirRow } from '@/types'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
import HeirValidationBanner from './HeirValidationBanner'

type Props = {
  caseData: CaseRow
  heirs: HeirRow[]
  onRefresh: () => void
}

export default function ClientTab({ caseData, heirs, onRefresh }: Props) {
  const client = caseData.clients
  const [showAddHeir, setShowAddHeir] = useState(false)
  const [heirForm, setHeirForm] = useState({ name: '', furigana: '', relationship_type: '子' as '配偶者'|'子'|'父'|'母'|'兄弟姉妹'|'その他', relationship: '', address: '', registered_address: '', phone: '', email: '', is_legal_heir: true, is_applicant: false, birth_date: '' })

  const handleAddHeir = async () => {
    if (!heirForm.name.trim()) return
    const supabase = createClient()
    // 申出人は1案件1名のみ
    if (heirForm.is_applicant) {
      await supabase.from('heirs').update({ is_applicant: false }).eq('case_id', caseData.id)
    }
    await supabase.from('heirs').insert({
      case_id: caseData.id,
      ...heirForm,
      birth_date: heirForm.birth_date || null,
      sort_order: heirs.length,
    })
    setHeirForm({ name: '', furigana: '', relationship_type: '子', relationship: '', address: '', registered_address: '', phone: '', email: '', is_legal_heir: true, is_applicant: false, birth_date: '' })
    setShowAddHeir(false)
    onRefresh()
  }

  const handleDeleteHeir = async (heirId: string) => {
    const supabase = createClient()
    await supabase.from('heirs').delete().eq('id', heirId)
    onRefresh()
  }

  const saveClientField = async (field: string, value: string) => {
    if (!caseData.client_id) return
    const supabase = createClient()
    await supabase.from('clients').update({ [field]: value || null }).eq('id', caseData.client_id)
    onRefresh()
  }

  const saveCaseField = async (field: string, value: string) => {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value || null }).eq('id', caseData.id)
    onRefresh()
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-3.5">
          {/* Client info */}
          <Section title="依頼者情報" icon="👤">
            <FieldGrid>
              <InlineEdit label="氏名" value={client?.name} onSave={v => saveClientField('name', v)} />
              <InlineEdit label="ふりがな" value={client?.furigana} onSave={v => saveClientField('furigana', v)} />
              <InlineEdit label="郵便番号" value={client?.postal_code} onSave={v => saveClientField('postal_code', v)} mono displayPrefix="〒" />
              <InlineEdit label="続柄" value={client?.relationship_to_deceased} onSave={v => saveClientField('relationship_to_deceased', v)} />
              <InlineEdit label="住所" value={client?.address} onSave={v => saveClientField('address', v)} fullWidth />
              <InlineEdit label="TEL" value={client?.phone} onSave={v => saveClientField('phone', v)} mono />
              <InlineEdit label="メール" value={client?.email} onSave={v => saveClientField('email', v)} mono />
            </FieldGrid>
          </Section>

          {/* Deceased info */}
          <Section title="被相続人情報" icon="⚰️">
            <FieldGrid>
              <InlineEdit label="氏名" value={caseData.deceased_name} onSave={v => saveCaseField('deceased_name', v)} />
              <InlineEdit label="ふりがな" value={caseData.deceased_furigana} onSave={v => saveCaseField('deceased_furigana', v)} />
              <InlineEdit label="生年月日" value={caseData.deceased_birth_date} onSave={v => saveCaseField('deceased_birth_date', v)} mono />
              <InlineEdit label="相続開始日" value={caseData.date_of_death} onSave={v => saveCaseField('date_of_death', v)} mono />
              <InlineEdit label="住所" value={caseData.deceased_address} onSave={v => saveCaseField('deceased_address', v)} fullWidth />
              <InlineEdit label="本籍" value={caseData.deceased_registered_address} onSave={v => saveCaseField('deceased_registered_address', v)} fullWidth />
            </FieldGrid>
          </Section>
        </div>
        <div />
      </div>

      {/* Heir table */}
      <div className="mt-3.5">
        <HeirValidationBanner heirs={heirs} />
        <Section title={`相続人一覧（${heirs.length}名）`} icon="👨‍👩‍👧‍👦" actionLabel="＋ 追加" onAction={() => setShowAddHeir(true)}>
          {heirs.length === 0 && !showAddHeir ? (
            <div className="text-sm text-gray-400 text-center py-6">
              相続人を追加してください
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 -mb-3">
              <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    {['氏名', '続柄', '住所', '本籍', 'TEL', 'メール', '法定相続人', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-gray-500 tracking-wider uppercase bg-gray-50 border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heirs.map(heir => (
                    <tr key={heir.id} className="border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF]">
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-semibold text-gray-900">{heir.name}</div>
                        {heir.furigana && <div className="text-[10px] text-gray-400">{heir.furigana}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {heir.relationship_type && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border bg-blue-50 text-blue-600 border-blue-200">{heir.relationship_type}</span>
                          )}
                          {heir.relationship && heir.relationship !== heir.relationship_type && (
                            <span className="text-[10px] text-gray-500">{heir.relationship}</span>
                          )}
                          {heir.is_applicant && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">申出人</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-600">{heir.address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-600">{heir.registered_address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-gray-600">{heir.phone ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-gray-600">{heir.email ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {heir.is_legal_heir && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-600 border border-green-200">✓</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleDeleteHeir(heir.id)}
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-300 hover:bg-red-50 hover:text-red-500 transition"
                          title="削除"
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add heir form */}
          {showAddHeir && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="氏名 *" value={heirForm.name} onChange={v => setHeirForm(f => ({ ...f, name: v }))} />
                <FormField label="ふりがな" value={heirForm.furigana} onChange={v => setHeirForm(f => ({ ...f, furigana: v }))} />
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1">続柄区分 *</label>
                  <select
                    value={heirForm.relationship_type}
                    onChange={e => setHeirForm(f => ({ ...f, relationship_type: e.target.value as typeof f.relationship_type }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="配偶者">配偶者</option>
                    <option value="子">子</option>
                    <option value="父">父</option>
                    <option value="母">母</option>
                    <option value="兄弟姉妹">兄弟姉妹</option>
                    <option value="その他">その他（代襲等）</option>
                  </select>
                </div>
                <FormField label="続柄（表示用）" value={heirForm.relationship} onChange={v => setHeirForm(f => ({ ...f, relationship: v }))} placeholder="長男, 長女, 養子 等" />
                <FormField label="生年月日" value={heirForm.birth_date} onChange={v => setHeirForm(f => ({ ...f, birth_date: v }))} placeholder="YYYY-MM-DD" />
                <FormField label="TEL" value={heirForm.phone} onChange={v => setHeirForm(f => ({ ...f, phone: v }))} />
                <FormField label="メール" value={heirForm.email} onChange={v => setHeirForm(f => ({ ...f, email: v }))} />
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1">フラグ</label>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={heirForm.is_legal_heir} onChange={e => setHeirForm(f => ({ ...f, is_legal_heir: e.target.checked }))} className="rounded" />
                      法定相続人
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={heirForm.is_applicant} onChange={e => setHeirForm(f => ({ ...f, is_applicant: e.target.checked }))} className="rounded" />
                      申出人（法定相続情報一覧図）
                    </label>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mb-3">
                <FormField label="住所" value={heirForm.address} onChange={v => setHeirForm(f => ({ ...f, address: v }))} />
                <FormField label="本籍" value={heirForm.registered_address} onChange={v => setHeirForm(f => ({ ...f, registered_address: v }))} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddHeir(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50">キャンセル</button>
                <button onClick={handleAddHeir} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700">追加</button>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Inheritance relationship diagram */}
      <div className="mt-3.5 print-diagram">
        <Section title="相続関係説明図" icon="🔗" actionLabel="🖨️ 印刷" onAction={() => window.print()}>
          {heirs.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">
              相続人を追加すると相続関係説明図が表示されます
            </div>
          ) : (
            <InheritanceDiagramV2 deceased={caseData} heirs={heirs} />
          )}
        </Section>
      </div>
    </div>
  )
}

// ─── InlineEdit component ───
function InlineEdit({ label, value, onSave, mono, fullWidth, displayPrefix }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  fullWidth?: boolean
  displayPrefix?: string
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

  const handleStartEdit = () => {
    setDraft(value ?? '')
    setEditing(true)
  }

  const handleSave = async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleCancel = () => {
    setDraft(value ?? '')
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const displayValue = value
    ? (displayPrefix ? `${displayPrefix}${value}` : value)
    : null

  return (
    <div className={`py-1.5 border-b border-gray-50 ${fullWidth ? 'col-span-2' : ''}`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
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
        <div
          onClick={handleStartEdit}
          className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]"
        >
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${displayValue ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {displayValue ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
        </div>
      )}
    </div>
  )
}

// ─── Shared components ───
function Section({ title, icon, children, actionLabel, onAction }: {
  title: string; icon: string; children: React.ReactNode; actionLabel?: string; onAction?: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900 flex-1">{title}</h3>
        {actionLabel && onAction && (
          <button onClick={onAction} className="text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition border border-blue-200 bg-blue-50">
            {actionLabel}
          </button>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-0">{children}</div>
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
      />
    </div>
  )
}

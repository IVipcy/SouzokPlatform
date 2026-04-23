'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow, DivisionDetailRow } from '@/types'
import {
  WILL_CREATION_PLACES,
  WILL_TYPES,
  WILL_STORAGE_OPTIONS,
  WILL_EXECUTION_OPTIONS,
  DIVISION_POLICIES,
  AGREEMENT_SIGNING_METHODS,
  WILL_CONTENT_OPTIONS,
  WILL_BEQUEST_HANDLER_OPTIONS,
  TRUST_CONTRACT_TYPES,
  TRUST_CONTENT_OPTIONS,
  DIVISION_METHODS,
} from '@/lib/constants'
import { InlineCheckbox, InlineSelect, InlineMultiSelect, InlineEdit as SharedInlineEdit, InlineDate } from '@/components/ui/InlineFields'

type Props = {
  caseData: CaseRow
  divisionDetails: DivisionDetailRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

const riskColorMap: Record<string, string> = {
  '高': 'bg-red-50 text-red-700 border-red-200',
  '中': 'bg-amber-50 text-amber-700 border-amber-200',
  '低': 'bg-green-50 text-green-700 border-green-200',
}

export default function DivisionTab({ caseData, divisionDetails, onRefresh, patchCase }: Props) {
  const [showAddDetail, setShowAddDetail] = useState(false)
  const [detailForm, setDetailForm] = useState({
    asset_category: '',
    division_method: '',
    recipient: '',
    share_ratio: '',
    description: '',
  })

  const saveCaseField = async (field: string, value: string) => {
    await patchCase({ [field]: value || null } as Partial<CaseRow>)
  }

  const saveCaseArrayField = async (field: string, value: string[]) => {
    await patchCase({ [field]: value.length > 0 ? value : null } as Partial<CaseRow>)
  }

  const saveCaseDateField = async (field: string, value: string) => {
    await patchCase({ [field]: value || null } as Partial<CaseRow>)
  }

  const saveCaseBoolField = async (field: string, value: boolean) => {
    await patchCase({ [field]: value } as Partial<CaseRow>)
  }

  const handleAddDetail = async () => {
    if (!detailForm.asset_category.trim()) return
    const supabase = createClient()
    await supabase.from('division_details').insert({
      case_id: caseData.id,
      asset_category: detailForm.asset_category,
      division_method: detailForm.division_method || null,
      recipient: detailForm.recipient || null,
      share_ratio: detailForm.share_ratio || null,
      description: detailForm.description || null,
    })
    setDetailForm({ asset_category: '', division_method: '', recipient: '', share_ratio: '', description: '' })
    setShowAddDetail(false)
    onRefresh()
  }

  const handleDeleteDetail = async (detailId: string) => {
    const supabase = createClient()
    await supabase.from('division_details').delete().eq('id', detailId)
    onRefresh()
  }

  return (
    <div className="space-y-3.5">
      {/* 遺産分割 */}
      <Section title="遺産分割" icon="⚖️">
        <FieldGrid>
          <InlineSelect label="分割方針" value={caseData.division_policy} options={[...DIVISION_POLICIES]} onSave={v => saveCaseField('division_policy', v)} />
          <InlineEdit label="分割提案" value={caseData.division_proposal} onSave={v => saveCaseField('division_proposal', v)} />
          <InlineSelect label="署名方法" value={caseData.agreement_signing_method} options={[...AGREEMENT_SIGNING_METHODS]} onSave={v => saveCaseField('agreement_signing_method', v)} />
          <InlineEdit label="相続リスク" value={caseData.inheritance_risk} onSave={v => saveCaseField('inheritance_risk', v)} />
        </FieldGrid>
      </Section>

      {/* 分割内容 — 遺産分割の結果詳細（full-width） */}
      <Section title="分割内容" icon="📊" actionLabel="＋ 追加" onAction={() => setShowAddDetail(true)}>
        {divisionDetails.length === 0 && !showAddDetail ? (
          <div className="text-sm text-gray-400 text-center py-6">
            分割内容を追加してください
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 -mb-3">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['財産区分', '分割方法', '取得者・割合', '確定内容', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-gray-500 tracking-wider bg-gray-50 border-b border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {divisionDetails.map(detail => (
                  <tr key={detail.id} className="border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF]">
                    <td className="px-3 py-2.5 text-[11px] font-semibold text-gray-900">{detail.asset_category}</td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-600">{detail.division_method ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-600">
                      {detail.recipient ?? '—'}
                      {detail.share_ratio && <span className="ml-1 text-[10px] text-gray-400">({detail.share_ratio})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-600">{detail.description ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleDeleteDetail(detail.id)}
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

        {showAddDetail && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <FormField label="財産区分 *" value={detailForm.asset_category} onChange={v => setDetailForm(f => ({ ...f, asset_category: v }))} placeholder="不動産, 預貯金, 有価証券 等" />
              <SelectField label="分割方法" value={detailForm.division_method} onChange={v => setDetailForm(f => ({ ...f, division_method: v }))} options={[...DIVISION_METHODS]} />
              <FormField label="取得者" value={detailForm.recipient} onChange={v => setDetailForm(f => ({ ...f, recipient: v }))} />
              <FormField label="取得割合" value={detailForm.share_ratio} onChange={v => setDetailForm(f => ({ ...f, share_ratio: v }))} placeholder="1/2, 100% 等" />
              <div className="md:col-span-2">
                <FormField label="確定内容" value={detailForm.description} onChange={v => setDetailForm(f => ({ ...f, description: v }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddDetail(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50">キャンセル</button>
              <button onClick={handleAddDetail} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700">追加</button>
            </div>
          </div>
        )}
      </Section>

      {/* 遺言 */}
        <Section title="遺言" icon="📜">
          <FieldGrid>
            <InlineSelect label="遺言種類" value={caseData.will_type} options={[...WILL_TYPES]} onSave={v => saveCaseField('will_type', v)} />
            <InlineSelect label="保管場所" value={caseData.will_storage} options={[...WILL_STORAGE_OPTIONS]} onSave={v => saveCaseField('will_storage', v)} />
            <InlineSelect label="遺言執行" value={caseData.will_execution} options={[...WILL_EXECUTION_OPTIONS]} onSave={v => saveCaseField('will_execution', v)} />
            <InlineCheckbox label="遺留分リスク" value={caseData.will_remainders_risk} onSave={v => saveCaseBoolField('will_remainders_risk', v)} />
            <InlineCheckbox label="遺贈有無" value={caseData.will_bequest} onSave={v => saveCaseBoolField('will_bequest', v)} />
            <InlineSelect label="作成場所" value={caseData.will_creation_place} options={[...WILL_CREATION_PLACES]} onSave={v => saveCaseField('will_creation_place', v)} />
            <InlineEdit label="公証役場名" value={caseData.notary_office_name} onSave={v => saveCaseField('notary_office_name', v)} />
            <SharedInlineEdit label="証人氏名" value={caseData.will_witness} onSave={v => saveCaseField('will_witness', v)} />
            <InlineSelect label="遺贈受贈者資料手配" value={caseData.will_bequest_handler} options={[...WILL_BEQUEST_HANDLER_OPTIONS]} onSave={v => saveCaseField('will_bequest_handler', v)} />
          </FieldGrid>
          <div className="mt-2">
            <InlineMultiSelect
              label="遺言記載内容"
              value={caseData.will_content}
              options={[...WILL_CONTENT_OPTIONS]}
              onSave={v => saveCaseArrayField('will_content', v)}
              fullWidth
            />
          </div>
          <div className="mt-2">
            <InlineDate label="文案確認日" value={caseData.will_draft_confirmed_date} onSave={v => saveCaseDateField('will_draft_confirmed_date', v)} />
          </div>

          {caseData.will_type === '自筆' && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-sm flex-shrink-0">⚠️</span>
              <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                自筆遺言のため家庭裁判所への検認申立が必要です。
              </p>
            </div>
          )}
        </Section>

        {/* 信託 */}
        <Section title="信託" icon="🏛️">
          <FieldGrid>
            <InlineSelect label="信託契約書種別" value={caseData.trust_contract_type} options={[...TRUST_CONTRACT_TYPES]} onSave={v => saveCaseField('trust_contract_type', v)} />
            <InlineSelect label="作成場所" value={caseData.trust_creation_place} options={[...WILL_CREATION_PLACES]} onSave={v => saveCaseField('trust_creation_place', v)} />
            <SharedInlineEdit label="最終帰属者" value={caseData.trust_final_beneficiary} onSave={v => saveCaseField('trust_final_beneficiary', v)} fullWidth />
          </FieldGrid>
          <div className="mt-2">
            <InlineMultiSelect
              label="記載内容"
              value={caseData.trust_content}
              options={[...TRUST_CONTENT_OPTIONS]}
              onSave={v => saveCaseArrayField('trust_content', v)}
              fullWidth
            />
          </div>
        </Section>
    </div>
  )
}

// ─── InlineEdit component ───
function InlineEdit({ label, value, onSave, mono, fullWidth }: {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  mono?: boolean
  fullWidth?: boolean
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
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value ?? '未設定'}
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

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition bg-white"
      >
        <option value="">選択してください</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

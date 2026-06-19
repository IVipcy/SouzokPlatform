'use client'

import { useState, useRef, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import DivisionDetailsTable from './DivisionDetailsTable'
import AgreementDispatchTable from './AgreementDispatchTable'
import type { CaseRow, DivisionDetailRow, HeirRow, AgreementDispatchRow } from '@/types'
import {
  WILL_CREATION_PLACES,
  WILL_TYPES,
  WILL_STORAGE_OPTIONS,
  WILL_EXECUTION_OPTIONS,
  DIVISION_POLICIES,
  PRESENCE_OPTIONS,
  AGREEMENT_DISPATCH_METHODS,
  AGREEMENT_SIGNING_METHODS,
  WILL_CONTENT_OPTIONS,
  WILL_BEQUEST_HANDLER_OPTIONS,
  TRUST_CONTRACT_TYPES,
  TRUST_CONTENT_OPTIONS,
} from '@/lib/constants'
import { InlineCheckbox, InlineSelect, InlineEdit as SharedInlineEdit, InlineDate, InlineTextarea, Section, FieldGrid } from '@/components/ui/InlineFields'

type Props = {
  caseData: CaseRow
  divisionDetails: DivisionDetailRow[]
  heirs: HeirRow[]
  agreementDispatches?: AgreementDispatchRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** 'division' = 遺産分割＋分割内容 / 'will' = 遺言＋信託 */
  mode?: 'division' | 'will'
}

export default function DivisionTab({ caseData, divisionDetails, heirs, agreementDispatches = [], onRefresh, patchCase, mode = 'division' }: Props) {
  const saveCaseField = async (field: string, value: string) => {
    await patchCase({ [field]: value || null } as Partial<CaseRow>)
  }

  const saveCaseDateField = async (field: string, value: string) => {
    await patchCase({ [field]: value || null } as Partial<CaseRow>)
  }

  const saveCaseBoolField = async (field: string, value: boolean) => {
    await patchCase({ [field]: value } as Partial<CaseRow>)
  }

  // カテゴリ別自由記述（JSONB）更新: 空文字列はキー削除、全空ならnull
  const saveCaseContentDetail = async (
    field: 'will_content_details' | 'trust_content_details',
    category: string,
    value: string,
  ) => {
    const current = (caseData[field] ?? {}) as Record<string, string>
    const next: Record<string, string> = { ...current }
    if (value.trim()) {
      next[category] = value
    } else {
      delete next[category]
    }
    const hasAny = Object.keys(next).length > 0
    await patchCase({ [field]: hasAny ? next : null } as Partial<CaseRow>)
  }

  return (
    <div className="space-y-3.5">
      {mode === 'division' && (<>
      {/* 遺産分割 */}
      <Section title="分割方針" icon="⚖️">
        <FieldGrid>
          <InlineSelect label="分割方針" value={caseData.division_policy} options={[...DIVISION_POLICIES]} onSave={v => saveCaseField('division_policy', v)} />
          <InlineSelect label="分配方針の提案" value={caseData.division_proposal_presence} options={[...PRESENCE_OPTIONS]} onSave={v => saveCaseField('division_proposal_presence', v)} />
          <InlineSelect label="協議書の送付・調印" value={caseData.agreement_dispatch_method} options={[...AGREEMENT_DISPATCH_METHODS]} onSave={v => saveCaseField('agreement_dispatch_method', v)} />
          <InlineSelect label="署名方法" value={caseData.agreement_signing_method} options={[...AGREEMENT_SIGNING_METHODS]} onSave={v => saveCaseField('agreement_signing_method', v)} />
          <InlineEdit label="相続リスク" value={caseData.inheritance_risk} onSave={v => saveCaseField('inheritance_risk', v)} />
        </FieldGrid>
        <div className="mt-2">
          <InlineTextarea label="分配方針の提案 内容" value={caseData.division_proposal ?? ''} onSave={v => saveCaseField('division_proposal', v)} fullWidth />
        </div>
      </Section>

      {/* 分割内容 — 表形式（取得者は相続人の選択リスト） */}
      <Section title="分割内容">
        <DivisionDetailsTable caseId={caseData.id} details={divisionDetails} heirs={heirs} onRefresh={onRefresh} />
      </Section>

      {/* 協議書の送付・受領 — 「OCから各相続人へ」を選んだときだけ表示 */}
      {caseData.agreement_dispatch_method === 'OCから各相続人へ' && (
        <Section title="協議書の送付・受領" icon="📨">
          <AgreementDispatchTable caseId={caseData.id} heirs={heirs} dispatches={agreementDispatches} onRefresh={onRefresh} />
        </Section>
      )}
      </>)}

      {mode === 'will' && (<>
      {/* 遺言 */}
        <Section title="遺言情報" icon="📜">
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
          <div className="mt-3">
            <Section title="遺言記載内容（カテゴリ別）" collapsible defaultOpen={false}>
              <div className="space-y-2">
                {WILL_CONTENT_OPTIONS.map(cat => (
                  <InlineTextarea
                    key={cat}
                    label={cat}
                    value={caseData.will_content_details?.[cat] ?? ''}
                    onSave={v => saveCaseContentDetail('will_content_details', cat, v)}
                    fullWidth
                  />
                ))}
              </div>
            </Section>
          </div>
          <div className="mt-2">
            <InlineDate label="文案確認日" value={caseData.will_draft_confirmed_date} onSave={v => saveCaseDateField('will_draft_confirmed_date', v)} />
          </div>

          {caseData.will_type === '自筆' && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2.25} />
              <p className="text-[13px] text-amber-700 font-medium leading-relaxed">
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
          <div className="mt-3">
            <Section title="信託記載内容（カテゴリ別）" collapsible defaultOpen={false}>
              <div className="space-y-2">
                {TRUST_CONTENT_OPTIONS.map(cat => (
                  <InlineTextarea
                    key={cat}
                    label={cat}
                    value={caseData.trust_content_details?.[cat] ?? ''}
                    onSave={v => saveCaseContentDetail('trust_content_details', cat, v)}
                    fullWidth
                  />
                ))}
              </div>
            </Section>
          </div>
        </Section>
      </>)}
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
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={`w-full px-1.5 py-0.5 -ml-1.5 text-[13px] border border-brand-400 rounded outline-none bg-brand-50/30 ${mono ? 'font-mono' : ''} ${saving ? 'opacity-50' : ''}`}
        />
      ) : (
        <div
          onClick={handleStartEdit}
          className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]"
        >
          <span className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
            {value ?? '未設定'}
          </span>
          <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[12px]">✏️</span>
        </div>
      )}
    </div>
  )
}


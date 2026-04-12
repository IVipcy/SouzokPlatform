'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow } from '@/types'
import { createClient } from '@/lib/supabase/client'
import {
  Section as SharedSection,
  FieldGrid as SharedFieldGrid,
  Field as SharedField,
  InlineSelect,
  InlineDate,
  InlineCurrency,
  InlineEdit as SharedInlineEdit,
  InlineCheckbox,
  InlineTextarea,
} from '@/components/ui/InlineFields'
import {
  TAX_FILING_OPTIONS,
  TAX_ADVISOR_REFERRAL_OPTIONS,
  TRUST_CONTRACT_TYPES,
  LIFE_INSURANCE_PROPOSAL_OPTIONS,
} from '@/lib/constants'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  onRefresh: () => void
}

/* ── InlineEdit component ── */
function InlineEdit({
  value,
  displayValue,
  onSave,
  type = 'text',
  options,
  placeholder,
}: {
  value: string | number | null
  displayValue?: React.ReactNode
  onSave: (val: string) => Promise<void>
  type?: 'text' | 'number' | 'date' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [editing])

  const commit = useCallback(async () => {
    if (draft === String(value ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setDraft(String(value ?? ''))
      setEditing(false)
    }
  }

  if (editing) {
    if (type === 'select' && options) {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={draft}
          onChange={e => { setDraft(e.target.value) }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50 min-w-[80px]"
        >
          <option value="">未設定</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50 w-full max-w-[200px]"
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(String(value ?? '')); setEditing(true) }}
      className="group/ie cursor-pointer inline-flex items-center gap-1 rounded px-0.5 -mx-0.5 hover:bg-blue-50 transition min-h-[20px]"
      title="クリックして編集"
    >
      {displayValue ?? (
        <span className={`text-xs ${value != null && value !== '' ? 'text-gray-700' : 'text-gray-300 italic'}`}>
          {value != null && value !== '' ? String(value) : placeholder ?? '—'}
        </span>
      )}
      <svg className="w-3 h-3 text-gray-300 opacity-0 group-hover/ie:opacity-100 transition flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </span>
  )
}

/* ── BoolTag with toggle ── */
function BoolTag({
  value,
  onToggle,
}: {
  value: boolean
  onToggle?: () => Promise<void>
}) {
  const [toggling, setToggling] = useState(false)

  const handleClick = async () => {
    if (!onToggle) return
    setToggling(true)
    try {
      await onToggle()
    } finally {
      setToggling(false)
    }
  }

  const base = onToggle ? 'cursor-pointer hover:shadow-sm transition' : ''

  if (toggling) {
    return (
      <span className="bg-gray-100 text-gray-400 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-semibold">
        保存中...
      </span>
    )
  }

  return value ? (
    <span
      onClick={handleClick}
      className={`bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-semibold ${base}`}
      title={onToggle ? 'クリックで切替' : undefined}
    >
      ✓ あり
    </span>
  ) : (
    <span
      onClick={handleClick}
      className={`bg-gray-50 text-gray-400 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-semibold ${base}`}
      title={onToggle ? 'クリックで切替' : undefined}
    >
      なし
    </span>
  )
}

export default function AssetsTab({ caseData, properties, financialAssets, onRefresh }: Props) {
  const [showPropertyForm, setShowPropertyForm] = useState(false)
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [showSecuritiesForm, setShowSecuritiesForm] = useState(false)
  const [showTrustForm, setShowTrustForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Property form state
  const [propForm, setPropForm] = useState({ property_type: '', address: '', lot_number: '' })

  // Financial asset form states (per section)
  const [depositForm, setDepositForm] = useState({ institution_name: '', branch_name: '' })
  const [securitiesForm, setSecuritiesForm] = useState({ institution_name: '', branch_name: '' })
  const [trustForm, setTrustForm] = useState({ institution_name: '', branch_name: '' })

  const deposits = financialAssets.filter(a => a.asset_type === '預貯金')
  const securities = financialAssets.filter(a => a.asset_type === '証券')
  const trustBanks = financialAssets.filter(a => a.asset_type === '信託銀行')

  /* ── Supabase update helpers ── */

  async function updateCase(field: string, value: unknown) {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value }).eq('id', caseData.id)
    onRefresh()
  }

  async function updateProperty(id: string, field: string, value: unknown) {
    const supabase = createClient()
    await supabase.from('real_estate_properties').update({ [field]: value }).eq('id', id)
    onRefresh()
  }

  async function updateFinancialAsset(id: string, field: string, value: unknown) {
    const supabase = createClient()
    await supabase.from('financial_assets').update({ [field]: value }).eq('id', id)
    onRefresh()
  }

  /* ── Add handlers ── */

  async function handleAddProperty() {
    if (!propForm.property_type && !propForm.address) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('real_estate_properties').insert({
      case_id: caseData.id,
      property_type: propForm.property_type || null,
      address: propForm.address || null,
      lot_number: propForm.lot_number || null,
    })
    setPropForm({ property_type: '', address: '', lot_number: '' })
    setShowPropertyForm(false)
    setSaving(false)
    onRefresh()
  }

  async function handleAddFinancial(assetType: string, form: { institution_name: string; branch_name: string }, resetForm: () => void, closeForm: () => void) {
    if (!form.institution_name) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('financial_assets').insert({
      case_id: caseData.id,
      asset_type: assetType,
      institution_name: form.institution_name,
      branch_name: form.branch_name || null,
    })
    resetForm()
    closeForm()
    setSaving(false)
    onRefresh()
  }

  async function handleDeleteProperty(id: string) {
    const supabase = createClient()
    await supabase.from('real_estate_properties').delete().eq('id', id)
    onRefresh()
  }

  async function handleDeleteFinancial(id: string) {
    const supabase = createClient()
    await supabase.from('financial_assets').delete().eq('id', id)
    onRefresh()
  }

  /* ── Inline add form component ── */
  function InlineAddForm({
    title,
    form,
    setForm,
    onSubmit,
    onCancel,
  }: {
    title: string
    form: { institution_name: string; branch_name: string }
    setForm: React.Dispatch<React.SetStateAction<{ institution_name: string; branch_name: string }>>
    onSubmit: () => void
    onCancel: () => void
  }) {
    return (
      <div className="border-t border-blue-100 bg-blue-50/30 pt-3 mt-3 -mx-4 px-4 pb-3 -mb-3">
        <div className="text-[11px] font-semibold text-blue-700 mb-2">{title}</div>
        <div className="grid grid-cols-1 gap-2">
          <input
            type="text"
            placeholder="金融機関名（例: 三菱UFJ銀行）"
            value={form.institution_name}
            onChange={e => setForm(f => ({ ...f, institution_name: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
            autoFocus
          />
          <input
            type="text"
            placeholder="支店名（例: 渋谷支店）"
            value={form.branch_name}
            onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onSubmit}
            disabled={saving}
            className="px-3 py-1 bg-blue-600 text-white text-[11px] font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? '保存中...' : '追加'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1 text-gray-500 text-[11px] font-medium rounded-lg hover:bg-gray-100 transition"
          >
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  const saveCaseFieldStr = async (field: string, value: string) => {
    await updateCase(field, value || null)
  }

  const saveCaseFieldNum = async (field: string, value: number | null) => {
    await updateCase(field, value)
  }

  const saveCaseFieldBool = async (field: string, value: boolean) => {
    await updateCase(field, value)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3.5">
        {/* 相続税申告 */}
        <SharedSection title="相続税申告" icon="💰">
          <SharedFieldGrid>
            <InlineSelect
              label="相続税申告要否"
              value={caseData.tax_filing_required}
              options={[...TAX_FILING_OPTIONS]}
              onSave={v => saveCaseFieldStr('tax_filing_required', v)}
            />
            <InlineDate
              label="申告期限"
              value={caseData.tax_filing_deadline}
              onSave={v => saveCaseFieldStr('tax_filing_deadline', v)}
            />
            <InlineCurrency
              label="資産合計額（概算）"
              value={caseData.total_asset_estimate}
              onSave={v => saveCaseFieldNum('total_asset_estimate', v)}
            />
            <InlineSelect
              label="税理士紹介有無"
              value={caseData.tax_advisor_referral}
              options={[...TAX_ADVISOR_REFERRAL_OPTIONS]}
              onSave={v => saveCaseFieldStr('tax_advisor_referral', v)}
            />
          </SharedFieldGrid>
          <SharedFieldGrid cols={1}>
            <SharedInlineEdit
              label="税理士名・事務所名"
              value={caseData.tax_advisor_name}
              onSave={v => saveCaseFieldStr('tax_advisor_name', v)}
              fullWidth
            />
          </SharedFieldGrid>
        </SharedSection>

        {/* 信託関連 */}
        <SharedSection title="信託関連" icon="🏦">
          <SharedFieldGrid>
            <InlineSelect
              label="信託契約書種別"
              value={caseData.trust_contract_type}
              options={[...TRUST_CONTRACT_TYPES]}
              onSave={v => saveCaseFieldStr('trust_contract_type', v)}
            />
          </SharedFieldGrid>
        </SharedSection>

        {/* 生命保険提案 */}
        <SharedSection title="生命保険提案" icon="🛡️">
          <SharedFieldGrid>
            <InlineSelect
              label="生命保険提案有無"
              value={caseData.life_insurance_proposal}
              options={[...LIFE_INSURANCE_PROPOSAL_OPTIONS]}
              onSave={v => saveCaseFieldStr('life_insurance_proposal', v)}
            />
            <SharedInlineEdit
              label="保険会社名"
              value={caseData.life_insurance_company}
              onSave={v => saveCaseFieldStr('life_insurance_company', v)}
            />
            <SharedInlineEdit
              label="保険種類・金額"
              value={caseData.life_insurance_type_amount}
              onSave={v => saveCaseFieldStr('life_insurance_type_amount', v)}
            />
            <InlineCheckbox
              label="生命保険協会照会"
              value={caseData.life_insurance_inquiry}
              onSave={v => saveCaseFieldBool('life_insurance_inquiry', v)}
            />
          </SharedFieldGrid>
          <SharedFieldGrid cols={1}>
            <InlineTextarea
              label="照会結果備考"
              value={caseData.life_insurance_inquiry_notes}
              onSave={v => saveCaseFieldStr('life_insurance_inquiry_notes', v)}
              fullWidth
            />
          </SharedFieldGrid>
        </SharedSection>

        {/* Real estate */}
        <Section
          title="不動産"
          icon="🏠"
          actionLabel="追加"
          onAction={() => setShowPropertyForm(v => !v)}
        >
          {/* Property rank from caseData */}
          <FieldGrid>
            <Field label="評価ランク">
              <InlineEdit
                value={caseData.property_rank}
                displayValue={
                  caseData.property_rank && caseData.property_rank !== '確認中' ? (
                    <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded font-extrabold text-sm inline-block mt-0.5">
                      {caseData.property_rank}
                    </span>
                  ) : (
                    <span className="text-gray-300 italic text-xs">{caseData.property_rank ?? '未設定'}</span>
                  )
                }
                type="select"
                options={[
                  { value: 'S', label: 'S' },
                  { value: 'A', label: 'A' },
                  { value: 'B', label: 'B' },
                  { value: 'C', label: 'C' },
                  { value: '確認中', label: '確認中' },
                ]}
                onSave={async (val) => { await updateCase('property_rank', val || null) }}
              />
            </Field>
          </FieldGrid>

          {/* Property entries */}
          {properties.length === 0 && !showPropertyForm && (
            <div className="text-xs text-gray-400 text-center py-4 mt-2 border-t border-gray-50">
              不動産情報が登録されていません
            </div>
          )}
          {properties.map(p => (
            <div key={p.id} className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex items-start justify-between mb-2">
                <div className="text-[11px] font-semibold text-gray-700">
                  <InlineEdit
                    value={p.property_type}
                    placeholder="種別未設定"
                    onSave={async (val) => { await updateProperty(p.id, 'property_type', val || null) }}
                  />
                </div>
                <button
                  onClick={() => handleDeleteProperty(p.id)}
                  className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                >
                  削除
                </button>
              </div>
              <FieldGrid>
                <Field label="物件種別">
                  <InlineEdit
                    value={p.property_type}
                    onSave={async (val) => { await updateProperty(p.id, 'property_type', val || null) }}
                  />
                </Field>
                <Field label="住人状況">
                  <InlineEdit
                    value={p.resident_status}
                    onSave={async (val) => { await updateProperty(p.id, 'resident_status', val || null) }}
                  />
                </Field>
                <Field label="エリア評価">
                  <InlineEdit
                    value={p.area_evaluation}
                    displayValue={
                      p.area_evaluation ? (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                          {p.area_evaluation}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    }
                    onSave={async (val) => { await updateProperty(p.id, 'area_evaluation', val || null) }}
                  />
                </Field>
                <Field label="築年数">
                  <InlineEdit
                    value={p.building_age}
                    displayValue={
                      <span className="text-xs font-mono text-gray-700">
                        {p.building_age != null ? `${p.building_age}年` : '—'}
                      </span>
                    }
                    type="number"
                    onSave={async (val) => { await updateProperty(p.id, 'building_age', val ? Number(val) : null) }}
                  />
                </Field>
                <Field label="売却意向">
                  <InlineEdit
                    value={p.sale_intention}
                    displayValue={
                      p.sale_intention ? (
                        <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                          {p.sale_intention}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    }
                    onSave={async (val) => { await updateProperty(p.id, 'sale_intention', val || null) }}
                  />
                </Field>
                <Field label="権利書">
                  <BoolTag
                    value={p.has_title_deed}
                    onToggle={async () => { await updateProperty(p.id, 'has_title_deed', !p.has_title_deed) }}
                  />
                </Field>
                <Field label="納税通知書">
                  <BoolTag
                    value={p.has_tax_notice}
                    onToggle={async () => { await updateProperty(p.id, 'has_tax_notice', !p.has_tax_notice) }}
                  />
                </Field>
                <Field label="登記情報取得">
                  <BoolTag
                    value={p.has_registry_info}
                    onToggle={async () => { await updateProperty(p.id, 'has_registry_info', !p.has_registry_info) }}
                  />
                </Field>
              </FieldGrid>
              <FieldGrid cols={1}>
                <Field label="不動産所在地">
                  <InlineEdit
                    value={p.address}
                    onSave={async (val) => { await updateProperty(p.id, 'address', val || null) }}
                  />
                </Field>
                <Field label="地番">
                  <InlineEdit
                    value={p.lot_number}
                    onSave={async (val) => { await updateProperty(p.id, 'lot_number', val || null) }}
                  />
                </Field>
              </FieldGrid>
              <FieldGrid>
                <Field label="名寄せ請求先">
                  <InlineEdit
                    value={p.name_consolidation_dest}
                    onSave={async (val) => { await updateProperty(p.id, 'name_consolidation_dest', val || null) }}
                  />
                </Field>
                <Field label="評価証明請求先">
                  <InlineEdit
                    value={p.evaluation_cert_dest}
                    onSave={async (val) => { await updateProperty(p.id, 'evaluation_cert_dest', val || null) }}
                  />
                </Field>
                <Field label="公図取得">
                  <BoolTag
                    value={p.has_cadastral_map}
                    onToggle={async () => { await updateProperty(p.id, 'has_cadastral_map', !p.has_cadastral_map) }}
                  />
                </Field>
              </FieldGrid>
            </div>
          ))}

          {/* Add property form - inline within the section */}
          {showPropertyForm && (
            <div className="border-t border-blue-100 bg-blue-50/30 pt-3 mt-3 -mx-4 px-4 pb-3 -mb-3">
              <div className="text-[11px] font-semibold text-blue-700 mb-2">不動産を追加</div>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  placeholder="物件種別（例: 戸建, マンション, 土地）"
                  value={propForm.property_type}
                  onChange={e => setPropForm(f => ({ ...f, property_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="所在地"
                  value={propForm.address}
                  onChange={e => setPropForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                />
                <input
                  type="text"
                  placeholder="地番"
                  value={propForm.lot_number}
                  onChange={e => setPropForm(f => ({ ...f, lot_number: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleAddProperty}
                  disabled={saving}
                  className="px-3 py-1 bg-blue-600 text-white text-[11px] font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {saving ? '保存中...' : '追加'}
                </button>
                <button
                  onClick={() => setShowPropertyForm(false)}
                  className="px-3 py-1 text-gray-500 text-[11px] font-medium rounded-lg hover:bg-gray-100 transition"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* Bank deposits */}
        <Section
          title="金融資産（預貯金）"
          icon="🏦"
          actionLabel="追加"
          onAction={() => setShowDepositForm(v => !v)}
        >
          {deposits.length === 0 && !showDepositForm && (
            <div className="text-xs text-gray-400 text-center py-4">
              預貯金データが登録されていません
            </div>
          )}
          <div className="space-y-0">
            {deposits.map(d => (
              <div key={d.id} className="border-b border-gray-50 last:border-b-0 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <InlineEdit
                      value={d.institution_name}
                      displayValue={<span className="text-[12px] font-bold text-gray-800">{d.institution_name}</span>}
                      onSave={async (val) => { if (val) await updateFinancialAsset(d.id, 'institution_name', val) }}
                    />
                    <InlineEdit
                      value={d.branch_name}
                      displayValue={<span className="text-[11px] text-gray-400">{d.branch_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'branch_name', val || null) }}
                      placeholder="支店名"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteFinancial(d.id)}
                    className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                  >
                    削除
                  </button>
                </div>
                {d.required_docs && d.required_docs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {d.required_docs.map((doc, i) => (
                      <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[9px] font-semibold">
                        {doc}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="text-[10px] text-gray-400">
                    現存確認要否：
                    <InlineEdit
                      value={d.existence_check}
                      displayValue={
                        d.existence_check ? (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            d.existence_check === '要' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {d.existence_check}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )
                      }
                      type="select"
                      options={[
                        { value: '要', label: '要' },
                        { value: '不要', label: '不要' },
                      ]}
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'existence_check', val || null) }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400">
                    残高証明基準日：
                    <InlineEdit
                      value={d.balance_cert_date}
                      displayValue={<span className="font-semibold text-gray-600">{d.balance_cert_date ?? '—'}</span>}
                      type="date"
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'balance_cert_date', val || null) }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400">
                    取引履歴期間：
                    <InlineEdit
                      value={d.transaction_history_period}
                      displayValue={
                        d.transaction_history_period ? (
                          <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                            {d.transaction_history_period}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )
                      }
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'transaction_history_period', val || null) }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400">
                    貸金庫有無：
                    <InlineEdit
                      value={d.safe_deposit_box}
                      displayValue={
                        d.safe_deposit_box ? (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            d.safe_deposit_box === '有' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {d.safe_deposit_box}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )
                      }
                      type="select"
                      options={[
                        { value: '有', label: '有' },
                        { value: '無', label: '無' },
                      ]}
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'safe_deposit_box', val || null) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Inline add form for deposits */}
          {showDepositForm && (
            <InlineAddForm
              title="預貯金を追加"
              form={depositForm}
              setForm={setDepositForm}
              onSubmit={() => handleAddFinancial('預貯金', depositForm, () => setDepositForm({ institution_name: '', branch_name: '' }), () => setShowDepositForm(false))}
              onCancel={() => setShowDepositForm(false)}
            />
          )}
        </Section>

        {/* Securities */}
        <Section
          title="金融資産（証券）"
          icon="📈"
          actionLabel="追加"
          onAction={() => setShowSecuritiesForm(v => !v)}
        >
          {securities.length === 0 && !showSecuritiesForm && (
            <div className="text-xs text-gray-400 text-center py-4">
              証券データが登録されていません
            </div>
          )}
          <div className="space-y-0">
            {securities.map(s => (
              <div key={s.id} className="border-b border-gray-50 last:border-b-0 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <InlineEdit
                      value={s.institution_name}
                      displayValue={<span className="text-[12px] font-bold text-gray-800">{s.institution_name}</span>}
                      onSave={async (val) => { if (val) await updateFinancialAsset(s.id, 'institution_name', val) }}
                    />
                    <InlineEdit
                      value={s.branch_name}
                      displayValue={<span className="text-[11px] text-gray-400">{s.branch_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(s.id, 'branch_name', val || null) }}
                      placeholder="支店名"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteFinancial(s.id)}
                    className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                  >
                    削除
                  </button>
                </div>
                {s.required_docs && s.required_docs.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.required_docs.map((doc, i) => (
                      <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[9px] font-semibold">
                        {doc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Inline add form for securities */}
          {showSecuritiesForm && (
            <InlineAddForm
              title="証券を追加"
              form={securitiesForm}
              setForm={setSecuritiesForm}
              onSubmit={() => handleAddFinancial('証券', securitiesForm, () => setSecuritiesForm({ institution_name: '', branch_name: '' }), () => setShowSecuritiesForm(false))}
              onCancel={() => setShowSecuritiesForm(false)}
            />
          )}
        </Section>

        {/* Trust banks */}
        <Section
          title="金融資産（信託銀行）"
          icon="🏛️"
          actionLabel="追加"
          onAction={() => setShowTrustForm(v => !v)}
        >
          {trustBanks.length === 0 && !showTrustForm && (
            <div className="text-xs text-gray-400 text-center py-4">
              信託銀行データが登録されていません
            </div>
          )}
          <div className="space-y-0">
            {trustBanks.map(t => (
              <div key={t.id} className="border-b border-gray-50 last:border-b-0 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <InlineEdit
                      value={t.institution_name}
                      displayValue={<span className="text-[12px] font-bold text-gray-800">{t.institution_name}</span>}
                      onSave={async (val) => { if (val) await updateFinancialAsset(t.id, 'institution_name', val) }}
                    />
                    <InlineEdit
                      value={t.branch_name}
                      displayValue={<span className="text-[11px] text-gray-400">{t.branch_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'branch_name', val || null) }}
                      placeholder="支店名"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteFinancial(t.id)}
                    className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                  >
                    削除
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {t.stock_name && (
                    <div className="text-[11px]">
                      <span className="text-gray-400">銘柄名：</span>
                      <InlineEdit
                        value={t.stock_name}
                        displayValue={<span className="font-semibold text-gray-700">{t.stock_name}</span>}
                        onSave={async (val) => { await updateFinancialAsset(t.id, 'stock_name', val || null) }}
                      />
                    </div>
                  )}
                  {t.additional_info && Object.entries(t.additional_info).map(([key, val]) => (
                    <div key={key} className="text-[11px]">
                      <span className="text-gray-400">{key}：</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        val === '要' || val === '移管' ? 'bg-blue-50 text-blue-700' :
                        val === '不要' ? 'bg-gray-100 text-gray-500' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Inline add form for trust banks */}
          {showTrustForm && (
            <InlineAddForm
              title="信託銀行を追加"
              form={trustForm}
              setForm={setTrustForm}
              onSubmit={() => handleAddFinancial('信託銀行', trustForm, () => setTrustForm({ institution_name: '', branch_name: '' }), () => setShowTrustForm(false))}
              onCancel={() => setShowTrustForm(false)}
            />
          )}
        </Section>
      </div>

      {/* Sidebar: asset summary */}
      <div className="space-y-3.5">
        <Section title="資産サマリー" icon="💰">
          <QIRow label="資産合計概算">
            <InlineEdit
              value={caseData.total_asset_estimate}
              displayValue={
                <span className="font-mono font-medium text-gray-700">
                  {caseData.total_asset_estimate ? `¥${caseData.total_asset_estimate.toLocaleString()}` : '未設定'}
                </span>
              }
              type="number"
              onSave={async (val) => { await updateCase('total_asset_estimate', val ? Number(val) : null) }}
            />
          </QIRow>
          <QIRow label="相続税申告">
            <InlineEdit
              value={caseData.tax_filing_required}
              displayValue={
                caseData.tax_filing_required ? (
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    caseData.tax_filing_required === '要'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : caseData.tax_filing_required === '不要'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {caseData.tax_filing_required}
                  </span>
                ) : (
                  <span className="text-gray-400">未設定</span>
                )
              }
              type="select"
              options={[
                { value: '要', label: '要' },
                { value: '不要', label: '不要' },
                { value: '確認中', label: '確認中' },
              ]}
              onSave={async (val) => { await updateCase('tax_filing_required', val || '確認中') }}
            />
          </QIRow>
          <QIRow label="申告期限">
            <InlineEdit
              value={caseData.tax_filing_deadline}
              displayValue={
                <span className={`font-mono ${caseData.tax_filing_deadline ? 'text-amber-600' : 'text-gray-400'}`}>
                  {caseData.tax_filing_deadline ?? '未設定'}
                </span>
              }
              type="date"
              onSave={async (val) => { await updateCase('tax_filing_deadline', val || null) }}
            />
          </QIRow>
        </Section>
      </div>
    </div>
  )
}

/* ── Shared sub-components ── */

function Section({ title, icon, children, onEdit, actionLabel, onAction }: {
  title: string
  icon: string
  children: React.ReactNode
  onEdit?: () => void
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900 flex-1">{title}</h3>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition"
          >
            + {actionLabel}
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition"
          >
            編集
          </button>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function FieldGrid({ children, cols }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={`grid gap-0 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {children}
    </div>
  )
}

function QIRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-b-0 text-xs">
      <span className="text-gray-500">{label}</span>
      {children}
    </div>
  )
}

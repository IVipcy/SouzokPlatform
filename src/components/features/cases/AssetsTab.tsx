'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { CaseRow, RealEstatePropertyRow, FinancialAssetRow } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
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
  LIFE_INSURANCE_PROPOSAL_OPTIONS,
  LIFE_INSURANCE_TYPES,
  SELLING_INTENTIONS,
  OCCUPANCY_STATUSES,
  NAMEYOSE_TARGETS,
  PROPERTY_RANKS,
  DISSOLUTION_STATUSES,
  PASSBOOK_STATUSES,
  PROPERTY_EVALUATION_METHODS,
  REAL_ESTATE_APPRAISAL_STATUSES,
  FINANCIAL_SURVEY_START_CONDITIONS,
  INVESTIGATION_DOCUMENTS,
  INVENTORY_CATEGORIES,
  ODD_LOT_HANDLING_OPTIONS,
  UNCLAIMED_DIVIDEND_OPTIONS,
} from '@/lib/constants'
import { InlineMultiSelect } from '@/components/ui/InlineFields'
import CreatePropertyForm from './CreatePropertyForm'
import CreateFinancialAssetForm from './CreateFinancialAssetForm'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
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
  const composingRef = useRef(false)
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
      showToast('保存しました', 'success')
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME合成中はEnterで確定しない
    if (composingRef.current) return
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
          className="border border-brand-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-brand-50 min-w-[80px]"
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
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onBlur={() => { if (!composingRef.current) commit() }}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        className="border border-brand-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-brand-50 w-full max-w-[200px]"
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(String(value ?? '')); setEditing(true) }}
      className="group/ie cursor-pointer inline-flex items-center gap-1 rounded px-0.5 -mx-0.5 hover:bg-brand-50 transition min-h-[20px]"
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
      <span className="bg-gray-100 text-gray-400 border border-gray-200 px-2 py-0.5 rounded text-[12px] font-semibold">
        保存中...
      </span>
    )
  }

  return value ? (
    <span
      onClick={handleClick}
      className={`bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[12px] font-semibold ${base}`}
      title={onToggle ? 'クリックで切替' : undefined}
    >
      ✓ あり
    </span>
  ) : (
    <span
      onClick={handleClick}
      className={`bg-gray-50 text-gray-400 border border-gray-200 px-2 py-0.5 rounded text-[12px] font-semibold ${base}`}
      title={onToggle ? 'クリックで切替' : undefined}
    >
      なし
    </span>
  )
}

export default function AssetsTab({ caseData, properties, financialAssets, onRefresh, patchCase }: Props) {
  const [showPropertyForm, setShowPropertyForm] = useState(false)
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [showSecuritiesForm, setShowSecuritiesForm] = useState(false)
  const [showTrustForm, setShowTrustForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const deposits = financialAssets.filter(a => a.asset_type === '預貯金')
  const securities = financialAssets.filter(a => a.asset_type === '証券')
  const trustBanks = financialAssets.filter(a => a.asset_type === '信託銀行')

  /* ── Supabase update helpers ── */

  async function updateCase(field: string, value: unknown) {
    await patchCase({ [field]: value } as Partial<CaseRow>)
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
    <div className="space-y-3.5">
        {/* 相続税申告は「紹介」タブに移動 */}

        {/* 財産調査全般 */}
        <SharedSection title="財産調査" icon="🔍">
          <SharedFieldGrid>
            <InlineSelect
              label="財産調査開始条件"
              value={caseData.financial_survey_start_condition}
              options={[...FINANCIAL_SURVEY_START_CONDITIONS]}
              onSave={v => saveCaseFieldStr('financial_survey_start_condition', v)}
              fullWidth
            />
            <InlineSelect
              label="財産調査使用書類"
              value={caseData.investigation_document}
              options={[...INVESTIGATION_DOCUMENTS]}
              onSave={v => saveCaseFieldStr('investigation_document', v)}
              fullWidth
            />
          </SharedFieldGrid>
          <div className="mt-2">
            <InlineMultiSelect
              label="財産目録 記載範囲"
              value={caseData.inventory_categories}
              options={[...INVENTORY_CATEGORIES]}
              onSave={v => updateCase('inventory_categories', v.length > 0 ? v : null)}
              fullWidth
            />
          </div>
        </SharedSection>

        {/* Real estate */}
        <Section
          title="不動産"
          icon="🏠"
          actionLabel={showPropertyForm ? '閉じる' : '追加'}
          onAction={() => setShowPropertyForm(v => !v)}
        >
          {/* 評価ランクも査定対応状況も物件単位に移行（各物件の行に表示） */}

          {/* Property entries */}
          {properties.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-4 mt-2 border-t border-gray-50">
              不動産情報が登録されていません
            </div>
          )}
          {properties.map(p => (
            <div key={p.id} className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="text-[13px] font-semibold text-gray-700 flex-1 min-w-[120px]">
                  <InlineEdit
                    value={p.property_type}
                    placeholder="種別未設定"
                    onSave={async (val) => { await updateProperty(p.id, 'property_type', val || null) }}
                  />
                </div>

                {/* 査定対応状況 */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-gray-400">査定:</span>
                  <select
                    value={p.appraisal_status ?? ''}
                    onChange={e => updateProperty(p.id, 'appraisal_status', e.target.value || null)}
                    className={`px-1.5 py-0.5 text-[11px] font-semibold rounded border outline-none cursor-pointer ${
                      p.appraisal_status === '完了'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : p.appraisal_status === '対応中'
                          ? 'bg-brand-50 text-brand-700 border-brand-200'
                          : p.appraisal_status === '不要'
                            ? 'bg-gray-100 text-gray-600 border-gray-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    <option value="">未設定</option>
                    {REAL_ESTATE_APPRAISAL_STATUSES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* 評価ランク */}
                <div className="flex items-center gap-0.5">
                  <span className="text-[11px] text-gray-400 mr-0.5">ランク:</span>
                  {PROPERTY_RANKS.map(r => {
                    const active = (p.rank ?? '確認中') === r
                    return (
                      <button
                        key={r}
                        onClick={() => updateProperty(p.id, 'rank', r)}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded border transition ${
                          active
                            ? r === '確認中'
                              ? 'bg-gray-100 text-gray-600 border-gray-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300'
                        }`}
                        title={`評価ランクを ${r} に設定`}
                      >
                        {r}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => handleDeleteProperty(p.id)}
                  className="text-[12px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
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
                    type="select"
                    options={OCCUPANCY_STATUSES.map(o => ({ value: o, label: o }))}
                    onSave={async (val) => { await updateProperty(p.id, 'resident_status', val || null) }}
                  />
                </Field>
                <Field label="エリア評価">
                  <InlineEdit
                    value={p.area_evaluation}
                    displayValue={
                      p.area_evaluation ? (
                        <span className="bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded text-[12px] font-semibold">
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
                    type="select"
                    options={SELLING_INTENTIONS.map(o => ({ value: o, label: o }))}
                    displayValue={
                      p.sale_intention ? (
                        <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[12px] font-semibold">
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
                    type="select"
                    options={NAMEYOSE_TARGETS.map(o => ({ value: o, label: o }))}
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
                <Field label="評価方法">
                  <InlineEdit
                    value={p.evaluation_method}
                    type="select"
                    options={PROPERTY_EVALUATION_METHODS.map(o => ({ value: o, label: o }))}
                    onSave={async (val) => { await updateProperty(p.id, 'evaluation_method', val || null) }}
                  />
                </Field>
                <Field label="マンション敷地注意">
                  <BoolTag
                    value={p.is_condo_land}
                    onToggle={async () => { await updateProperty(p.id, 'is_condo_land', !p.is_condo_land) }}
                  />
                </Field>
                <Field label="売却業者名">
                  <InlineEdit
                    value={p.sale_agent_name}
                    onSave={async (val) => { await updateProperty(p.id, 'sale_agent_name', val || null) }}
                  />
                </Field>
                <Field label="売却時期（予定）">
                  <InlineEdit
                    value={p.sale_expected_date}
                    type="date"
                    onSave={async (val) => { await updateProperty(p.id, 'sale_expected_date', val || null) }}
                  />
                </Field>
                <Field label="地積測量図">
                  <BoolTag
                    value={p.has_survey_map}
                    onToggle={async () => { await updateProperty(p.id, 'has_survey_map', !p.has_survey_map) }}
                  />
                </Field>
                <Field label="路線価取得済">
                  <BoolTag
                    value={p.has_route_price}
                    onToggle={async () => { await updateProperty(p.id, 'has_route_price', !p.has_route_price) }}
                  />
                </Field>
              </FieldGrid>
            </div>
          ))}

          {/* 不動産追加フォーム（インライン展開） */}
          {showPropertyForm && (
            <CreatePropertyForm
              caseId={caseData.id}
              onCancel={() => setShowPropertyForm(false)}
              onSaved={onRefresh}
            />
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
                      displayValue={<span className="text-[14px] font-bold text-gray-800">{d.institution_name}</span>}
                      onSave={async (val) => { if (val) await updateFinancialAsset(d.id, 'institution_name', val) }}
                    />
                    <InlineEdit
                      value={d.branch_name}
                      displayValue={<span className="text-[13px] text-gray-400">{d.branch_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'branch_name', val || null) }}
                      placeholder="支店名"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteFinancial(d.id)}
                    className="text-[12px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                  >
                    削除
                  </button>
                </div>
                {d.required_docs && d.required_docs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {d.required_docs.map((doc, i) => (
                      <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                        {doc}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="text-[12px] text-gray-400">
                    現存確認要否：
                    <InlineEdit
                      value={d.existence_check}
                      displayValue={
                        d.existence_check ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            d.existence_check === '要' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'
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
                  <div className="text-[12px] text-gray-400">
                    残高証明基準日：
                    <InlineEdit
                      value={d.balance_cert_date}
                      displayValue={<span className="font-semibold text-gray-600">{d.balance_cert_date ?? '—'}</span>}
                      type="date"
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'balance_cert_date', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    取引履歴期間：
                    <InlineEdit
                      value={d.transaction_history_period}
                      displayValue={
                        d.transaction_history_period ? (
                          <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                            {d.transaction_history_period}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )
                      }
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'transaction_history_period', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    貸金庫有無：
                    <InlineEdit
                      value={d.safe_deposit_box}
                      displayValue={
                        d.safe_deposit_box ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
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
                  <div className="text-[12px] text-gray-400">
                    解約受注状況：
                    <InlineEdit
                      value={d.dissolution_status}
                      displayValue={
                        d.dissolution_status ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            d.dissolution_status === '受注' ? 'bg-green-50 text-green-700' :
                            d.dissolution_status === '未提案' ? 'bg-gray-100 text-gray-500' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {d.dissolution_status}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )
                      }
                      type="select"
                      options={DISSOLUTION_STATUSES.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'dissolution_status', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    通帳取り扱い：
                    <InlineEdit
                      value={d.passbook_status}
                      displayValue={
                        d.passbook_status ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            d.passbook_status === '紛失' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'
                          }`}>
                            {d.passbook_status}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )
                      }
                      type="select"
                      options={PASSBOOK_STATUSES.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'passbook_status', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    新口座判明日：
                    <InlineEdit
                      value={d.new_account_found_date}
                      displayValue={<span className="font-semibold text-gray-600">{d.new_account_found_date ?? '—'}</span>}
                      type="date"
                      onSave={async (val) => { await updateFinancialAsset(d.id, 'new_account_found_date', val || null) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 預貯金 追加フォーム（インライン展開） */}
          {showDepositForm && (
            <CreateFinancialAssetForm
              caseId={caseData.id}
              kind="預貯金"
              onCancel={() => setShowDepositForm(false)}
              onSaved={onRefresh}
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
                      displayValue={<span className="text-[14px] font-bold text-gray-800">{s.institution_name}</span>}
                      onSave={async (val) => { if (val) await updateFinancialAsset(s.id, 'institution_name', val) }}
                    />
                    <InlineEdit
                      value={s.branch_name}
                      displayValue={<span className="text-[13px] text-gray-400">{s.branch_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(s.id, 'branch_name', val || null) }}
                      placeholder="支店名"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteFinancial(s.id)}
                    className="text-[12px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                  >
                    削除
                  </button>
                </div>
                {s.required_docs && s.required_docs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {s.required_docs.map((doc, i) => (
                      <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                        {doc}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="text-[12px] text-gray-400">
                    ほふり照会：
                    <BoolTag
                      value={s.houri_inquiry}
                      onToggle={async () => { await updateFinancialAsset(s.id, 'houri_inquiry', !s.houri_inquiry) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    端株処理：
                    <InlineEdit
                      value={s.odd_lot_handling}
                      type="select"
                      options={ODD_LOT_HANDLING_OPTIONS.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(s.id, 'odd_lot_handling', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    未受領配当金：
                    <InlineEdit
                      value={s.unclaimed_dividend}
                      type="select"
                      options={UNCLAIMED_DIVIDEND_OPTIONS.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(s.id, 'unclaimed_dividend', val || null) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 証券 追加フォーム（インライン展開） */}
          {showSecuritiesForm && (
            <CreateFinancialAssetForm
              caseId={caseData.id}
              kind="証券"
              onCancel={() => setShowSecuritiesForm(false)}
              onSaved={onRefresh}
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
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <InlineEdit
                      value={t.institution_name}
                      displayValue={<span className="text-[14px] font-bold text-gray-800">{t.institution_name}</span>}
                      onSave={async (val) => { if (val) await updateFinancialAsset(t.id, 'institution_name', val) }}
                    />
                    <InlineEdit
                      value={t.branch_name}
                      displayValue={<span className="text-[13px] text-gray-400">{t.branch_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'branch_name', val || null) }}
                      placeholder="支店名"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteFinancial(t.id)}
                    className="text-[12px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition"
                  >
                    削除
                  </button>
                </div>
                {t.required_docs && t.required_docs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {t.required_docs.map((doc, i) => (
                      <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                        {doc}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="text-[12px] text-gray-400">
                    銘柄名：
                    <InlineEdit
                      value={t.stock_name}
                      displayValue={<span className="font-semibold text-gray-700">{t.stock_name ?? '—'}</span>}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'stock_name', val || null) }}
                      placeholder="銘柄名"
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    現存確認要否：
                    <InlineEdit
                      value={t.existence_check}
                      displayValue={
                        t.existence_check ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${t.existence_check === '要' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                            {t.existence_check}
                          </span>
                        ) : <span className="text-gray-300">—</span>
                      }
                      type="select"
                      options={[{ value: '要', label: '要' }, { value: '不要', label: '不要' }]}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'existence_check', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    残高証明基準日：
                    <InlineEdit
                      value={t.balance_cert_date}
                      displayValue={<span className="font-semibold text-gray-600">{t.balance_cert_date ?? '—'}</span>}
                      type="date"
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'balance_cert_date', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    取引履歴期間：
                    <InlineEdit
                      value={t.transaction_history_period}
                      displayValue={
                        t.transaction_history_period ? (
                          <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[11px] font-semibold">{t.transaction_history_period}</span>
                        ) : <span className="text-gray-300">—</span>
                      }
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'transaction_history_period', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    解約受注状況：
                    <InlineEdit
                      value={t.dissolution_status}
                      displayValue={
                        t.dissolution_status ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            t.dissolution_status === '受注' ? 'bg-green-50 text-green-700' :
                            t.dissolution_status === '未提案' ? 'bg-gray-100 text-gray-500' :
                            'bg-amber-50 text-amber-700'
                          }`}>{t.dissolution_status}</span>
                        ) : <span className="text-gray-300">—</span>
                      }
                      type="select"
                      options={DISSOLUTION_STATUSES.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'dissolution_status', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    貸金庫有無：
                    <InlineEdit
                      value={t.safe_deposit_box}
                      displayValue={
                        t.safe_deposit_box ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${t.safe_deposit_box === '有' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                            {t.safe_deposit_box}
                          </span>
                        ) : <span className="text-gray-300">—</span>
                      }
                      type="select"
                      options={[{ value: '有', label: '有' }, { value: '無', label: '無' }]}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'safe_deposit_box', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    ほふり照会：
                    <BoolTag
                      value={t.houri_inquiry}
                      onToggle={async () => { await updateFinancialAsset(t.id, 'houri_inquiry', !t.houri_inquiry) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    端株処理：
                    <InlineEdit
                      value={t.odd_lot_handling}
                      type="select"
                      options={ODD_LOT_HANDLING_OPTIONS.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'odd_lot_handling', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    未受領配当金：
                    <InlineEdit
                      value={t.unclaimed_dividend}
                      type="select"
                      options={UNCLAIMED_DIVIDEND_OPTIONS.map(o => ({ value: o, label: o }))}
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'unclaimed_dividend', val || null) }}
                    />
                  </div>
                  <div className="text-[12px] text-gray-400">
                    新口座判明日：
                    <InlineEdit
                      value={t.new_account_found_date}
                      displayValue={<span className="font-semibold text-gray-600">{t.new_account_found_date ?? '—'}</span>}
                      type="date"
                      onSave={async (val) => { await updateFinancialAsset(t.id, 'new_account_found_date', val || null) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 信託銀行 追加フォーム（インライン展開） */}
          {showTrustForm && (
            <CreateFinancialAssetForm
              caseId={caseData.id}
              kind="信託銀行"
              onCancel={() => setShowTrustForm(false)}
              onSaved={onRefresh}
            />
          )}
        </Section>

        {/* 生命保険提案（金融資産の下に配置） */}
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
            <InlineSelect
              label="保険種類"
              value={caseData.life_insurance_type}
              options={[...LIFE_INSURANCE_TYPES]}
              onSave={v => saveCaseFieldStr('life_insurance_type', v)}
            />
            <InlineCurrency
              label="生命保険金額"
              value={caseData.life_insurance_amount}
              onSave={v => saveCaseFieldNum('life_insurance_amount', v)}
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
    </div>
  )
}

/* ── Shared sub-components ── */

function Section({ title, icon: _icon, children, onEdit, actionLabel, onAction }: {
  title: string
  icon?: string
  children: React.ReactNode
  onEdit?: () => void
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[13px] font-semibold text-gray-900 flex-1">{title}</h3>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="text-[13px] font-medium text-brand-600 hover:text-brand-700 px-2 py-0.5 rounded hover:bg-brand-50 transition"
          >
            + {actionLabel}
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-[13px] font-medium text-brand-600 hover:text-brand-700 px-2 py-0.5 rounded hover:bg-brand-50 transition"
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
      <div className="text-[12px] font-semibold text-gray-400 tracking-wide">{label}</div>
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

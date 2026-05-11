'use client'

import { useState, useEffect } from 'react'
import { Loader2, Home } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  PROPERTY_TYPES,
  PROPERTY_RANKS,
  OCCUPANCY_STATUSES,
  SELLING_INTENTIONS,
  NAMEYOSE_TARGETS,
  PROPERTY_EVALUATION_METHODS,
} from '@/lib/constants'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  onSaved: () => void
}

const initialForm = () => ({
  property_type: '',
  address: '',
  lot_number: '',
  rank: '確認中' as 'S' | 'A' | 'B' | 'C' | '確認中',
  resident_status: '',
  area_evaluation: '',
  building_age: '',
  sale_intention: '',
  has_title_deed: false,
  has_tax_notice: false,
  has_registry_info: false,
  has_cadastral_map: false,
  has_survey_map: false,
  has_route_price: false,
  name_consolidation_dest: '',
  evaluation_cert_dest: '',
  evaluation_method: '',
  is_condo_land: false,
  sale_agent_name: '',
  sale_expected_date: '',
  notes: '',
})

export default function CreatePropertyModal({ isOpen, onClose, caseId, onSaved }: Props) {
  const [form, setForm] = useState(initialForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) setForm(initialForm())
  }, [isOpen])

  const set = <K extends keyof ReturnType<typeof initialForm>>(key: K, value: ReturnType<typeof initialForm>[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const canSave = !!(form.property_type.trim() || form.address.trim())

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('real_estate_properties').insert({
        case_id: caseId,
        property_type: form.property_type.trim() || null,
        address: form.address.trim() || null,
        lot_number: form.lot_number.trim() || null,
        rank: form.rank,
        resident_status: form.resident_status || null,
        area_evaluation: form.area_evaluation.trim() || null,
        building_age: form.building_age ? Number(form.building_age) : null,
        sale_intention: form.sale_intention || null,
        has_title_deed: form.has_title_deed,
        has_tax_notice: form.has_tax_notice,
        has_registry_info: form.has_registry_info,
        has_cadastral_map: form.has_cadastral_map,
        has_survey_map: form.has_survey_map,
        has_route_price: form.has_route_price,
        name_consolidation_dest: form.name_consolidation_dest || null,
        evaluation_cert_dest: form.evaluation_cert_dest.trim() || null,
        evaluation_method: form.evaluation_method || null,
        is_condo_land: form.is_condo_land,
        sale_agent_name: form.sale_agent_name.trim() || null,
        sale_expected_date: form.sale_expected_date || null,
        notes: form.notes.trim() || null,
      })
      if (error) throw error
      showToast('不動産を登録しました', 'success')
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      showToast('登録に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="不動産を追加"
      maxWidth="max-w-3xl"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-800"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Home className="w-3.5 h-3.5" />}
            登録する
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 基本情報 */}
        <Section title="基本情報">
          <Grid2>
            <Field label="物件区分">
              <input
                type="text"
                list="prop-type-options-modal"
                placeholder="戸建 / マンション / 土地 など"
                value={form.property_type}
                onChange={e => set('property_type', e.target.value)}
                disabled={saving}
                autoFocus
                className={inputCls}
              />
              <datalist id="prop-type-options-modal">
                {PROPERTY_TYPES.map(t => <option key={t} value={t} />)}
              </datalist>
            </Field>
            <Field label="評価ランク">
              <div className="flex gap-1">
                {PROPERTY_RANKS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set('rank', r)}
                    disabled={saving}
                    className={`px-3 py-1.5 text-[12px] font-bold rounded border ${
                      form.rank === r
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="所在地（住所）" colSpan={2}>
              <input
                type="text"
                placeholder="例: 横浜市港北区新横浜1-2-3"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
            <Field label="地番（登記簿上の番号）" colSpan={2}>
              <input
                type="text"
                placeholder="例: 港北区新横浜町1234番5"
                value={form.lot_number}
                onChange={e => set('lot_number', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
          </Grid2>
        </Section>

        {/* 物件状況 */}
        <Section title="物件状況">
          <Grid2>
            <Field label="住人状況">
              <Select value={form.resident_status} onChange={v => set('resident_status', v)} options={[...OCCUPANCY_STATUSES]} disabled={saving} />
            </Field>
            <Field label="築年数">
              <input
                type="number"
                placeholder="年"
                value={form.building_age}
                onChange={e => set('building_age', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
            <Field label="エリア評価">
              <input
                type="text"
                placeholder="例: 駅徒歩5分・都心エリア"
                value={form.area_evaluation}
                onChange={e => set('area_evaluation', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
            <Field label="売却意向">
              <Select value={form.sale_intention} onChange={v => set('sale_intention', v)} options={[...SELLING_INTENTIONS]} disabled={saving} />
            </Field>
          </Grid2>
        </Section>

        {/* 売却関連 */}
        <Section title="売却">
          <Grid2>
            <Field label="売却業者名">
              <input
                type="text"
                value={form.sale_agent_name}
                onChange={e => set('sale_agent_name', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
            <Field label="売却時期（予定）">
              <input
                type="date"
                value={form.sale_expected_date}
                onChange={e => set('sale_expected_date', e.target.value)}
                disabled={saving}
                className={inputCls + ' font-mono'}
              />
            </Field>
          </Grid2>
        </Section>

        {/* 書類・登記 */}
        <Section title="書類・登記">
          <Grid2>
            <Field label="名寄せ請求先">
              <Select value={form.name_consolidation_dest} onChange={v => set('name_consolidation_dest', v)} options={[...NAMEYOSE_TARGETS]} disabled={saving} />
            </Field>
            <Field label="評価証明請求先">
              <input
                type="text"
                value={form.evaluation_cert_dest}
                onChange={e => set('evaluation_cert_dest', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
            <Field label="評価方法">
              <Select value={form.evaluation_method} onChange={v => set('evaluation_method', v)} options={[...PROPERTY_EVALUATION_METHODS]} disabled={saving} />
            </Field>
          </Grid2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
            <Check label="権利書" value={form.has_title_deed} onChange={v => set('has_title_deed', v)} />
            <Check label="納税通知書" value={form.has_tax_notice} onChange={v => set('has_tax_notice', v)} />
            <Check label="登記情報取得" value={form.has_registry_info} onChange={v => set('has_registry_info', v)} />
            <Check label="公図取得" value={form.has_cadastral_map} onChange={v => set('has_cadastral_map', v)} />
            <Check label="地積測量図" value={form.has_survey_map} onChange={v => set('has_survey_map', v)} />
            <Check label="路線価取得済" value={form.has_route_price} onChange={v => set('has_route_price', v)} />
            <Check label="マンション敷地注意" value={form.is_condo_land} onChange={v => set('is_condo_land', v)} />
          </div>
        </Section>

        {/* メモ */}
        <Section title="メモ">
          <textarea
            placeholder="物件についての補足など"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            disabled={saving}
            rows={2}
            className={inputCls + ' resize-y'}
          />
        </Section>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────
const inputCls = 'w-full px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h4 className="text-[13px] font-semibold text-gray-900">{title}</h4>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>
}

function Field({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={inputCls + ' bg-white'}
    >
      <option value="">選択してください</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 px-2.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  )
}

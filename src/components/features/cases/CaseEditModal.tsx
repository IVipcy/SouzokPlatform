'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { CASE_STATUSES } from '@/lib/constants'
import type { CaseRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  onSaved: () => void
}

const PROCEDURE_OPTIONS = ['手続一式', '登記', '遺産分割協議書のみ', '相続人調査のみ']
const SERVICE_OPTIONS = ['相続税申告', '不動産売却', '不動産鑑定', '保険請求代行']
const DIFFICULTY_OPTIONS = ['易', '普', '難'] as const
const TAX_OPTIONS = ['要', '不要', '確認中'] as const
const RANK_OPTIONS = ['S', 'A', 'B', 'C', '確認中'] as const

export default function CaseEditModal({ isOpen, onClose, caseData, onSaved }: Props) {
  const [form, setForm] = useState({
    deal_name: caseData.deal_name,
    status: caseData.status,
    difficulty: caseData.difficulty ?? '普',
    procedure_type: caseData.procedure_type ?? [],
    additional_services: caseData.additional_services ?? [],
    tax_filing_required: caseData.tax_filing_required,
    tax_filing_deadline: caseData.tax_filing_deadline ?? '',
    property_rank: caseData.property_rank ?? '確認中',
    total_asset_estimate: caseData.total_asset_estimate ?? 0,
    order_date: caseData.order_date ?? '',
    completion_date: caseData.completion_date ?? '',
    deceased_name: caseData.deceased_name ?? '',
    date_of_death: caseData.date_of_death ?? '',
    notes: caseData.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.deal_name.trim()) {
      setError('案件名は必須です')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('cases')
      .update({
        deal_name: form.deal_name.trim(),
        status: form.status,
        difficulty: form.difficulty,
        procedure_type: form.procedure_type,
        additional_services: form.additional_services,
        tax_filing_required: form.tax_filing_required,
        tax_filing_deadline: form.tax_filing_deadline || null,
        property_rank: form.property_rank,
        total_asset_estimate: form.total_asset_estimate || null,
        order_date: form.order_date || null,
        completion_date: form.completion_date || null,
        deceased_name: form.deceased_name.trim() || null,
        date_of_death: form.date_of_death || null,
        notes: form.notes.trim() || null,
      })
      .eq('id', caseData.id)

    setSaving(false)

    if (dbError) {
      setError(`保存に失敗しました: ${dbError.message}`)
      return
    }

    onSaved()
    onClose()
  }

  const toggleArrayItem = (field: 'procedure_type' | 'additional_services', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item],
    }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="案件編集"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {/* 案件名 */}
        <FormField label="案件名" required>
          <input
            type="text"
            value={form.deal_name}
            onChange={e => setForm(p => ({ ...p, deal_name: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          {/* ステータス */}
          <FormField label="ステータス">
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {CASE_STATUSES.map(s => (
                <option key={s.key} value={s.key}>{s.key}</option>
              ))}
            </select>
          </FormField>

          {/* 難易度 */}
          <FormField label="難易度">
            <div className="flex gap-2">
              {DIFFICULTY_OPTIONS.map(d => (
                <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="difficulty"
                    value={d}
                    checked={form.difficulty === d}
                    onChange={() => setForm(p => ({ ...p, difficulty: d }))}
                    className="accent-blue-600"
                  />
                  {d}
                </label>
              ))}
            </div>
          </FormField>
        </div>

        {/* 被相続人 */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="被相続人名">
            <input
              type="text"
              value={form.deceased_name}
              onChange={e => setForm(p => ({ ...p, deceased_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
          <FormField label="相続開始日">
            <input
              type="date"
              value={form.date_of_death}
              onChange={e => setForm(p => ({ ...p, date_of_death: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
        </div>

        {/* 手続区分 */}
        <FormField label="手続区分">
          <div className="flex flex-wrap gap-2">
            {PROCEDURE_OPTIONS.map(opt => (
              <label
                key={opt}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                  form.procedure_type.includes(opt)
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.procedure_type.includes(opt)}
                  onChange={() => toggleArrayItem('procedure_type', opt)}
                  className="hidden"
                />
                {opt}
              </label>
            ))}
          </div>
        </FormField>

        {/* 付帯サービス */}
        <FormField label="付帯サービス">
          <div className="flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map(opt => (
              <label
                key={opt}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                  form.additional_services.includes(opt)
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.additional_services.includes(opt)}
                  onChange={() => toggleArrayItem('additional_services', opt)}
                  className="hidden"
                />
                {opt}
              </label>
            ))}
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          {/* 相続税 */}
          <FormField label="相続税申告">
            <div className="flex gap-2">
              {TAX_OPTIONS.map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="tax"
                    value={t}
                    checked={form.tax_filing_required === t}
                    onChange={() => setForm(p => ({ ...p, tax_filing_required: t }))}
                    className="accent-blue-600"
                  />
                  {t}
                </label>
              ))}
            </div>
          </FormField>

          {/* 不動産ランク */}
          <FormField label="不動産ランク">
            <select
              value={form.property_rank}
              onChange={e => setForm(p => ({ ...p, property_rank: e.target.value as typeof form.property_rank }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {RANK_OPTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="資産概算（円）">
            <input
              type="number"
              value={form.total_asset_estimate}
              onChange={e => setForm(p => ({ ...p, total_asset_estimate: Number(e.target.value) }))}
              min={0}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
          <FormField label="依頼日">
            <input
              type="date"
              value={form.order_date}
              onChange={e => setForm(p => ({ ...p, order_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
          <FormField label="完了予定日">
            <input
              type="date"
              value={form.completion_date}
              onChange={e => setForm(p => ({ ...p, completion_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
        </div>

        <FormField label="申告期限">
          <input
            type="date"
            value={form.tax_filing_deadline}
            onChange={e => setForm(p => ({ ...p, tax_filing_deadline: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </FormField>

        {/* 備考 */}
        <FormField label="重要事項・備考">
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          />
        </FormField>
      </form>
    </Modal>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

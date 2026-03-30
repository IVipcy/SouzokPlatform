'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import type { CaseRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  onSaved: () => void
}

export default function EditAssetsModal({ isOpen, onClose, caseData, onSaved }: Props) {
  const [form, setForm] = useState({
    total_asset_estimate: '',
    property_rank: '確認中' as string,
    tax_filing_required: '確認中' as string,
    tax_filing_deadline: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setForm({
        total_asset_estimate: caseData.total_asset_estimate ? String(caseData.total_asset_estimate) : '',
        property_rank: caseData.property_rank ?? '確認中',
        tax_filing_required: caseData.tax_filing_required ?? '確認中',
        tax_filing_deadline: caseData.tax_filing_deadline ?? '',
      })
      setError('')
    }
  }, [isOpen, caseData])

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    const supabase = createClient()

    const { error: updateErr } = await supabase.from('cases').update({
      total_asset_estimate: form.total_asset_estimate ? Number(form.total_asset_estimate) : null,
      property_rank: form.property_rank,
      tax_filing_required: form.tax_filing_required,
      tax_filing_deadline: form.tax_filing_deadline || null,
    }).eq('id', caseData.id)

    if (updateErr) {
      setError(`更新に失敗しました: ${updateErr.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="資産情報の編集"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '保存する'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Total asset estimate */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">資産合計概算</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
            <input
              type="number"
              value={form.total_asset_estimate}
              onChange={e => setForm(p => ({ ...p, total_asset_estimate: e.target.value }))}
              placeholder="0"
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Property rank */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">不動産ランク</label>
          <div className="flex gap-1.5">
            {['S', 'A', 'B', 'C', '確認中'].map(rank => (
              <button
                key={rank}
                onClick={() => setForm(p => ({ ...p, property_rank: rank }))}
                className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                  form.property_rank === rank
                    ? rank === '確認中'
                      ? 'ring-2 ring-blue-400 ring-offset-1 border-amber-200 bg-amber-50 text-amber-700'
                      : 'ring-2 ring-blue-400 ring-offset-1 border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                }`}
              >
                {rank}
              </button>
            ))}
          </div>
        </div>

        {/* Tax filing required */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">相続税申告</label>
          <div className="flex gap-1.5">
            {['要', '不要', '確認中'].map(v => (
              <button
                key={v}
                onClick={() => setForm(p => ({ ...p, tax_filing_required: v }))}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                  form.tax_filing_required === v
                    ? v === '要'
                      ? 'ring-2 ring-blue-400 ring-offset-1 border-red-200 bg-red-50 text-red-700'
                      : v === '不要'
                        ? 'ring-2 ring-blue-400 ring-offset-1 border-green-200 bg-green-50 text-green-700'
                        : 'ring-2 ring-blue-400 ring-offset-1 border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Tax filing deadline */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">申告期限</label>
          <input
            type="date"
            value={form.tax_filing_deadline}
            onChange={e => setForm(p => ({ ...p, tax_filing_deadline: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>
    </Modal>
  )
}

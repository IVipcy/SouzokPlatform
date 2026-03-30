'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export default function CreateCaseModal({ isOpen, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    case_number: '',
    deal_name: '',
    deceased_name: '',
    date_of_death: '',
    difficulty: '普' as string,
    client_name: '',
    client_phone: '',
    client_email: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.deal_name.trim()) {
      setError('案件名は必須です')
      return
    }
    if (!form.case_number.trim()) {
      setError('管理番号は必須です')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()

    // Create client first if name provided
    let clientId: string | null = null
    if (form.client_name.trim()) {
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name: form.client_name.trim(),
          phone: form.client_phone.trim() || null,
          email: form.client_email.trim() || null,
        })
        .select('id')
        .single()

      if (clientErr) {
        setError(`顧客作成に失敗: ${clientErr.message}`)
        setSaving(false)
        return
      }
      clientId = client.id
    }

    // Create case
    const { error: caseErr } = await supabase
      .from('cases')
      .insert({
        case_number: form.case_number.trim(),
        deal_name: form.deal_name.trim(),
        deceased_name: form.deceased_name.trim() || null,
        date_of_death: form.date_of_death || null,
        difficulty: form.difficulty,
        client_id: clientId,
        status: '架電案件化',
      })

    setSaving(false)

    if (caseErr) {
      setError(`案件作成に失敗: ${caseErr.message}`)
      return
    }

    setForm({ case_number: '', deal_name: '', deceased_name: '', date_of_death: '', difficulty: '普', client_name: '', client_phone: '', client_email: '' })
    onSaved()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="＋ 新規案件登録"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '作成中...' : '作成'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="管理番号" required>
            <input
              type="text"
              value={form.case_number}
              onChange={e => setForm(p => ({ ...p, case_number: e.target.value }))}
              placeholder="R7-A00129"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
          <FormField label="難易度">
            <div className="flex gap-2 pt-1">
              {(['易', '普', '難'] as const).map(d => (
                <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="diff" value={d} checked={form.difficulty === d} onChange={() => setForm(p => ({ ...p, difficulty: d }))} className="accent-blue-600" />
                  {d}
                </label>
              ))}
            </div>
          </FormField>
        </div>

        <FormField label="案件名（依頼者名）" required>
          <input
            type="text"
            value={form.deal_name}
            onChange={e => setForm(p => ({ ...p, deal_name: e.target.value }))}
            placeholder="山田 花子"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="被相続人名">
            <input
              type="text"
              value={form.deceased_name}
              onChange={e => setForm(p => ({ ...p, deceased_name: e.target.value }))}
              placeholder="山田 太郎"
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

        <div className="border-t border-gray-100 pt-3 mt-3">
          <p className="text-[11px] font-semibold text-gray-400 mb-2">依頼者情報（任意）</p>
          <FormField label="依頼者氏名">
            <input
              type="text"
              value={form.client_name}
              onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <FormField label="電話番号">
              <input
                type="tel"
                value={form.client_phone}
                onChange={e => setForm(p => ({ ...p, client_phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </FormField>
            <FormField label="メール">
              <input
                type="email"
                value={form.client_email}
                onChange={e => setForm(p => ({ ...p, client_email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </FormField>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

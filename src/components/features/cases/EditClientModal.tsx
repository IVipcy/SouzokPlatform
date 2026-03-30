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

export default function EditClientModal({ isOpen, onClose, caseData, onSaved }: Props) {
  const client = caseData.clients

  const [form, setForm] = useState({
    name: '',
    furigana: '',
    postal_code: '',
    address: '',
    phone: '',
    email: '',
    relationship_to_deceased: '',
    deceased_name: '',
    date_of_death: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: client?.name ?? '',
        furigana: client?.furigana ?? '',
        postal_code: client?.postal_code ?? '',
        address: client?.address ?? '',
        phone: client?.phone ?? '',
        email: client?.email ?? '',
        relationship_to_deceased: client?.relationship_to_deceased ?? '',
        deceased_name: caseData.deceased_name ?? '',
        date_of_death: caseData.date_of_death ?? '',
      })
      setError('')
    }
  }, [isOpen, client, caseData])

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('依頼者名は必須です'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    // Update client
    if (client) {
      const { error: clientErr } = await supabase.from('clients').update({
        name: form.name.trim(),
        furigana: form.furigana || null,
        postal_code: form.postal_code || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        relationship_to_deceased: form.relationship_to_deceased || null,
      }).eq('id', client.id)

      if (clientErr) {
        setError(`更新に失敗しました: ${clientErr.message}`)
        setSaving(false)
        return
      }
    }

    // Update case deceased info
    const { error: caseErr } = await supabase.from('cases').update({
      deceased_name: form.deceased_name || null,
      date_of_death: form.date_of_death || null,
    }).eq('id', caseData.id)

    if (caseErr) {
      setError(`更新に失敗しました: ${caseErr.message}`)
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
      title="依頼者・被相続人情報の編集"
      maxWidth="max-w-xl"
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
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Client section */}
        <div>
          <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2">👤 依頼者情報</div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FormField label="氏名 *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
              <FormField label="ふりがな" value={form.furigana} onChange={v => setForm(p => ({ ...p, furigana: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="郵便番号" value={form.postal_code} onChange={v => setForm(p => ({ ...p, postal_code: v }))} placeholder="123-4567" />
              <FormField label="続柄" value={form.relationship_to_deceased} onChange={v => setForm(p => ({ ...p, relationship_to_deceased: v }))} placeholder="長男、配偶者など" />
            </div>
            <FormField label="住所" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} />
            <div className="grid grid-cols-2 gap-2">
              <FormField label="電話番号" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
              <FormField label="メール" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} type="email" />
            </div>
          </div>
        </div>

        {/* Deceased section */}
        <div>
          <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2">⚰️ 被相続人情報</div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="氏名" value={form.deceased_name} onChange={v => setForm(p => ({ ...p, deceased_name: v }))} />
            <FormField label="相続開始日" value={form.date_of_death} onChange={v => setForm(p => ({ ...p, date_of_death: v }))} type="date" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

function FormField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      />
    </div>
  )
}

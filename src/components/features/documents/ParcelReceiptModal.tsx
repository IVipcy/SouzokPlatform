'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { LOCATIONS } from '@/lib/constants'
import { notifyParcelArrival } from '@/lib/arrivalParcel'

type CaseLite = { id: string; case_number: string; deal_name: string; status: string }

// 受注/管理宛の郵送物を「一式（封筒単位）」で仮登録し、到着連絡（アラート＋開封タスク）を飛ばす。
// 中身は開けない。開封して中身をアイテムに紐付けし直すのは、受注/管理担当が後で行う。
export default function ParcelReceiptModal({ isOpen, onClose, cases, defaultLocation, onSaved }: {
  isOpen: boolean
  onClose: () => void
  cases: CaseLite[]
  defaultLocation?: string | null
  onSaved: () => void
}) {
  const [caseId, setCaseId] = useState('')
  const [location, setLocation] = useState(defaultLocation ?? '')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!caseId) { showToast('案件を選んでください', 'error'); return }
    if (!location) { showToast('拠点を選んでください', 'error'); return }
    setSaving(true)
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const { data: rec, error } = await supabase.from('document_receipts')
      .insert({ case_id: caseId, received_date: today, location, is_parcel: true })
      .select('id').single()
    if (error || !rec) { setSaving(false); showToast(`登録に失敗: ${error?.message ?? ''}`, 'error'); return }
    const receiptId = (rec as { id: string }).id
    await supabase.from('document_receipt_items').insert({ receipt_id: receiptId, item_name: '郵送物一式（未開封）', received_from: memo.trim() || null, sort_order: 0 })
    await notifyParcelArrival(receiptId)
    setSaving(false)
    showToast('郵送物一式を受付け、受注/管理担当へ到着連絡しました', 'success')
    setCaseId(''); setMemo('')
    onSaved(); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="郵送物一式で受付（受注/管理宛）" maxWidth="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button><Button variant="primary" onClick={submit} disabled={saving}>{saving ? '登録中…' : '受付けて到着連絡'}</Button></>}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-gray-500 leading-relaxed">中身は開けずに、封筒（郵送物）一式として仮登録します。登録すると<strong>受注担当・管理担当に「到着物あり」アラートと開封タスク</strong>が飛びます。</p>
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">案件 <span className="text-red-500">*</span></label>
          <select value={caseId} onChange={e => setCaseId(e.target.value)} className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-md outline-none focus:border-brand-400 bg-white">
            <option value="">選択してください</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">拠点 <span className="text-red-500">*</span></label>
          <div className="flex gap-1.5 flex-wrap">
            {LOCATIONS.map(l => (
              <button key={l} type="button" onClick={() => setLocation(l)} className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${location === l ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">メモ（差出人・種別など任意）</label>
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="例：〇〇市役所からのレターパック" className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-md outline-none focus:border-brand-400" />
        </div>
      </div>
    </Modal>
  )
}

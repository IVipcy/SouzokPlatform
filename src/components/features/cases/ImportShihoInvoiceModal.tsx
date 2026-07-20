'use client'

// 司法（司法書士）の請求は別システム「相続の力」で発行するため、このシステムには金額が無い。
// 発行済みの請求書の金額を手入力で取り込み、確定請求レコードを「入金待ち」で登録する。
// これで入金CSV突合・確定売上表（司法）に反映される。PDF原本は案件フォルダへ別途アップ運用。
import { useState } from 'react'
import Link from 'next/link'
import { FileUp, ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow } from '@/types'

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`
const inp = 'w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>{children}</div>
}

export default function ImportShihoInvoiceModal({ isOpen, onClose, caseData, onSaved }: {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [issuedDate, setIssuedDate] = useState(today)
  const [fee, setFee] = useState<number | ''>('')
  const [expense, setExpense] = useState<number | ''>('')
  const [advance, setAdvance] = useState<number | ''>('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [saving, setSaving] = useState(false)

  const feeN = Number(fee) || 0, expN = Number(expense) || 0, advN = Number(advance) || 0
  const billAmount = feeN + expN - advN
  const canSave = !!issuedDate && (feeN > 0 || expN > 0) && billAmount >= 0

  const submit = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('invoices').insert({
      case_id: caseData.id, invoice_type: '確定請求', firm_type: 'shiho',
      amount: billAmount, fee_amount: feeN, expenses_amount: expN, advance_deduction: advN,
      status: '入金待ち', issued_date: issuedDate,
      invoice_number: invoiceNo.trim() || null,
      notes: '相続の力で発行（取り込み）',
    })
    setSaving(false)
    if (error) { showToast(`取り込みに失敗しました: ${error.message}`, 'error'); return }
    showToast('司法の請求を取り込みました（入金待ち）', 'success')
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="司法請求を取り込む（相続の力）"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={!canSave || saving}>{saving ? '取り込み中...' : '取り込む（入金待ちへ）'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] text-gray-600 leading-relaxed">
          相続の力で発行した司法の請求書の金額を入れて取り込みます。取り込むと入金管理（CSV突合）・確定売上表（司法）に反映されます。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="請求日"><input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className={inp} /></Field>
          <Field label="請求番号（任意）"><input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="相続の力の番号" className={inp} /></Field>
          <Field label="報酬（司法・税込）"><input type="number" min={0} value={fee} onChange={e => setFee(e.target.value === '' ? '' : Number(e.target.value))} className={inp} /></Field>
          <Field label="立替実費"><input type="number" min={0} value={expense} onChange={e => setExpense(e.target.value === '' ? '' : Number(e.target.value))} className={inp} /></Field>
          <Field label="前受金（差引・あれば）"><input type="number" min={0} value={advance} onChange={e => setAdvance(e.target.value === '' ? '' : Number(e.target.value))} className={inp} /></Field>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
          <span className="text-[12px] text-brand-700 font-medium">請求金額（報酬＋立替−前受金）</span>
          <span className="text-[15px] font-bold text-brand-800 tabular-nums">{yen(billAmount)}</span>
        </div>
        <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2">
          <FileUp className="w-4 h-4 text-amber-600 flex-none mt-0.5" strokeWidth={2} />
          <div className="text-[11.5px] text-amber-800 leading-relaxed">
            相続の力のPDF原本は <Link href={`/cases/${caseData.id}?tab=docs`} className="underline font-medium inline-flex items-center gap-0.5">案件フォルダ<ExternalLink className="w-3 h-3" /></Link> にアップしておいてください（控え）。
          </div>
        </div>
      </div>
    </Modal>
  )
}

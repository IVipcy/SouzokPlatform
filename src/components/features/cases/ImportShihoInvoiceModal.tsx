'use client'

// 司法（司法書士）の請求は別システム「相続の力」で発行するため、PDFの正はあちら。
// 金額は請求タブの既存欄（報酬内訳＝reward_items、立替＝billing_expense_items）に入れておき、
// このモーダルはExcelを作らずに確定請求レコードを「作成済」で登録するだけ（＝確定請求済にする）。
// 行政の請求書生成と同じく「作成済」で作り、請求ステータス→入金待ちは請求・入金タブで行う。
// 入力するのは請求日だけ。金額は入力済みから自動。入金CSV突合・売上表・精算書(司法)へ流れる。
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileUp, ExternalLink, CheckCircle2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow } from '@/types'

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`

function AmountRow({ label, value, minus = false }: { label: string; value: number; minus?: boolean }) {
  return (
    <div className="flex items-center justify-between px-1 py-1.5 border-b border-gray-100 last:border-b-0">
      <span className="text-[12px] text-gray-600">{label}</span>
      <span className={`text-[13px] font-mono ${minus ? 'text-rose-600' : 'text-gray-800'}`}>{minus ? '−' : ''}{yen(value)}</span>
    </div>
  )
}

export default function ImportShihoInvoiceModal({ isOpen, onClose, caseData, onSaved }: {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [issuedDate, setIssuedDate] = useState(today)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [expense, setExpense] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // 報酬（司法）＝確定報酬・前受金（司法）は cases に維持済み。立替（司法）だけ billing_expense_items から集計。
  const fee = caseData.fee_judicial ?? 0
  const advance = caseData.advance_payment_judicial ?? 0

  useEffect(() => {
    const supabase = createClient()
    supabase.from('billing_expense_items').select('amount, shigyo').eq('case_id', caseData.id).then(({ data }) => {
      const sum = ((data ?? []) as Array<{ amount: number | null; shigyo: string | null }>)
        .filter(r => r.shigyo === '司法').reduce((n, r) => n + (r.amount ?? 0), 0)
      setExpense(sum)
      setLoading(false)
    })
  }, [caseData.id])

  const billAmount = fee + expense - advance
  const hasAmount = fee > 0 || expense > 0
  const canSave = !!issuedDate && hasAmount && billAmount >= 0 && !loading

  const submit = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const supabase = createClient()
    // 行政の請求書生成と同じく「作成済」で登録。入金待ちへの移行は請求・入金タブで行う。
    const { data, error } = await supabase.from('invoices').insert({
      case_id: caseData.id, invoice_type: '確定請求', firm_type: 'shiho',
      amount: billAmount, fee_amount: fee, expenses_amount: expense, advance_deduction: advance,
      status: '作成済', issued_date: issuedDate,
      invoice_number: invoiceNo.trim() || null,
      notes: '相続の力で発行（取り込み）',
    }).select('id').single()
    setSaving(false)
    if (error) { showToast(`確定請求済にできませんでした: ${error.message}`, 'error'); return }
    showToast('司法書士の確定請求レコードを作成しました', 'success')
    setSavedId((data as { id: string } | null)?.id ?? '')
    onSaved()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="司法書士：確定請求済にする"
      maxWidth="max-w-md"
      footer={savedId !== null ? (
        <Button variant="primary" onClick={onClose}>閉じる</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={!canSave || saving}>{saving ? '処理中...' : '確定請求済にする'}</Button>
        </>
      )}
    >
      {savedId !== null ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-none mt-0.5" strokeWidth={2} />
            <div className="text-[12.5px] text-emerald-800 leading-relaxed">
              司法書士の<strong>確定請求レコードを作成</strong>しました（作成済）。<br />
              <strong>請求・入金タブ</strong>で請求ステータスを<strong>「入金待ち」</strong>にしてください。
            </div>
          </div>
          <Link
            href={`/billing?case=${caseData.id}${savedId ? `&invoice=${savedId}` : ''}`}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 text-[13px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700"
          >
            請求・入金タブで該当行を開く <ExternalLink className="w-4 h-4" />
          </Link>
          <p className="text-[11.5px] text-gray-500 leading-relaxed">
            相続の力のPDF原本は案件フォルダにアップしておいてください（控え）。
          </p>
        </div>
      ) : (
      <div className="space-y-3">
        <p className="text-[12.5px] text-gray-600 leading-relaxed">
          請求タブの<strong>報酬内訳（司法）・立替実費</strong>に入れた金額から、司法の確定請求を<strong>「作成済」</strong>で登録します（Excelは作りません＝PDFは相続の力）。入金待ちへの変更は請求・入金タブで行います。
        </p>

        {loading ? (
          <div className="py-6 text-center text-[12px] text-gray-400">金額を読み込み中…</div>
        ) : !hasAmount ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-800">
            先に請求タブの「報酬内訳（司法）」または「立替実費」に金額を入力してください。ここに金額が入っていません。
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 px-2 py-1">
            <AmountRow label="報酬（司法・確定報酬）" value={fee} />
            <AmountRow label="立替実費（司法）" value={expense} />
            {advance > 0 && <AmountRow label="前受金（差引）" value={advance} minus />}
            <div className="flex items-center justify-between px-1 py-2 mt-0.5 border-t-2 border-brand-100">
              <span className="text-[12.5px] font-semibold text-brand-700">請求金額</span>
              <span className="text-[16px] font-bold text-brand-800 tabular-nums">{yen(billAmount)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">請求日</label>
            <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">請求番号（任意）</label>
            <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="相続の力の番号" className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400" />
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2">
          <FileUp className="w-4 h-4 text-amber-600 flex-none mt-0.5" strokeWidth={2} />
          <div className="text-[11.5px] text-amber-800 leading-relaxed">
            相続の力のPDF原本は <Link href={`/cases/${caseData.id}?tab=docs`} className="underline font-medium inline-flex items-center gap-0.5">案件フォルダ<ExternalLink className="w-3 h-3" /></Link> にアップしておいてください（控え）。
          </div>
        </div>
      </div>
      )}
    </Modal>
  )
}

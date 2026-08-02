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
  const [fee, setFee] = useState(caseData.fee_judicial ?? 0)  // 司法・確定報酬（OCR反映で更新）
  const [advExpense, setAdvExpense] = useState(0)   // 立替実費（司法・郵送料等）
  const [regTax, setRegTax] = useState(0)           // 登録免許税又は印紙税（司法・報酬内訳から）
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  // OCR読込・反映
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrErr, setOcrErr] = useState('')
  const [ocrItems, setOcrItems] = useState<Array<{ type: string; reward: number; tax: number }> | null>(null)
  const [ocrExpense, setOcrExpense] = useState(0)
  const [reflecting, setReflecting] = useState(false)

  const advance = caseData.advance_payment_judicial ?? 0

  // 請求書画像をOCR → プレビュー
  const onPickFile = async (file: File | null) => {
    if (!file) return
    setOcrErr(''); setOcrItems(null)
    if (!/^image\//.test(file.type)) { setOcrErr('画像（PNG/JPEG）をアップしてください。PDFはスクショ等で画像化してください。'); return }
    setOcrBusy(true)
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
      const resp = await fetch('/api/ocr-shiho-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) })
      const j = await resp.json() as { items?: Array<{ type: string; reward: number; tax: number }>; expense?: number; error?: string }
      if (!resp.ok) { setOcrErr(j.error ?? '読み取りに失敗しました'); return }
      setOcrItems(j.items ?? [])
      setOcrExpense(j.expense ?? 0)
    } catch { setOcrErr('通信に失敗しました') } finally { setOcrBusy(false) }
  }

  // 反映：司法の報酬内訳を差し替え（種別/報酬/登免印紙）＋郵送料等を立替実費に追加。
  const reflect = async () => {
    if (!ocrItems || reflecting) return
    setReflecting(true)
    const supabase = createClient()
    // 既存の司法 報酬内訳を差し替え（重複防止）
    await supabase.from('reward_items').delete().eq('case_id', caseData.id).eq('shigyo', '司法')
    const inserts = ocrItems.map((it, i) => ({ case_id: caseData.id, shigyo: '司法', label: it.type || 'その他', amount: it.reward, registration_tax: it.tax, discount: 0, sort_order: i }))
    if (inserts.length) await supabase.from('reward_items').insert(inserts)
    // 郵送料・システム利用料 → 立替実費（司法）。同名の既存OCR行があれば差し替え。
    await supabase.from('billing_expense_items').delete().eq('case_id', caseData.id).eq('shigyo', '司法').eq('label', '郵送料・システム利用料')
    if (ocrExpense > 0) await supabase.from('billing_expense_items').insert({ case_id: caseData.id, shigyo: '司法', label: '郵送料・システム利用料', amount: ocrExpense, sort_order: 0 })
    // 確定報酬（司法）＝報酬小計 − 割引 を cases.fee_judicial に反映
    const rewardSum = ocrItems.reduce((n, it) => n + it.reward, 0)
    const disc = caseData.reward_discount_judicial ?? 0
    const newFee = Math.max(0, rewardSum - disc)
    await supabase.from('cases').update({ fee_judicial: newFee }).eq('id', caseData.id)
    // 画面反映
    setFee(newFee)
    setRegTax(ocrItems.reduce((n, it) => n + it.tax, 0))
    setAdvExpense(ocrExpense)
    setOcrItems(null)
    setReflecting(false)
    showToast('司法書士請求書を反映しました（報酬・登免印紙・立替実費）', 'success')
    onSaved()
  }

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('billing_expense_items').select('amount, shigyo').eq('case_id', caseData.id),
      supabase.from('reward_items').select('registration_tax, shigyo').eq('case_id', caseData.id),
    ]).then(([expRes, rwRes]) => {
      const adv = ((expRes.data ?? []) as Array<{ amount: number | null; shigyo: string | null }>)
        .filter(r => r.shigyo === '司法').reduce((n, r) => n + (r.amount ?? 0), 0)
      const tax = ((rwRes.data ?? []) as Array<{ registration_tax: number | null; shigyo: string | null }>)
        .filter(r => r.shigyo === '司法').reduce((n, r) => n + (r.registration_tax ?? 0), 0)
      setAdvExpense(adv)
      setRegTax(tax)
      setLoading(false)
    })
  }, [caseData.id])

  const expense = advExpense + regTax  // 司法の実費合計＝立替＋登免/印紙
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
      title="司法書士請求書 読込・反映 / 確定請求"
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
          司法書士（相続の力）の請求書画像を読み込むと、<strong>司法の報酬・登録免許税/印紙税・立替実費</strong>に自動反映できます。その金額で司法の確定請求を<strong>「作成済」</strong>で登録します（Excelは作りません＝PDFは相続の力）。
        </p>

        {/* OCR：司法書士請求書 読込・反映 */}
        <div className="rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2.5 space-y-2">
          <div className="text-[12.5px] font-semibold text-brand-800 flex items-center gap-1.5"><FileUp className="w-4 h-4" strokeWidth={2} />司法書士請求書 読込（OCR）</div>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 cursor-pointer">
            {ocrBusy ? '読み取り中…' : '請求書画像を選ぶ'}
            <input type="file" accept="image/*" className="hidden" disabled={ocrBusy} onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
          </label>
          {ocrErr && <div className="text-[11.5px] text-red-600">{ocrErr}</div>}
          {ocrItems && (
            <div className="bg-white border border-gray-200 rounded-md p-2 space-y-1.5">
              <div className="text-[11px] text-gray-500">読み取り結果（確認して反映）</div>
              <table className="w-full text-[11.5px]">
                <thead><tr className="text-gray-400"><th className="text-left font-medium">種別</th><th className="text-right font-medium">報酬</th><th className="text-right font-medium">登免/印紙</th></tr></thead>
                <tbody>{ocrItems.map((it, i) => (<tr key={i}><td className="text-gray-700 pr-2">{it.type || '—'}</td><td className="text-right font-mono">{yen(it.reward)}</td><td className="text-right font-mono">{yen(it.tax)}</td></tr>))}</tbody>
              </table>
              <div className="text-[11.5px] text-gray-600 flex justify-between border-t border-gray-100 pt-1"><span>郵送料・システム利用料</span><span className="font-mono">{yen(ocrExpense)}</span></div>
              <button type="button" onClick={reflect} disabled={reflecting} className="w-full mt-1 px-3 py-1.5 rounded-md text-[12px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">{reflecting ? '反映中…' : '司法の報酬・登免印紙・立替実費に反映する'}</button>
              <p className="text-[10.5px] text-gray-400">※ 反映すると司法の報酬内訳は読み取り結果で置き換わります。</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-6 text-center text-[12px] text-gray-400">金額を読み込み中…</div>
        ) : !hasAmount ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-800">
            先に請求タブの「報酬内訳（司法）」または「立替実費」に金額を入力してください。ここに金額が入っていません。
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 px-2 py-1">
            <AmountRow label="報酬（司法・確定報酬）" value={fee} />
            <AmountRow label="登録免許税又は印紙税（司法）" value={regTax} />
            <AmountRow label="立替実費（司法・郵送料等）" value={advExpense} />
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

'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import type { InvoiceRow } from '@/types'

type ParsedRow = {
  date: string
  payerName: string
  amount: number
  raw: string
}

type MatchResult = ParsedRow & {
  matchedInvoiceId: string | null
  matchedCaseName: string | null
  matchedInvoiceAmount: number | null
  matchStatus: 'matched' | 'partial' | 'unmatched'
}

type Props = {
  isOpen: boolean
  onClose: () => void
  invoices: (InvoiceRow & { cases?: { deal_name: string; case_number: string; clients?: { name: string } | null } | null; payments?: { amount: number }[] })[]
  onSaved: () => void
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split('\n').filter(l => l.trim())
  const rows: ParsedRow[] = []

  for (const line of lines) {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    // Try to find date, name, amount columns
    // Common bank CSV: date, ..., payer, ..., amount
    let date = ''
    let payerName = ''
    let amount = 0

    for (const col of cols) {
      // Date detection (YYYY/MM/DD or YYYY-MM-DD)
      if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(col) && !date) {
        date = col.replace(/\//g, '-')
        continue
      }
      // Amount detection (numeric)
      const num = parseInt(col.replace(/[,\s円¥]/g, ''), 10)
      if (!isNaN(num) && num > 0 && num > amount) {
        amount = num
        continue
      }
      // Name detection (non-numeric, non-date, longer than 1 char)
      if (col.length > 1 && !/^\d/.test(col) && !date.includes(col)) {
        payerName = col
      }
    }

    if (amount > 0) {
      rows.push({ date, payerName, amount, raw: line })
    }
  }
  return rows
}

function matchPayments(rows: ParsedRow[], invoices: Props['invoices']): MatchResult[] {
  return rows.map(row => {
    // Try to match by amount
    const exactMatch = invoices.find(inv => {
      const paidAmount = inv.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
      const remaining = inv.amount - paidAmount
      return remaining === row.amount && ['前受金請求済', '確定請求済', '一部入金'].includes(inv.status)
    })

    if (exactMatch) {
      return {
        ...row,
        matchedInvoiceId: exactMatch.id,
        matchedCaseName: exactMatch.cases?.deal_name ?? null,
        matchedInvoiceAmount: exactMatch.amount,
        matchStatus: 'matched' as const,
      }
    }

    // Partial match: same client name or similar amount
    const partialMatch = invoices.find(inv => {
      const clientName = inv.cases?.clients?.name ?? ''
      const nameMatch = clientName && row.payerName.includes(clientName)
      return nameMatch && ['前受金請求済', '確定請求済', '一部入金'].includes(inv.status)
    })

    if (partialMatch) {
      return {
        ...row,
        matchedInvoiceId: partialMatch.id,
        matchedCaseName: partialMatch.cases?.deal_name ?? null,
        matchedInvoiceAmount: partialMatch.amount,
        matchStatus: 'partial' as const,
      }
    }

    return {
      ...row,
      matchedInvoiceId: null,
      matchedCaseName: null,
      matchedInvoiceAmount: null,
      matchStatus: 'unmatched' as const,
    }
  })
}

export default function CsvImportModal({ isOpen, onClose, invoices, onSaved }: Props) {
  const [csvText, setCsvText] = useState('')
  const [results, setResults] = useState<MatchResult[]>([])
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvText(text)
    }
    reader.readAsText(file, 'Shift_JIS')
  }

  const handleParse = () => {
    if (!csvText.trim()) { setError('CSVデータを入力またはファイルを選択してください'); return }
    setError('')
    const parsed = parseCSV(csvText)
    if (parsed.length === 0) { setError('入金データが見つかりませんでした'); return }
    const matched = matchPayments(parsed, invoices)
    setResults(matched)
    // Auto-select matched rows
    const autoSelect = new Set<number>()
    matched.forEach((r, i) => { if (r.matchStatus === 'matched') autoSelect.add(i) })
    setSelected(autoSelect)
    setStep('review')
  }

  const handleApply = async () => {
    const toApply = results.filter((_, i) => selected.has(i)).filter(r => r.matchedInvoiceId)
    if (toApply.length === 0) { setError('適用する入金を選択してください'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    for (const row of toApply) {
      // Insert payment
      await supabase.from('payments').insert({
        invoice_id: row.matchedInvoiceId!,
        amount: row.amount,
        payment_date: row.date || new Date().toISOString().split('T')[0],
        payment_method: '銀行振込（CSV取込）',
        notes: `CSV取込: ${row.payerName}`,
      })

      // Update invoice status
      const invoice = invoices.find(inv => inv.id === row.matchedInvoiceId)
      if (invoice) {
        const paidAmount = (invoice.payments?.reduce((s, p) => s + p.amount, 0) ?? 0) + row.amount
        const newStatus = paidAmount >= invoice.amount ? '入金済' : '一部入金'
        await supabase.from('invoices').update({ status: newStatus }).eq('id', invoice.id)
      }
    }

    setSaving(false)
    onSaved()
    // Reset
    setCsvText('')
    setResults([])
    setStep('upload')
    setSelected(new Set())
    onClose()
  }

  const toggleRow = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const matchedCount = useMemo(() => results.filter(r => r.matchStatus === 'matched').length, [results])
  const partialCount = useMemo(() => results.filter(r => r.matchStatus === 'partial').length, [results])

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setStep('upload'); setResults([]); setCsvText(''); setError('') }}
      title="🏦 銀行CSV取込"
      maxWidth="max-w-2xl"
      footer={
        step === 'upload' ? (
          <>
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
            <button onClick={handleParse} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">解析する</button>
          </>
        ) : (
          <>
            <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">戻る</button>
            <button onClick={handleApply} disabled={saving || selected.size === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? '適用中...' : `${selected.size}件の入金を適用`}
            </button>
          </>
        )
      }
    >
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>}

      {step === 'upload' ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">CSVファイル</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 transition">
              <input type="file" accept=".csv" onChange={handleFileLoad} className="hidden" id="csv-upload" />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <div className="text-2xl mb-1 opacity-40">📄</div>
                <div className="text-xs text-gray-400">銀行からダウンロードしたCSVファイルを選択</div>
                <div className="text-[10px] text-gray-300 mt-1">Shift_JIS / UTF-8 対応</div>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">または直接貼り付け</label>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={6}
              placeholder="CSVデータを貼り付けてください..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>
          {csvText && <div className="text-[10px] text-gray-400">{csvText.split('\n').filter(l => l.trim()).length} 行検出</div>}
        </div>
      ) : (
        <div>
          {/* Summary */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-green-600">{matchedCount}</div>
              <div className="text-[10px] text-green-500">完全一致</div>
            </div>
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-600">{partialCount}</div>
              <div className="text-[10px] text-amber-500">名前一致</div>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-gray-500">{results.length - matchedCount - partialCount}</div>
              <div className="text-[10px] text-gray-400">未突合</div>
            </div>
          </div>

          {/* Results table */}
          <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0">
                <tr>
                  <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-left w-8"></th>
                  <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-left">日付</th>
                  <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-left">振込人</th>
                  <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-right">金額</th>
                  <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-left">突合結果</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${selected.has(i) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                    <td className="px-2 py-1.5">
                      {r.matchedInvoiceId && (
                        <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} className="rounded" />
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-gray-600">{r.date || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{r.payerName || '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-medium">¥{r.amount.toLocaleString()}</td>
                    <td className="px-2 py-1.5">
                      {r.matchStatus === 'matched' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-600 text-[10px] font-semibold border border-green-200">
                          ✓ {r.matchedCaseName}
                        </span>
                      ) : r.matchStatus === 'partial' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-semibold border border-amber-200">
                          △ {r.matchedCaseName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">突合なし</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

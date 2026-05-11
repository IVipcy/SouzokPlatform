'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Printer, Save, ArrowLeft, Loader2 } from 'lucide-react'
import { toPng } from 'html-to-image'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { InvoiceRow, CaseRow, ClientRow, ExpenseRow } from '@/types'

type Props = {
  invoice: InvoiceRow & { cases: CaseRow & { clients: ClientRow | null } }
  expenses: ExpenseRow[]
}

export default function InvoicePreviewClient({ invoice, expenses }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [savingDoc, setSavingDoc] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const isFirstView = searchParams.get('firstView') === '1'

  const client = invoice.cases?.clients
  const expensesTotal = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const issuedDate = invoice.issued_date
    ? new Date(invoice.issued_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const invoiceNumber = invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`

  const handlePrint = () => {
    window.print()
  }

  const handleSaveToDocuments = async (silent = false) => {
    if (!sheetRef.current) return
    setSavingDoc(true)
    try {
      const dataUrl = await toPng(sheetRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
      })
      const blob = await (await fetch(dataUrl)).blob()
      const ts = new Date()
      const ymd = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}`
      const path = `${invoice.case_id}/invoice-${invoiceNumber}-${ymd}.png`
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      const docName = `請求書_${invoiceNumber}`
      const { error: dbErr } = await supabase.from('case_documents').insert({
        case_id: invoice.case_id,
        document_name: docName,
        outbound_file_path: path,
        outbound_file_name: `${docName}.png`,
        outbound_file_type: 'PNG',
        outbound_file_bucket: 'documents',
        generated_by: 'system',
      })
      if (dbErr) throw dbErr
      if (!silent) showToast('案件詳細の「書類」タブに保存しました', 'success')
    } catch (e) {
      console.error(e)
      if (!silent) showToast('保存に失敗しました', 'error')
    } finally {
      setSavingDoc(false)
    }
  }

  // 新規発行直後（?firstView=1）は自動的に書類タブに保存
  useEffect(() => {
    if (!isFirstView) return
    const t = setTimeout(() => {
      handleSaveToDocuments(true).then(() => {
        showToast('案件詳細の「書類」タブに自動保存しました', 'success')
        // firstView パラメータを URL から外す（リロード時に再実行しないため）
        router.replace(`/invoices/${invoice.id}/preview`, { scroll: false })
      })
    }, 500) // レンダリングが落ち着くのを待つ
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstView, invoice.id])

  return (
    <div className="bg-gray-100 -m-6 min-h-screen pb-10">
      {/* ツールバー（印刷時は非表示） */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10 print:hidden">
        <Link
          href="/billing"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          請求・入金に戻る
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => handleSaveToDocuments(false)}
            disabled={savingDoc}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md disabled:opacity-50"
          >
            {savingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            書類タブに保存
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            印刷 / PDF保存
          </button>
        </div>
      </div>

      {/* A4 請求書シート */}
      <div className="max-w-[210mm] mx-auto my-6 print:my-0">
        <div
          ref={sheetRef}
          className="bg-white shadow-md print:shadow-none mx-auto px-12 py-10"
          style={{ width: '210mm', minHeight: '297mm' }}
        >
          {/* タイトル */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-[0.4em] text-gray-900 inline-block border-b-4 border-gray-900 pb-1 px-6">
              請　求　書
            </h1>
          </div>

          {/* 宛先 & 日付 */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className="text-[15px] text-gray-900 font-semibold">
                {client?.name ?? invoice.cases?.deal_name ?? '—'} 様
              </div>
              {client?.address && (
                <div className="text-[12px] text-gray-600 mt-1">〒 {client.postal_code ?? ''}</div>
              )}
              {client?.address && (
                <div className="text-[12px] text-gray-600">{client.address}</div>
              )}
            </div>
            <div className="text-right text-[12px] text-gray-600">
              <div>請求書番号: <span className="font-mono text-gray-900">{invoiceNumber}</span></div>
              <div className="mt-1">発行日: {issuedDate}</div>
              {invoice.due_date && <div className="mt-1">お支払期限: {dueDate}</div>}
            </div>
          </div>

          {/* 案件 */}
          <div className="mb-6">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider">案件</div>
            <div className="text-[14px] font-semibold text-gray-900">
              <span className="font-mono text-[12px] text-gray-500 mr-2">{invoice.cases?.case_number}</span>
              {invoice.cases?.deal_name}
            </div>
            {invoice.cases?.deceased_name && (
              <div className="text-[12px] text-gray-500 mt-0.5">
                被相続人: {invoice.cases.deceased_name}
              </div>
            )}
          </div>

          {/* リード文 */}
          <div className="text-[13px] text-gray-700 leading-relaxed mb-6">
            毎度格別のお引立てを賜り、誠にありがとうございます。<br />
            下記の通りご請求申し上げます。
          </div>

          {/* 合計（強調） */}
          <div className="bg-gray-50 border border-gray-300 rounded p-4 mb-6 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-gray-500 tracking-wider">ご請求金額（税込）</div>
            <div className="text-[28px] font-extrabold font-mono text-gray-900">
              ¥ {invoice.amount.toLocaleString()}
            </div>
          </div>

          {/* 明細 */}
          <table className="w-full text-[12px] border-collapse mb-6">
            <thead>
              <tr className="bg-gray-100 border-y border-gray-300">
                <th className="text-left py-2 px-3 font-semibold text-gray-700">項目</th>
                <th className="text-right py-2 px-3 font-semibold text-gray-700 w-32">金額</th>
              </tr>
            </thead>
            <tbody>
              {/* 報酬 */}
              <tr className="border-b border-gray-200">
                <td className="py-2 px-3 text-gray-800">
                  <div className="font-semibold">
                    {invoice.invoice_type === '前受金' ? '前受金（業務委託報酬の一部）' : '業務委託報酬'}
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono text-gray-900">¥ {invoice.fee_amount.toLocaleString()}</td>
              </tr>

              {/* 立替実費（明細） */}
              {expenses.length > 0 && (
                <>
                  <tr className="bg-gray-50">
                    <td className="py-1.5 px-3 text-gray-700 text-[11px] font-semibold uppercase tracking-wider" colSpan={2}>
                      立替実費 内訳
                    </td>
                  </tr>
                  {expenses.map(e => (
                    <tr key={e.id} className="border-b border-gray-100">
                      <td className="py-1.5 px-3 pl-6 text-gray-700 text-[12px]">
                        {e.expense_date && (
                          <span className="text-gray-400 font-mono text-[11px] mr-2">{e.expense_date}</span>
                        )}
                        {e.category && <span className="text-gray-500 mr-1">[{e.category}]</span>}
                        {e.item_name}
                        {e.notes && <span className="text-gray-400 ml-1 text-[11px]">({e.notes})</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-gray-700 text-[12px]">
                        ¥ {e.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-gray-200">
                    <td className="py-1.5 px-3 text-right text-gray-500 text-[11px]" colSpan={2}>
                      立替実費 小計: <span className="font-mono font-semibold text-gray-700">¥ {expensesTotal.toLocaleString()}</span>
                    </td>
                  </tr>
                </>
              )}

              {/* 合計 */}
              <tr className="bg-gray-50 border-t-2 border-gray-700">
                <td className="py-2 px-3 text-right font-bold text-gray-900">合計</td>
                <td className="py-2 px-3 text-right font-mono font-extrabold text-gray-900 text-[14px]">
                  ¥ {invoice.amount.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 備考 */}
          {invoice.notes && (
            <div className="mb-6">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">備考</div>
              <div className="text-[12px] text-gray-700 whitespace-pre-wrap border-l-2 border-gray-300 pl-3 py-1">
                {invoice.notes}
              </div>
            </div>
          )}

          {/* 振込先 */}
          <div className="mt-10 pt-6 border-t border-gray-200">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">お振込先</div>
            <div className="text-[12px] text-gray-700 leading-relaxed">
              （振込先情報をここに記載してください。Settings から設定可能にする予定）
            </div>
          </div>

          {/* フッター */}
          <div className="mt-10 text-right text-[11px] text-gray-400">
            相続プラットフォーム
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* layout 由来の余白を消す */
          main, .ml-60 {
            margin-left: 0 !important;
            padding: 0 !important;
          }
          aside {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

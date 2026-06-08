'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { FileText, ArrowUpDown } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'
import { BILLING_STATUS_ORDER, type BillingCaseRow } from '@/lib/billingCaseRows'

type Props = {
  rows: BillingCaseRow[]
  title?: string
}

const STATUS_COLOR: Record<string, string> = {
  '未請求': 'bg-gray-100 text-gray-700 border-gray-200',
  '作成済': 'bg-gray-50 text-gray-700 border-gray-300',
  '入金待ち': 'bg-amber-50 text-amber-700 border-amber-200',
  '入金済':   'bg-green-50 text-green-700 border-green-200',
}

const BUCKET_COLOR: Record<string, string> = {
  '受託':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  '対応中': 'bg-sky-50 text-sky-700 border-sky-200',
  '完了':   'bg-violet-50 text-violet-700 border-violet-200',
}

// 契約形態 → 行/司/連名 の色帯
function contractBar(contractType: string | null): { cls: string; label: string } {
  switch (contractType) {
    case '行政書士法人単独': return { cls: 'bg-blue-500', label: '行' }
    case '司法書士法人単独': return { cls: 'bg-purple-500', label: '司' }
    case '行・司連名':       return { cls: 'bg-gradient-to-b from-blue-500 to-purple-500', label: '連' }
    default:                 return { cls: 'bg-gray-300', label: '—' }
  }
}

function fmtYen(n: number): string { return `¥${n.toLocaleString()}` }

export default function BillingCaseTable({ rows, title = '請求対象案件' }: Props) {
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ao = BILLING_STATUS_ORDER[a.invoiceStatus] ?? 99
      const bo = BILLING_STATUS_ORDER[b.invoiceStatus] ?? 99
      if (ao !== bo) return sortAsc ? ao - bo : bo - ao
      return a.caseNumber.localeCompare(b.caseNumber)
    })
  }, [rows, sortAsc])

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {title}
        <span className="ml-2 text-[12px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{rows.length}件</span>
      </h3>
      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          請求対象の案件はありません（当月の受託 / 当月完了予定の対応中 / 当月業務完了）
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="text-[13px] border-collapse w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="px-1 py-2 text-center font-semibold" title="契約形態（行/司/連名）"></th>
                <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">案件名</th>
                <th className="px-2.5 py-2 text-left font-semibold">受注内容</th>
                <th className="px-2.5 py-2 text-left font-semibold">受注担当</th>
                <th className="px-2.5 py-2 text-left font-semibold">管理担当</th>
                <th className="px-2.5 py-2 text-center font-semibold">区分</th>
                <th className="px-2.5 py-2 text-center font-semibold">
                  <button onClick={() => setSortAsc(s => !s)} className="inline-flex items-center gap-1 hover:text-brand-600">
                    請求ステータス <ArrowUpDown className="w-3 h-3" strokeWidth={2} />
                  </button>
                </th>
                <th className="px-2.5 py-2 text-right font-semibold">請求金額</th>
                <th className="px-2.5 py-2 text-center font-semibold">請求書PDF</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                const bar = contractBar(r.contractType)
                const procedures = (r.procedureType ?? []).filter(Boolean)
                return (
                  <tr key={r.caseId} className={`border-b border-gray-100 hover:bg-brand-50/30 ${rowBg}`}>
                    {/* 契約形態の色帯 */}
                    <td className="px-1 py-2 text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white ${bar.cls}`} title={r.contractType ?? '契約形態未設定'}>
                        {bar.label}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 font-mono">
                      <Link href={`/cases/${r.caseId}`} className="text-brand-700 hover:underline font-semibold">{r.caseNumber}</Link>
                    </td>
                    <td className="px-2.5 py-2 text-gray-900 truncate">
                      <Link href={`/cases/${r.caseId}`} className="hover:text-brand-700 hover:underline">{r.dealName}</Link>
                    </td>
                    {/* 受注内容（手続区分） */}
                    <td className="px-2.5 py-2">
                      {procedures.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {procedures.map(p => (
                            <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 受注担当 */}
                    <td className="px-2.5 py-2">
                      {r.salesName && r.salesId ? (
                        <Link href={`/profile/${r.salesId}`} className="flex items-center gap-1.5 hover:text-brand-700 hover:underline">
                          <UserAvatar name={r.salesName} role="sales" url={r.salesAvatarUrl} size="sm" />
                          <span className="truncate">{r.salesName}</span>
                        </Link>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    {/* 管理担当 */}
                    <td className="px-2.5 py-2">
                      {r.managerName && r.managerId ? (
                        <Link href={`/profile/${r.managerId}`} className="flex items-center gap-1.5 hover:text-brand-700 hover:underline">
                          <UserAvatar name={r.managerName} role="manager" url={r.managerAvatarUrl} size="sm" />
                          <span className="truncate">{r.managerName}</span>
                        </Link>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    {/* 区分 */}
                    <td className="px-2.5 py-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-bold ${BUCKET_COLOR[r.bucket] ?? ''}`}>{r.bucket}</span>
                    </td>
                    {/* 請求ステータス */}
                    <td className="px-2.5 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[12px] font-semibold ${STATUS_COLOR[r.invoiceStatus] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>{r.invoiceStatus}</span>
                    </td>
                    {/* 請求金額 */}
                    <td className="px-2.5 py-2 font-mono text-right text-gray-900">{fmtYen(r.amount)}</td>
                    {/* 請求書PDF */}
                    <td className="px-2.5 py-2 text-center">
                      {r.invoiceId && r.invoiceStatus !== '未請求' ? (
                        <Link href={`/invoices/${r.invoiceId}/preview`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 rounded">
                          <FileText className="w-3 h-3" strokeWidth={2.25} />プレビュー
                        </Link>
                      ) : <span className="text-gray-300 text-[12px]">未発行</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES } from '@/lib/constants'

export type ReferralRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  order_route_detail: string | null
  procedure_type: string[] | null
  client_name: string | null
  manager_name: string | null
}

/** 個別管理案件（紹介のみ）一覧 */
export default function ReferralCasesTable({ cases }: { cases: ReferralRow[] }) {
  const statusDef = CASE_STATUSES.find(s => s.key === '紹介のみ')
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-cyan-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">個別管理案件（紹介のみ）</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {cases.length}件
        </span>
        <span className="ml-auto text-[11px] text-gray-400">受注に至らず紹介（税理士・不動産査定・遺品整理 等）のみ発生した案件</span>
      </div>
      {cases.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">「紹介のみ」の案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">案件名</th>
                <th className="px-3 py-2 text-left font-bold">ステータス</th>
                <th className="px-3 py-2 text-left font-bold">送客元</th>
                <th className="px-3 py-2 text-left font-bold">紹介内容</th>
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-left font-bold">依頼者名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map(c => {
                const procedures = (c.procedure_type ?? []).filter(Boolean)
                return (
                  <tr key={c.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">
                        {c.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {statusDef ? <Badge label="紹介のみ" color={statusDef.color} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.order_route_detail || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {procedures.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {procedures.map(p => (
                            <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{c.manager_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 truncate">{c.client_name || <span className="text-gray-300">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

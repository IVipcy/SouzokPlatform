'use client'

import { useState } from 'react'
import { Section } from '@/components/ui/InlineFields'
import type { ContractDocumentRow } from '@/types'

type Props = {
  /** 案件の契約残手続き書類（contract_documents）全件。区分でこの中から絞る。 */
  documents: ContractDocumentRow[]
  /** 表示する区分（戸籍 / 財産 / 登記）。 */
  category: string
  title?: string
}

/**
 * 各調査タブ（相続人調査・財産調査・相続登記）に出す「契約時にお客様から受領した書類」一覧。
 * 契約残手続き(contract_documents)のうち、区分が一致する行を受領済/未受領で表示する（読み取り中心）。
 * 編集・受信登録は「契約残手続き」タブ／到着物受信簿で行う。該当が無ければ何も表示しない。
 */
export default function ContractReceivedDocs({ documents, category, title }: Props) {
  const [filter, setFilter] = useState<'all' | 'received' | 'pending'>('all')
  const rows = documents.filter(d => d.category === category && d.status !== '不要')
  if (rows.length === 0) return null

  const shown = filter === 'all' ? rows
    : filter === 'received' ? rows.filter(r => r.arrival_date)
    : rows.filter(r => !r.arrival_date)
  const receivedCount = rows.filter(r => r.arrival_date).length

  return (
    <Section title={title ?? '契約時にお客様から受領した書類'} collapsible defaultOpen>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[12px] text-gray-400 mr-auto">お客様が契約時にまとめて用意する分（編集は「契約残手続き」タブ）。受領済 {receivedCount}/{rows.length}</span>
        {([['all', 'すべて'], ['pending', '未受領'], ['received', '受領済']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${filter === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 520 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold">到着物</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">受領状況</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">受領</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-1.5 text-gray-800">{r.name || <span className="text-gray-300">（名称未設定）</span>}</td>
                <td className="px-2.5 py-1.5 text-gray-600">{r.status ?? '—'}</td>
                <td className="px-2.5 py-1.5 font-mono text-gray-600">{r.arrival_date ?? '—'}</td>
                <td className="px-2.5 py-1.5">
                  {r.arrival_date
                    ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受領済</span>
                    : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受領</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

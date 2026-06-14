'use client'

import { FileClock, Wrench } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { getCaseCategory } from '@/lib/constants'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { CaseRow, ContractDocumentRow } from '@/types'

// 面談時に入力した「手続き詳細」(intake_documents / intake_roles) を、
// ステータスに応じて読み取り専用で連動表示する。
//   ・受託（受注）: 契約処理として残っている＝受領待ちの書類
//   ・対応中/完了 : 自社が行う作業（owner=自社）＝請求・自社作業
// 編集は「面談情報」タブの手続き詳細セクションで行う。

// 受領待ち（まだ手元に来ていない）とみなす受領状況
const PENDING_DOC_STATUSES = ['後日郵送', '依頼者が取得']
// 「請求」バッジを付ける手がかり
const BILLABLE_HINT = /別料金|請求/

type Props = {
  caseData: CaseRow
  contractDocuments?: ContractDocumentRow[]
}

export default function ProcedureIntakeSummary({ caseData, contractDocuments = [] }: Props) {
  const category = getCaseCategory(caseData.status)
  const today = todayJstYmd(new Date())

  // ── 受託: 契約処理の残（受領待ち＝未受信の書類） ──
  if (caseData.status === '受注') {
    const pending = contractDocuments.filter(d => PENDING_DOC_STATUSES.includes(d.status ?? '') && !d.arrival_date)
    if (pending.length === 0) return null
    return (
      <Section title="契約処理の残（受領待ち書類）">
        <p className="text-[12px] text-gray-400 mb-2">受注内容・契約手続きタブと連動。受領状況「後日郵送 / 依頼者が取得」で未受信の書類です（受信簿で受信すると消えます）。</p>
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 620 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                <th className="px-2.5 py-2 text-left font-semibold w-56">書類</th>
                <th className="px-2.5 py-2 text-left font-semibold w-36">受領状況</th>
                <th className="px-2.5 py-2 text-left font-semibold w-36">到着予定日</th>
                <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((d, i) => {
                const overdue = !!d.expected_arrival_date && d.expected_arrival_date < today
                return (
                  <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-2.5 py-2 text-gray-800">
                      <span className="inline-flex items-center gap-1.5">
                        <FileClock className="w-3.5 h-3.5 text-amber-500" />
                        {d.name || '—'}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">{d.status}</span>
                    </td>
                    <td className={`px-2.5 py-2 font-mono text-[12px] ${overdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                      {d.expected_arrival_date ?? '未定'}{overdue ? '（超過）' : ''}
                    </td>
                    <td className="px-2.5 py-2 text-gray-500">{d.notes || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    )
  }

  // ── 対応中/完了: 請求・自社作業（owner=自社の役割） ──
  if (category === 'management') {
    const ownTasks = (caseData.intake_roles ?? []).filter(r => r.owner === '自社')
    if (ownTasks.length === 0) return null
    return (
      <Section title="請求・自社作業（手続き詳細より）">
        <p className="text-[12px] text-gray-400 mb-2">面談情報タブ「手続き詳細」で自社対応とした項目です。「別料金 / 請求」を含む項目は請求対象の目安です。</p>
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 520 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                <th className="px-2.5 py-2 text-left font-semibold w-28">業務</th>
                <th className="px-2.5 py-2 text-left font-semibold w-64">作業</th>
                <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              </tr>
            </thead>
            <tbody>
              {ownTasks.map((r, i) => {
                const billable = BILLABLE_HINT.test(r.sagyou) || BILLABLE_HINT.test(r.note) || BILLABLE_HINT.test(r.gyomu)
                return (
                  <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-2.5 py-2 text-gray-500">{r.gyomu || '—'}</td>
                    <td className="px-2.5 py-2 text-gray-800">
                      <span className="inline-flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-brand-500" />
                        {r.sagyou || '—'}
                        {billable && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">請求</span>
                        )}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-gray-500">{r.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    )
  }

  return null
}

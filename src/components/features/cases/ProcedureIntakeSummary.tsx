'use client'

import { Wrench } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { getCaseCategory } from '@/lib/constants'
import type { CaseRow } from '@/types'

// 対応中/完了で、役割分担(intake_roles)のうち自社対応の項目を「請求・自社作業」として
// 読み取り専用で連動表示する。編集は受注内容・契約手続きタブ／面談情報タブで行う。
// （受託の「契約処理の残」は受注内容・契約手続きタブで管理するためここでは出さない）

// 「請求」バッジを付ける手がかり
const BILLABLE_HINT = /別料金|請求/

type Props = {
  caseData: CaseRow
}

export default function ProcedureIntakeSummary({ caseData }: Props) {
  const category = getCaseCategory(caseData.status)

  // ── 対応中/完了: 請求・自社作業（owner=自社の役割） ──
  // ※ 受託の「契約処理の残（受領待ち書類）」は受注内容・契約手続きタブで管理するためここでは出さない。
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

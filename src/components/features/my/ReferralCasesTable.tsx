'use client'

import Link from 'next/link'
import { Sparkles, Trash2 } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { CASE_STATUSES, getCaseStatusLabel } from '@/lib/constants'
import { useCaseBulkDelete } from '@/components/features/cases/useCaseBulkDelete'

export type ReferralRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  order_route_detail: string | null
  procedure_type: string[] | null
  client_name: string | null
  manager_name: string | null
  /** 受注担当名・担当チーム名（検索用。表示はしない） */
  sales_name?: string | null
  team_name?: string | null
}

/** 個別管理案件（紹介のみ・長期保留）一覧。selectable でチェック選択＋一括削除を有効化 */
export default function ReferralCasesTable({ cases, selectable = false }: { cases: ReferralRow[]; selectable?: boolean }) {
  const sel = useCaseBulkDelete(cases.map(c => c.id))
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-cyan-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">個別案件一覧</h3>
        <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          {cases.length}件
        </span>
        {selectable && sel.selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] font-semibold text-gray-600">{sel.selected.size}件選択中</span>
            <button type="button" onClick={() => sel.setConfirmOpen(true)} className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors">
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2} /> 選択を削除
            </button>
            <button type="button" onClick={sel.clear} className="text-[12px] text-gray-400 hover:text-gray-600 px-1">解除</button>
          </div>
        ) : (
          <span className="ml-auto text-[11px] text-gray-400">受託に至らず紹介のみ／長期保留の案件（裁判解決後などに戻り受注の可能性あり）</span>
        )}
      </div>
      {cases.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">個別案件（紹介のみ・長期保留）はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 uppercase tracking-wider">
              <tr>
                {selectable && (
                  <th className="px-3 py-2 text-center font-bold w-10">
                    <input type="checkbox" checked={sel.allSelected} ref={el => { if (el) el.indeterminate = sel.someSelected }} onChange={sel.toggleAll} className="w-4 h-4 accent-brand-600 cursor-pointer align-middle" title="表示中をすべて選択" />
                  </th>
                )}
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
                const isSelected = sel.selected.has(c.id)
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/60 ${isSelected ? 'bg-brand-50/50' : ''}`}>
                    {selectable && (
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={isSelected} onChange={() => sel.toggleOne(c.id)} className="w-4 h-4 accent-brand-600 cursor-pointer align-middle" />
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">
                        {c.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const def = CASE_STATUSES.find(s => s.key === c.status)
                        return def ? <Badge label={getCaseStatusLabel(c.status)} color={def.color} /> : <span className="text-gray-300">—</span>
                      })()}
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

      <DeleteConfirmModal
        isOpen={sel.confirmOpen}
        onClose={() => sel.setConfirmOpen(false)}
        title="案件の一括削除"
        message={`選択した ${sel.selected.size} 件の案件を削除します。関連するタスク・担当者・書類・請求書・入金も全て削除され、取り消せません。本当に削除しますか？`}
        onConfirm={sel.handleDelete}
      />
    </div>
  )
}

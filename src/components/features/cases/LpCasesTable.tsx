'use client'

import Link from 'next/link'
import { Megaphone, AlertTriangle, Trash2 } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { CASE_STATUSES } from '@/lib/constants'
import { useCaseBulkDelete } from '@/components/features/cases/useCaseBulkDelete'

export type LpCaseRow = {
  id: string
  case_number: string
  /** LP案件管理番号（相続ステーション側の元番号。検索用） */
  lp_case_number: string | null
  deal_name: string
  status: string
  /** 契約形態（行政書士法人単独 / 司法書士法人単独 / 行・司連名）→ 行/司/連 フラグ */
  contract_type: string | null
  /** 送客元 = 詳細受注ルート（無ければ LP名 / 紹介者名） */
  referral_source: string | null
  /** 依頼者氏名 */
  client_name: string | null
  /** 不受託理由（失注理由） */
  lost_reason: string | null
  /** お客様回答予定日 */
  client_response_due_date: string | null
  /** 検討期間区分（1週間/2週間/1ヶ月/見込み不明） */
  consideration_period?: string | null
  /** 受注担当者名 */
  sales_name: string | null
  /** 担当チーム名（受注担当の所属チーム。検索用） */
  team_name?: string | null
  /** 管理担当者名 */
  manager_name: string | null
  /** 前受金額（円） */
  advance_payment: number | null
  /** 確定売上金額（円）。契約形態に応じて 行政/司法/合計 を採用 */
  confirmed_revenue: number | null
  /** 完了予定日 */
  expected_completion_date: string | null
  /** 税理士名・事務所名 */
  tax_advisor_name: string | null
  /** 不動産（査定状況） */
  real_estate_status: string | null
}

type Props = {
  cases: LpCaseRow[]
  selectable?: boolean
}

// 契約形態 → フラグ（請求画面 BillingCaseTable と統一: 行=青 / 司=赤 / 連=紫）
function contractFlag(contractType: string | null): { cls: string; label: string } | null {
  switch (contractType) {
    case '行政書士法人単独': return { cls: 'bg-blue-500', label: '行' }
    case '司法書士法人単独': return { cls: 'bg-red-500', label: '司' }
    case '行・司連名':       return { cls: 'bg-purple-500', label: '連' }
    default: return null
  }
}

const formatMan = (yen: number): string => {
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億`
  return `${Math.round(yen / 10_000).toLocaleString()}`
}

/**
 * LP案件一覧
 * - 受注ルートが「LP直」または「その他」の案件を表示する。
 * - 「LPによる追いかけ可否 / 連絡方法 / 検討理由 / その他特記事項」は
 *   現時点で案件詳細に対応フィールドが無いため、ヘッダーのみ設置（中身は空欄）。
 */
export default function LpCasesTable({ cases, selectable = false }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const sel = useCaseBulkDelete(cases.map(c => c.id))

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <Megaphone className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">LP案件一覧</h3>
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
          <span className="ml-auto text-[11px] text-gray-400">受注ルートが「LP経由」の案件</span>
        )}
      </div>

      {cases.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">LP案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
              <tr>
                {selectable && (
                  <th className="px-3 py-2 text-center font-bold w-10">
                    <input type="checkbox" checked={sel.allSelected} ref={el => { if (el) el.indeterminate = sel.someSelected }} onChange={sel.toggleAll} className="w-4 h-4 accent-brand-600 cursor-pointer align-middle" title="表示中をすべて選択" />
                  </th>
                )}
                <th className="px-3 py-2 text-center font-bold">行・司・連名<br />フラグ</th>
                <th className="px-3 py-2 text-left font-bold">案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">LP案件管理番号</th>
                <th className="px-3 py-2 text-left font-bold">送客元</th>
                <th className="px-3 py-2 text-left font-bold">依頼者氏名</th>
                <th className="px-3 py-2 text-left font-bold">案件ステータス</th>
                <th className="px-3 py-2 text-left font-bold">不受託理由</th>
                <th className="px-3 py-2 text-left font-bold">検討理由</th>
                <th className="px-3 py-2 text-left font-bold">お客様回答予定日</th>
                <th className="px-3 py-2 text-left font-bold">検討期間</th>
                <th className="px-3 py-2 text-left font-bold">残り日数</th>
                <th className="px-3 py-2 text-left font-bold">受注担当</th>
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-right font-bold">前受金額</th>
                <th className="px-3 py-2 text-right font-bold">確定売上金額</th>
                <th className="px-3 py-2 text-left font-bold">LPによる<br />追いかけ可否</th>
                <th className="px-3 py-2 text-left font-bold">連絡方法</th>
                <th className="px-3 py-2 text-left font-bold">完了予定日</th>
                <th className="px-3 py-2 text-left font-bold">税理士</th>
                <th className="px-3 py-2 text-left font-bold">不動産売却</th>
                <th className="px-3 py-2 text-left font-bold">その他特記事項</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map(c => {
                const statusDef = CASE_STATUSES.find(s => s.key === c.status)
                const flag = contractFlag(c.contract_type)
                const dueOverdue = !!(c.client_response_due_date && c.client_response_due_date < today)
                const daysRemaining = c.client_response_due_date
                  ? Math.round((new Date(c.client_response_due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
                  : null
                const isSelected = sel.selected.has(c.id)
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/60 ${isSelected ? 'bg-brand-50/50' : ''}`}>
                    {selectable && (
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={isSelected} onChange={() => sel.toggleOne(c.id)} className="w-4 h-4 accent-brand-600 cursor-pointer align-middle" />
                      </td>
                    )}
                    {/* 行・司・連名フラグ */}
                    <td className="px-3 py-2.5 text-center">
                      {flag ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[12px] font-bold text-white ${flag.cls}`}>{flag.label}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* 案件管理番号 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.case_number}</td>
                    {/* LP案件管理番号（相続ステーション元番号） */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{c.lp_case_number || <span className="text-gray-300">—</span>}</td>
                    {/* 送客元 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.referral_source || <span className="text-gray-300">—</span>}</td>
                    {/* 依頼者氏名 */}
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline">
                        {c.client_name || c.deal_name}
                      </Link>
                    </td>
                    {/* 案件ステータス */}
                    <td className="px-3 py-2.5">
                      {statusDef ? <Badge label={statusDef.label} color={statusDef.color} /> : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 不受託理由 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.lost_reason || <span className="text-gray-300">—</span>}</td>
                    {/* 検討理由（フィールド未設置） */}
                    <td className="px-3 py-2.5 text-[12px]"><span className="text-gray-300">—</span></td>
                    {/* お客様回答予定日 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {c.client_response_due_date ? (
                        <span className={dueOverdue ? 'text-red-600 font-bold inline-flex items-center gap-1' : 'text-gray-700'}>
                          {dueOverdue && <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />}
                          {c.client_response_due_date}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* 検討期間 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.consideration_period || <span className="text-gray-300">—</span>}</td>
                    {/* 残り日数 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {daysRemaining === null ? (
                        <span className="text-gray-300">—</span>
                      ) : daysRemaining < 0 ? (
                        <span className="text-red-600 font-bold">{Math.abs(daysRemaining)}日超過</span>
                      ) : daysRemaining === 0 ? (
                        <span className="text-amber-600 font-bold">本日</span>
                      ) : (
                        <span className={daysRemaining <= 3 ? 'text-amber-600 font-semibold' : 'text-gray-700'}>あと{daysRemaining}日</span>
                      )}
                    </td>
                    {/* 受注担当 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{c.sales_name || <span className="text-gray-300">—</span>}</td>
                    {/* 管理担当 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{c.manager_name || <span className="text-gray-300">—</span>}</td>
                    {/* 前受金額 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-right text-gray-700">
                      {c.advance_payment && c.advance_payment > 0 ? (
                        <span>{formatMan(c.advance_payment)}<span className="text-gray-400 ml-0.5">万円</span></span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* 確定売上金額 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-right text-gray-700">
                      {c.confirmed_revenue && c.confirmed_revenue > 0 ? (
                        <span>{formatMan(c.confirmed_revenue)}<span className="text-gray-400 ml-0.5">万円</span></span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* LPによる追いかけ可否（フィールド未設置） */}
                    <td className="px-3 py-2.5 text-[12px]"><span className="text-gray-300">—</span></td>
                    {/* 連絡方法（フィールド未設置） */}
                    <td className="px-3 py-2.5 text-[12px]"><span className="text-gray-300">—</span></td>
                    {/* 完了予定日 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{c.expected_completion_date ?? <span className="text-gray-300">—</span>}</td>
                    {/* 税理士 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.tax_advisor_name || <span className="text-gray-300">—</span>}</td>
                    {/* 不動産売却 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.real_estate_status || <span className="text-gray-300">—</span>}</td>
                    {/* その他特記事項（フィールド未設置） */}
                    <td className="px-3 py-2.5 text-[12px]"><span className="text-gray-300">—</span></td>
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

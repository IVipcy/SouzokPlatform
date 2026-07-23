'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Megaphone, AlertTriangle, Trash2, Download } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import ProspectBadge from '@/components/ui/ProspectBadge'
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
  /** 検討中・失注理由（旧 lost_reason の置換、migration 125） */
  consideration_decline_reason: string | null
  /** その他理由詳細（migration 126） */
  consideration_decline_reason_detail?: string | null
  /** お客様回答予定日 */
  client_response_due_date: string | null
  /** 検討期間区分（1週間/2週間/1ヶ月/見込み不明/四十九日以降） */
  consideration_period?: string | null
  /** 見込み度合い（高/中/低/不明） */
  prospect_level?: string | null
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
  /** 税理士業務（依頼内容、case_referrals(partner_type='税理士').content） */
  tax_advisor_business: string | null
  /** 不動産登記（依頼内容、case_referrals(partner_type='不動産').content） */
  real_estate_registration: string | null
  /** 面談内容詳細（cases.meeting_other_notes） */
  meeting_other_notes: string | null
  /** 最終更新日 */
  updated_at?: string | null
}

type Props = {
  cases: LpCaseRow[]
  allCases?: LpCaseRow[]
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
export default function LpCasesTable({ cases, allCases, selectable = false }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const sel = useCaseBulkDelete(cases.map(c => c.id))
  const [exporting, setExporting] = useState(false)

  const exportExcel = async () => {
    const exportRows = allCases ?? cases
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const statuses = [...new Set(exportRows.map(c => c.status))]
      const HEADERS = [
        '行・司・連名', '案件管理番号', 'LP案件管理番号', '送客元', '依頼者氏名',
        '案件ステータス', '検討中・失注理由', 'その他理由詳細', 'お客様回答予定日',
        '検討期間', '見込み度合い', '残り日数', '受注担当', '管理担当', '前受金額', '確定売上金額',
        '完了予定日', '税理士業務', '不動産登記', '面談内容詳細', '最終更新日',
      ]
      const flagLabel = (ct: string | null) => ct === '行政書士法人単独' ? '行' : ct === '司法書士法人単独' ? '司' : ct === '行・司連名' ? '連' : ''
      const fmtYen = (n: number | null) => n && n > 0 ? n : ''
      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

      const addSheet = (name: string, rows: LpCaseRow[]) => {
        const sheetName = name.length > 31 ? name.slice(0, 31) : name
        const ws = wb.addWorksheet(sheetName)
        const headerRow = ws.addRow(HEADERS)
        headerRow.font = { bold: true, size: 10 }
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } }
        for (const c of rows) {
          const daysRemaining = c.client_response_due_date
            ? Math.round((new Date(c.client_response_due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
            : null
          const daysLabel = daysRemaining === null ? '' : daysRemaining < 0 ? `${Math.abs(daysRemaining)}日超過` : daysRemaining === 0 ? '本日' : `あと${daysRemaining}日`
          ws.addRow([
            flagLabel(c.contract_type), c.case_number, c.lp_case_number ?? '', c.referral_source ?? '',
            c.client_name ?? '', c.status, c.consideration_decline_reason ?? '',
            c.consideration_decline_reason_detail ?? '', c.client_response_due_date ?? '',
            c.consideration_period ?? '', c.prospect_level ?? '', daysLabel, c.sales_name ?? '', c.manager_name ?? '',
            fmtYen(c.advance_payment), fmtYen(c.confirmed_revenue),
            c.expected_completion_date ?? '',
            c.tax_advisor_business ?? '', c.real_estate_registration ?? '',
            c.meeting_other_notes || c.consideration_decline_reason_detail || '',
            fmtDate(c.updated_at ?? null),
          ])
        }
        ws.columns.forEach(col => { col.width = 16 })
      }

      addSheet('すべて', exportRows)
      for (const st of statuses) {
        addSheet(st, exportRows.filter(c => c.status === st))
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `LP案件一覧_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-gray-400">受注ルートが「LP経由」の案件</span>
            <button type="button" onClick={exportExcel} disabled={exporting || (allCases ?? cases).length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 transition-colors">
              <Download className="w-3.5 h-3.5" />{exporting ? '出力中...' : 'Excel出力'}
            </button>
          </div>
        )}
      </div>

      {cases.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">LP案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 uppercase tracking-wider">
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
                <th className="px-3 py-2 text-left font-bold">検討中・失注理由</th>
                <th className="px-3 py-2 text-left font-bold">詳細理由</th>
                <th className="px-3 py-2 text-left font-bold">お客様回答予定日</th>
                <th className="px-3 py-2 text-left font-bold">検討期間</th>
                <th className="px-3 py-2 text-left font-bold">見込み度合い</th>
                <th className="px-3 py-2 text-left font-bold">残り日数</th>
                <th className="px-3 py-2 text-left font-bold">受注担当</th>
                <th className="px-3 py-2 text-left font-bold">管理担当</th>
                <th className="px-3 py-2 text-right font-bold">前受金額</th>
                <th className="px-3 py-2 text-right font-bold">確定売上金額</th>
                <th className="px-3 py-2 text-left font-bold">完了予定日</th>
                <th className="px-3 py-2 text-left font-bold">税理士業務</th>
                <th className="px-3 py-2 text-left font-bold">不動産登記</th>
                <th className="px-3 py-2 text-left font-bold">その他申し送り事項</th>
                <th className="px-3 py-2 text-left font-bold">最終更新日</th>
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
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      <Link href={`/cases/${c.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">{c.case_number}</Link>
                    </td>
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
                    {/* 検討中・失注理由 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.consideration_decline_reason || <span className="text-gray-300">—</span>}</td>
                    {/* その他理由詳細 */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600 max-w-[220px] truncate" title={c.consideration_decline_reason_detail ?? undefined}>{c.consideration_decline_reason_detail || <span className="text-gray-300">—</span>}</td>
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
                    {/* 見込み度合い */}
                    <td className="px-3 py-2.5 whitespace-nowrap"><ProspectBadge level={c.prospect_level} /></td>
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
                    {/* 完了予定日 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{c.expected_completion_date ?? <span className="text-gray-300">—</span>}</td>
                    {/* 税理士業務（case_referrals(税理士).content） */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.tax_advisor_business || <span className="text-gray-300">—</span>}</td>
                    {/* 不動産登記（case_referrals(不動産).content） */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600">{c.real_estate_registration || <span className="text-gray-300">—</span>}</td>
                    {/* 面談内容詳細（新カラム。旧・理由詳細もフォールバックで表示） */}
                    <td className="px-3 py-2.5 text-[12px] text-gray-600 max-w-[220px] truncate" title={(c.meeting_other_notes || c.consideration_decline_reason_detail) ?? undefined}>{(c.meeting_other_notes || c.consideration_decline_reason_detail) || <span className="text-gray-300">—</span>}</td>
                    {/* 最終更新日 */}
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500 whitespace-nowrap">
                      {c.updated_at ? new Date(c.updated_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : <span className="text-gray-300">—</span>}
                    </td>
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

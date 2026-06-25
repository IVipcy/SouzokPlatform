import Link from 'next/link'
import { FileText, Send, Hourglass, CheckCircle2, AlertCircle } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'
import OpenInvoiceButton from '@/components/features/billing/OpenInvoiceButton'
import OpenReceiptButton from '@/components/features/billing/OpenReceiptButton'

const fmtMoney = (n: number | undefined) => (n && n > 0 ? `¥${n.toLocaleString()}` : '—')

// 進捗管理ボード「請求状況」ビュー用の集計済み行
export type BillingViewRow = {
  invoiceId: string
  caseId: string
  caseNumber: string
  dealName: string
  managerName: string | null
  managerId: string | null
  managerAvatarColor: string | null
  managerAvatarUrl: string | null
  // 担当者列で表示する人の主たるロール（色決定用）
  managerPrimaryRole?: 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null
  status: string          // InvoiceStatus 文字列
  amount: number          // 円
  issuedDate: string | null
  hasPdf: boolean         // PDF プレビューリンク有無
  // 請求一覧と揃える表示用
  orderRoute?: string | null
  orderRouteDetail?: string | null
  advance?: number        // 前受金(前受金請求=請求額/確定請求=前受金控除)
  expenses?: number       // 立替実費
  receiptIssuedDate?: string | null
  notes?: string | null
}

export type BillingViewSummary = {
  invoiceTotal: number    // 請求合計（円）
  invoiceTotalCount: number  // 集計対象件数
  unbilled: number        // 未請求（件）
  awaitingPayment: number // 入金待ち（件）
  paid: number            // 入金済（件）
  partialPaid: number     // 一部入金（件）
}

type Props = {
  summary: BillingViewSummary
  rows: BillingViewRow[]
}

function fmtYen(n: number): string {
  return `¥${n.toLocaleString()}`
}

// migration 045 で4種類に集約
const STATUS_COLOR: Record<string, string> = {
  '未請求': 'bg-gray-100 text-gray-700 border-gray-200',
  '作成済': 'bg-gray-50 text-gray-700 border-gray-300',
  '入金待ち': 'bg-amber-50 text-amber-700 border-amber-200',
  '入金済':   'bg-green-50 text-green-700 border-green-200',
}

export default function BillingStatusView({ summary, rows }: Props) {
  return (
    <div className="space-y-4">
      {/* サマリBox */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <SummaryBox
          icon={<FileText className="w-4 h-4 text-brand-600" strokeWidth={2.25} />}
          label="請求合計"
          value={fmtYen(summary.invoiceTotal)}
          sub={`${summary.invoiceTotalCount}件発行済`}
          tone="brand"
        />
        <SummaryBox
          icon={<AlertCircle className="w-4 h-4 text-gray-500" strokeWidth={2.25} />}
          label="未請求"
          value={String(summary.unbilled)}
          sub="請求書未発行"
          tone="neutral"
        />
        <SummaryBox
          icon={<Hourglass className="w-4 h-4 text-amber-600" strokeWidth={2.25} />}
          label="入金待ち"
          value={String(summary.awaitingPayment)}
          sub="請求済・未入金"
          tone="amber"
        />
        <SummaryBox
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" strokeWidth={2.25} />}
          label="入金済"
          value={String(summary.paid)}
          sub="入金確定"
          tone="green"
        />
        <SummaryBox
          icon={<Send className="w-4 h-4 text-gray-500" strokeWidth={2.25} />}
          label="作成済"
          value={String(summary.partialPaid)}
          sub="請求書作成済"
          tone="neutral"
        />
      </div>

      {/* 請求書テーブル */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">請求書一覧</h3>
        {rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            選択月に該当する請求書はありません
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="text-[13px] border-collapse w-full table-auto">
              <thead>
                <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700 whitespace-nowrap">
                  <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
                  <th className="px-2.5 py-2 text-left font-semibold">案件名</th>
                  <th className="px-2.5 py-2 text-left font-semibold">受注ルート</th>
                  <th className="px-2.5 py-2 text-left font-semibold">紹介元</th>
                  <th className="px-2.5 py-2 text-left font-semibold">担当者</th>
                  <th className="px-2.5 py-2 text-center font-semibold">請求ステータス</th>
                  <th className="px-2.5 py-2 text-right font-semibold">請求金額</th>
                  <th className="px-2.5 py-2 text-right font-semibold">前受金</th>
                  <th className="px-2.5 py-2 text-right font-semibold">実費</th>
                  <th className="px-2.5 py-2 text-left font-semibold">請求日</th>
                  <th className="px-2.5 py-2 text-center font-semibold">請求書</th>
                  <th className="px-2.5 py-2 text-center font-semibold">領収書</th>
                  <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                  const statusCls = STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                  return (
                    <tr key={r.invoiceId} className={`border-b border-gray-100 hover:bg-brand-50/30 ${rowBg}`}>
                      <td className="px-2.5 py-2 font-mono whitespace-nowrap">
                        <Link href={`/cases/${r.caseId}`} className="text-brand-700 hover:underline font-semibold">
                          {r.caseNumber}
                        </Link>
                      </td>
                      <td className="px-2.5 py-2 text-gray-900 min-w-[180px]">
                        <Link href={`/cases/${r.caseId}`} className="hover:text-brand-700 hover:underline truncate block max-w-[320px]">
                          {r.dealName}
                        </Link>
                      </td>
                      <td className="px-2.5 py-2 text-gray-600">{r.orderRoute || <span className="text-gray-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-gray-600">{r.orderRouteDetail || <span className="text-gray-400">—</span>}</td>
                      <td className="px-2.5 py-2">
                        {r.managerName && r.managerId ? (
                          <Link
                            href={`/profile/${r.managerId}`}
                            className="flex items-center gap-1.5 hover:text-brand-700 hover:underline"
                          >
                            <UserAvatar
                              name={r.managerName}
                              role={r.managerPrimaryRole ?? 'manager'}
                              url={r.managerAvatarUrl}
                              size="sm"
                            />
                            <span className="truncate max-w-[120px]">{r.managerName}</span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[12px] font-semibold ${statusCls}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 font-mono text-right text-gray-900 whitespace-nowrap">
                        {fmtYen(r.amount)}
                      </td>
                      <td className="px-2.5 py-2 font-mono text-right text-gray-700 whitespace-nowrap">{fmtMoney(r.advance)}</td>
                      <td className="px-2.5 py-2 font-mono text-right text-gray-700 whitespace-nowrap">{fmtMoney(r.expenses)}</td>
                      <td className="px-2.5 py-2 font-mono text-gray-700 whitespace-nowrap">
                        {r.issuedDate ?? <span className="text-gray-400">未発行</span>}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {r.hasPdf && r.invoiceId ? (
                          <OpenInvoiceButton invoiceId={r.invoiceId} />
                        ) : (
                          <span className="text-gray-300 text-[12px]">-</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {r.hasPdf && r.invoiceId ? (
                          <OpenReceiptButton invoiceId={r.invoiceId} issuedDate={r.receiptIssuedDate} />
                        ) : (
                          <span className="text-gray-300 text-[12px]">-</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-gray-600 max-w-[200px] truncate" title={r.notes ?? undefined}>{r.notes || <span className="text-gray-400">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryBox({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone: 'brand' | 'green' | 'amber' | 'neutral'
}) {
  const toneCls =
    tone === 'brand'  ? 'border-brand-200 bg-brand-50/40'
    : tone === 'green'  ? 'border-emerald-200 bg-emerald-50/40'
    : tone === 'amber'  ? 'border-amber-200 bg-amber-50/40'
    : 'border-gray-200 bg-white'
  const valueCls =
    tone === 'brand'  ? 'text-brand-700'
    : tone === 'green'  ? 'text-emerald-700'
    : tone === 'amber'  ? 'text-amber-700'
    : 'text-gray-900'

  return (
    <div className={`bg-white border rounded-xl px-3 py-2.5 ${toneCls}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[12px] font-semibold text-gray-600">{label}</span>
      </div>
      <div className={`text-[20px] font-extrabold tracking-tight leading-none mb-1 ${valueCls}`}>
        {value}
      </div>
      <div className="text-[11px] text-gray-400">{sub}</div>
    </div>
  )
}

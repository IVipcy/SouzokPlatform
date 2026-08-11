'use client'

// 経費表。お客様に請求しない自社負担の費用を、発生月で絞って案件別に並べる。
// 売上ではないので確定売上表には出さず、こちらの別表で見る。

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Receipt, ArrowLeft, CalendarClock, Download } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import HelpHint from '@/components/ui/HelpHint'

export type ExpenseReportRow = {
  id: string
  caseId: string
  caseNumber: string
  clientName: string
  kind: string
  label: string
  date: string | null
  amount: number
  salesName: string
  managerName: string
}

const yen = (n: number) => n.toLocaleString()

export default function ExpenseReportClient({ rows }: { rows: ExpenseReportRow[] }) {
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.date) set.add(r.date.slice(0, 7))
    return [...set].sort().reverse()
  }, [rows])
  const [month, setMonth] = useState<string>('all')

  const visible = useMemo(
    () => (month === 'all' ? rows : rows.filter(r => (r.date ?? '').startsWith(month))),
    [rows, month],
  )

  // 案件ごとにまとめる（案件別に「いくらかかったか」を見る表なので、案件が単位）
  const groups = useMemo(() => {
    const m = new Map<string, { caseId: string; caseNumber: string; clientName: string; salesName: string; managerName: string; items: ExpenseReportRow[] }>()
    for (const r of visible) {
      if (!m.has(r.caseId)) m.set(r.caseId, { caseId: r.caseId, caseNumber: r.caseNumber, clientName: r.clientName, salesName: r.salesName, managerName: r.managerName, items: [] })
      m.get(r.caseId)!.items.push(r)
    }
    return [...m.values()].sort((a, b) => b.caseNumber.localeCompare(a.caseNumber))
  }, [visible])

  const total = visible.reduce((s, r) => s + r.amount, 0)

  // CSV（Excelで開ける）。列は画面と同じ。
  const exportCsv = () => {
    const head = ['発生日', '案件番号', '依頼者', '区分', '内容', '金額', '受注', '管理']
    const lines = visible.map(r => [r.date ?? '', r.caseNumber, r.clientName, r.kind, r.label, String(r.amount), r.salesName, r.managerName])
    const csv = [head, ...lines].map(cols => cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `経費_${month === 'all' ? '全期間' : month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="経費"
        icon={Receipt}
        afterTitle={<ExpenseHelp />}
        description="お客様に請求しない自社負担の費用を、案件ごとに集計した一覧です。"
        right={
          <Link href="/billing" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 請求・入金へ
          </Link>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarClock className="w-4 h-4" /> 発生月
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">全期間</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="ml-2 text-[13px] text-gray-600">
          {visible.length}件 ・ 合計 <span className="font-bold text-purple-700 tabular-nums">¥{yen(total)}</span>
        </span>
        <button type="button" onClick={exportCsv} disabled={visible.length === 0}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> CSV出力
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
          経費はありません{month !== 'all' && `（${month}）`}。
          戸籍・不動産資料の請求区分を「誤請求」にすると、その費用がここに入ります。
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const sub = g.items.reduce((s, r) => s + r.amount, 0)
            return (
              <div key={g.caseId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                  <Link href={`/cases/${g.caseId}`} className="text-[13px] font-mono text-brand-700 hover:underline">{g.caseNumber}</Link>
                  <span className="text-[13px] font-semibold text-gray-800">{g.clientName}</span>
                  <span className="text-[11.5px] text-gray-500">受注 {g.salesName || '—'} ／ 管理 {g.managerName || '—'}</span>
                  <span className="ml-auto text-[13px] font-bold text-purple-700 tabular-nums">¥{yen(sub)}</span>
                </div>
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] text-gray-500 border-b border-gray-100">
                      <th className="px-3 py-1.5 text-left font-semibold w-28">発生日</th>
                      <th className="px-3 py-1.5 text-left font-semibold w-24">区分</th>
                      <th className="px-3 py-1.5 text-left font-semibold">内容</th>
                      <th className="px-3 py-1.5 text-right font-semibold w-28">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map(r => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                        <td className="px-3 py-1.5 font-mono text-gray-600">{r.date ?? '—'}</td>
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-red-50 text-red-700 border border-red-200">{r.kind}</span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-700">{r.label}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-purple-700">¥{yen(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ExpenseHelp() {
  return (
    <HelpHint title="この表は何か" width={400}>
      <span className="block mb-2">
        <b className="text-gray-900">経費</b>は、お客様に請求しない自社負担の費用です。売上ではないので確定売上表には出しません。
      </span>
      <span className="block mb-2">
        いまの発生源は、戸籍請求・不動産の資料請求で<b className="text-gray-900">請求区分を「誤請求」にした行</b>です。
        請求先や対象者を間違えて取ってしまったぶんは、立替実費としてお客様に請求できないため、ここに集めます。
      </span>
      <span className="block text-gray-500">
        金額は 費用予算 − 返金（返金が無ければ確定費用）。発生日は請求日です。
        担当者別・部門別の集計は今は行いません（表に受注・管理は出しています）。
      </span>
    </HelpHint>
  )
}

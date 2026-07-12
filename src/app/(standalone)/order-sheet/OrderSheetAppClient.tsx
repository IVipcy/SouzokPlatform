'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronRight, FilePenLine, CircleCheck } from 'lucide-react'
import { CASE_STATUSES } from '@/lib/constants'

// オーダーシート入力アプリ TOP の1行ぶん（一覧表示に必要な最小項目）
export type OsCaseRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  order_route: string | null
  meeting_executed_date: string | null
  order_sheet_completed_at: string | null
  clientName: string | null
}

// 絞り込みタブ（対象＝登録済み・対応中前の自分担当案件）
const FILTERS = ['すべて', '検討中', '検討中（契約書待ち）', '受注', '戻り受注'] as const

export default function OrderSheetAppClient({ cases }: { cases: OsCaseRow[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<string>('すべて')

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return cases.filter(c => {
      if (filter !== 'すべて' && c.status !== filter) return false
      if (!qq) return true
      return [c.case_number, c.deal_name, c.clientName ?? ''].some(s => s.toLowerCase().includes(qq))
    })
  }, [cases, q, filter])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[17px] font-bold text-gray-900">担当案件</h1>
        <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full">未対応中 {cases.length}件</span>
      </div>
      <p className="text-[12px] text-gray-400 mb-3">登録済み・まだ作業進行中になっていない自分の案件</p>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={1.75} />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="案件番号・依頼者名で検索"
          className="w-full h-11 bg-gray-50 border-[1.5px] border-gray-200 rounded-lg pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-brand-500 focus:bg-white transition"
        />
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {FILTERS.map(f => {
          const active = filter === f
          const label = f === '検討中（契約書待ち）' ? '依頼確定待ち' : f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-[12px] px-3 py-1.5 rounded-full border transition ${active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="py-14 text-center text-[13px] text-gray-400">該当する案件がありません</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map(c => {
            const statusDef = CASE_STATUSES.find(s => s.key === c.status)
            const done = !!c.order_sheet_completed_at
            return (
              <Link
                key={c.id}
                href={`/order-sheet/${c.id}`}
                className="flex items-center gap-3 border border-gray-200 rounded-xl px-3.5 py-3 bg-white hover:border-brand-300 hover:bg-brand-50/30 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono text-gray-400">{c.case_number}</span>
                    {statusDef && (
                      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusDef.color}1A`, color: statusDef.color }}>
                        {statusDef.label}
                      </span>
                    )}
                  </div>
                  <div className="text-[14.5px] font-semibold text-gray-900 truncate">{c.clientName || c.deal_name} 様</div>
                  <div className={`text-[11px] mt-0.5 inline-flex items-center gap-1 ${done ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {done ? <CircleCheck className="w-3.5 h-3.5" strokeWidth={1.75} /> : <FilePenLine className="w-3.5 h-3.5" strokeWidth={1.75} />}
                    オーダーシート {done ? '完成' : '未完成'}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" strokeWidth={1.75} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

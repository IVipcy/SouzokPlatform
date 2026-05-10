'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Send, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import DispatchTable from '@/components/features/dispatches/DispatchTable'
import type { DocumentDispatchRow } from '@/types'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
}

type Props = {
  dispatches: DocumentDispatchRow[]
  cases: CaseLite[]
}

export default function DispatchesClient({ dispatches, cases }: Props) {
  const [search, setSearch] = useState('')
  const [showEmpty, setShowEmpty] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 案件IDごとにグルーピング
  const byCase = useMemo(() => {
    const m = new Map<string, DocumentDispatchRow[]>()
    for (const d of dispatches) {
      if (!m.has(d.case_id)) m.set(d.case_id, [])
      m.get(d.case_id)!.push(d)
    }
    return m
  }, [dispatches])

  // 表示対象の案件を決定（発着がある案件のみ or 空も含む）
  const visibleCases = useMemo(() => {
    const list = showEmpty ? cases : cases.filter(c => byCase.has(c.id))
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(c =>
      c.case_number.toLowerCase().includes(q) ||
      c.deal_name.toLowerCase().includes(q),
    )
  }, [cases, byCase, showEmpty, search])

  const totalDispatches = dispatches.length
  const totalCasesWithDispatches = byCase.size

  const toggle = (caseId: string) => {
    setCollapsed(prev => ({ ...prev, [caseId]: !prev[caseId] }))
  }

  return (
    <div className="pb-8">
      {/* ヘッダー */}
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium text-brand-600 tracking-wider uppercase">Document Ledger</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 tracking-tight flex items-center gap-2">
            <Send className="w-6 h-6 text-brand-600" />
            書類発着管理簿
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            全 {totalCasesWithDispatches} 案件・{totalDispatches} 件の発着記録
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={e => setShowEmpty(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span>記録なし案件も表示</span>
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="案件番号・案件名で絞り込み"
              className="pl-8 pr-3 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none w-64"
            />
          </div>
        </div>
      </div>

      {visibleCases.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
          {dispatches.length === 0
            ? 'まだ発着記録はありません。案件詳細の「郵送管理」タブから登録できます。'
            : '該当する案件が見つかりませんでした。'}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleCases.map(c => {
            const rows = byCase.get(c.id) ?? []
            const isCollapsed = collapsed[c.id]
            return (
              <section key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-brand-50/40 to-white flex items-center gap-3">
                  <button
                    onClick={() => toggle(c.id)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label={isCollapsed ? '展開' : '折りたたみ'}
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/cases/${c.id}?tab=mailing`}
                      className="inline-flex items-center gap-2 group"
                    >
                      <span className="text-[12px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                        {c.case_number}
                      </span>
                      <span className="text-[14px] font-bold text-gray-900 group-hover:text-brand-700 group-hover:underline truncate">
                        {c.deal_name}
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-brand-500" />
                    </Link>
                  </div>
                  <span className="text-[12px] text-gray-500 font-mono">
                    {rows.length} 件
                  </span>
                </div>
                {!isCollapsed && (
                  <div className="p-3">
                    <DispatchTable caseId={c.id} rows={rows} />
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

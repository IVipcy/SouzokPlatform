'use client'

import { useState, useMemo } from 'react'
import type { CaseRow, ClientRow } from '@/types'
import type { SelectedCase } from './MeetingPageClient'

type CaseData = CaseRow & { clients?: ClientRow | null }

type Props = {
  cases: CaseData[]
  onSelect: (c: SelectedCase) => void
}

export default function CaseSelectScreen({ cases, onSelect }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return cases
    const q = search.toLowerCase()
    return cases.filter(c =>
      c.case_number.toLowerCase().includes(q) ||
      c.deal_name.toLowerCase().includes(q) ||
      (c.clients?.name ?? '').toLowerCase().includes(q) ||
      (c.clients?.phone ?? '').includes(q)
    )
  }, [cases, search])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-base font-bold tracking-tight mb-1">面談設定済 案件一覧</div>
          <div className="text-[13px] text-gray-500">案件を選択するか、新規で面談を作成してください</div>
        </div>
        <button
          onClick={() => onSelect({ id: 'new', name: '新規案件', client: '', phone: '' })}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex-shrink-0"
        >
          ＋ 新規面談を作成
        </button>
      </div>

      <div className="flex gap-2 mb-3.5">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="案件名・依頼者名・電話番号で検索"
            className="w-full py-2.5 px-9 border-[1.5px] border-gray-200 rounded-lg text-[13px] text-gray-900 bg-white outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 transition"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">🔍</span>
        </div>
        <div className="flex items-center text-xs text-gray-400">{filtered.length} 件</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-400 tracking-wide">案件番号</th>
              <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-400 tracking-wide">案件名</th>
              <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-400 tracking-wide">依頼者</th>
              <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-400 tracking-wide">電話番号</th>
              <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-400 tracking-wide">ステータス</th>
              <th className="bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-400 tracking-wide w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-gray-400">
                  {cases.length === 0 ? '面談設定済の案件がありません' : '検索条件に一致する案件がありません'}
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => onSelect({ id: c.id, name: c.deal_name, client: c.clients?.name ?? '', phone: c.clients?.phone ?? '' })}
                >
                  <td className="px-3.5 py-2.5">
                    <span className="font-mono text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{c.case_number}</span>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-semibold text-gray-900">{c.deal_name}</td>
                  <td className="px-3.5 py-2.5 text-xs text-gray-600">{c.clients?.name ?? '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs font-mono text-gray-500">{c.clients?.phone ?? '—'}</td>
                  <td className="px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <button
                      onClick={e => { e.stopPropagation(); onSelect({ id: c.id, name: c.deal_name, client: c.clients?.name ?? '', phone: c.clients?.phone ?? '' }) }}
                      className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 transition"
                    >
                      選択
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronRight, FilePenLine, CircleCheck, FileSpreadsheet, FilePlus2, ArrowLeft } from 'lucide-react'
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

// TOP＝新規作成/修正の2択。新規作成＝未完成の案件、修正＝完成済の案件を表示・検索する。
type Mode = 'top' | 'new' | 'edit'

export default function OrderSheetAppClient({ cases }: { cases: OsCaseRow[] }) {
  const [mode, setMode] = useState<Mode>('top')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<string>('すべて')

  // 新規作成＝オーダーシート未完成（未着手＋入力途中）／修正＝完成済
  const baseCases = useMemo(
    () => cases.filter(c => (mode === 'edit' ? !!c.order_sheet_completed_at : !c.order_sheet_completed_at)),
    [cases, mode],
  )

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return baseCases.filter(c => {
      if (filter !== 'すべて' && c.status !== filter) return false
      if (!qq) return true
      return [c.case_number, c.deal_name, c.clientName ?? ''].some(s => s.toLowerCase().includes(qq))
    })
  }, [baseCases, q, filter])

  const backToTop = () => { setMode('top'); setQ(''); setFilter('すべて') }

  // TOP（2択）
  if (mode === 'top') {
    return (
      <div className="max-w-[420px] mx-auto mt-2">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3">
            <FileSpreadsheet className="w-6 h-6 text-brand-600" strokeWidth={2} />
          </div>
          <h1 className="text-[17px] font-bold text-gray-900 mb-1">オーダーシートの作成・修正</h1>
          <p className="text-[13px] text-gray-500">どちらを行いますか？</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode('new')}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-brand-300 bg-brand-50/60 hover:bg-brand-50 transition text-left"
          >
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
              <FilePlus2 className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold text-gray-900">オーダーシートを新規作成</div>
              <div className="text-[12px] text-gray-500 mt-0.5">まだ作成していない案件から選ぶ</div>
            </div>
            <ChevronRight className="w-[18px] h-[18px] text-brand-400 flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setMode('edit')}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition text-left"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
              <FilePenLine className="w-5 h-5 text-gray-500" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold text-gray-900">オーダーシートを修正</div>
              <div className="text-[12px] text-gray-500 mt-0.5">作成済みの案件を修正する</div>
            </div>
            <ChevronRight className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
          </button>
        </div>
      </div>
    )
  }

  // 一覧（新規作成 or 修正）
  const isNew = mode === 'new'
  return (
    <div>
      <button type="button" onClick={backToTop} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700 mb-2.5">
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />TOPに戻る
      </button>

      <h1 className="text-[17px] font-bold text-gray-900 mb-1">{isNew ? 'オーダーシートを新規作成' : 'オーダーシートを修正'}</h1>
      <p className="text-[12px] text-gray-400 mb-3">{isNew ? 'オーダーシート未作成の担当案件' : '作成済みの担当案件'}</p>

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
        <div className="py-14 text-center text-[13px] text-gray-400">{isNew ? '未作成の案件がありません' : '作成済みの案件がありません'}</div>
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

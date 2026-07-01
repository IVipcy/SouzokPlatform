'use client'

import { useState, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CaseRow, ClientRow } from '@/types'
import type { SelectedCase } from './MeetingPageClient'

type CaseData = CaseRow & { clients?: ClientRow | null }

// 検索一致部分をハイライト（小文字で位置判定・表示は原文）。
function highlight(text: string, q: string) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <span className="bg-brand-100 text-brand-700 rounded-[3px] px-0.5">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  )
}

type Props = {
  cases: CaseData[]
  onSelect: (c: SelectedCase) => void
}

export default function CaseSelectScreen({ cases, onSelect }: Props) {
  const [search, setSearch] = useState('')

  // 相続ステーション連携で件数が多い（月200件規模）ため、未検索時はリストを出さず検索を促す。
  // 連携直後はこのシステムの案件番号が未採番なので、LP案件管理番号・電話番号でも検索できるようにする。
  const q = search.trim().toLowerCase()
  const hasQuery = q.length > 0
  const filtered = useMemo(() => {
    if (!hasQuery) return []
    return cases.filter(c =>
      (c.case_number ?? '').toLowerCase().includes(q) ||
      (c.lp_case_number ?? '').toLowerCase().includes(q) ||
      c.deal_name.toLowerCase().includes(q) ||
      (c.clients?.name ?? '').toLowerCase().includes(q) ||
      (c.clients?.phone ?? '').includes(q) ||
      (c.clients?.mobile_phone ?? '').includes(q)
    )
  }, [cases, q, hasQuery])

  // 選択時に MeetingForm へ渡すペイロード（連携の初期値を引き継ぐ）。
  const pick = (c: CaseData) => onSelect({
    id: c.id, name: c.deal_name, client: c.clients?.name ?? '', phone: c.clients?.phone ?? '',
    orderRoute: c.order_route, orderRouteDetail: c.order_route_detail,
    deceasedName: c.deceased_name, deceasedFurigana: c.deceased_furigana,
    deceasedBirthDate: c.deceased_birth_date, dateOfDeath: c.date_of_death,
    deceasedAddress: c.deceased_address, deceasedRegisteredAddress: c.deceased_registered_address,
    clientFurigana: c.clients?.furigana ?? null,
    clientRelation: c.clients?.relationship_to_deceased ?? null,
    clientMobilePhone: c.clients?.mobile_phone ?? null,
    clientEmail: c.clients?.email ?? null,
    clientAddress: c.clients?.address ?? null,
    clientPostalCode: c.clients?.postal_code ?? null,
    clientNotes: c.clients?.notes ?? null,
    hearingContent: c.hearing_content, specialNotes: c.special_notes, otherNeeds: c.other_needs,
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-base font-bold tracking-tight mb-1">面談設定済 案件一覧</div>
          <div className="text-[13px] text-gray-500">案件を選択するか、新規で相談案件を登録してください</div>
        </div>
        <button
          onClick={() => onSelect({ id: 'new', name: '新規案件', client: '', phone: '' })}
          className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition flex-shrink-0"
        >
          ＋ 相談案件登録
        </button>
      </div>

      <div className="flex gap-2 mb-3.5">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="LP案件管理番号・依頼者名・電話番号で検索"
            className="w-full py-2.5 px-9 border-[1.5px] border-gray-200 rounded-lg text-[13px] text-gray-900 bg-white outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/10 transition"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">🔍</span>
        </div>
        {hasQuery && <div className="flex items-center text-xs text-gray-400 whitespace-nowrap">{filtered.length} 件</div>}
      </div>

      {!hasQuery ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-1.5">🔍</div>
          <p className="text-[13px] text-gray-500">検索すると候補が表示されます</p>
          <p className="text-[11.5px] text-gray-400 mt-1">番号・名前・電話の一部だけでも検索できます（例：SKN0）</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center text-[13px] text-gray-400">
          {cases.length === 0 ? '面談設定済の案件がありません' : '検索条件に一致する案件がありません'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className="w-full text-left flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-brand-300 hover:bg-brand-50/30 active:scale-[0.99] transition"
            >
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-[11px] text-gray-400 mb-0.5 break-all">{highlight(c.lp_case_number || c.case_number || '—', q)}</span>
                <span className="block text-[15px] font-semibold text-gray-900 truncate">{c.clients?.name ?? '—'}</span>
                <span className="block font-mono text-[12.5px] text-gray-500 mt-0.5">{highlight(c.clients?.phone || c.clients?.mobile_phone || '—', q)}</span>
              </span>
              <span className="flex-none inline-flex items-center gap-0.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-[13px] font-semibold">
                選択<ChevronRight className="w-4 h-4" strokeWidth={2.25} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

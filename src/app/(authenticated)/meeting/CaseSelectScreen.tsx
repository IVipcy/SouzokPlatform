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
          <p className="text-[13px] text-gray-500">LP案件管理番号・依頼者名・電話番号で検索してください</p>
          <p className="text-[11.5px] text-gray-400 mt-1">連携案件から該当の面談案件を探して選択します。新規はこの上の「相談案件登録」から。</p>
        </div>
      ) : (
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-brand-50/60 border-b border-brand-100 px-3.5 py-2.5 text-left text-[11px] font-medium text-brand-700 tracking-[0.04em]">LP案件管理番号</th>
              <th className="bg-brand-50/60 border-b border-brand-100 px-3.5 py-2.5 text-left text-[11px] font-medium text-brand-700 tracking-[0.04em]">依頼者名</th>
              <th className="bg-brand-50/60 border-b border-brand-100 px-3.5 py-2.5 text-left text-[11px] font-medium text-brand-700 tracking-[0.04em]">電話番号</th>
              <th className="bg-brand-50/60 border-b border-brand-100 px-3.5 py-2.5 text-left text-[11px] font-medium text-brand-700 tracking-[0.04em]">面談予定日</th>
              <th className="bg-brand-50/60 border-b border-brand-100 px-3.5 py-2.5 text-left text-[11px] font-medium text-brand-700 tracking-[0.04em] w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-400">
                  {cases.length === 0 ? '面談設定済の案件がありません' : '検索条件に一致する案件がありません'}
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => onSelect({
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
                  })}
                >
                  <td className="px-3.5 py-2.5">
                    <span className="font-mono text-[12px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 break-all">{c.lp_case_number || c.case_number || '—'}</span>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-semibold text-gray-900">{c.clients?.name ?? '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs font-mono text-gray-600">{c.clients?.phone || c.clients?.mobile_phone || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs font-mono text-gray-600">{c.meeting_date ?? '—'}</td>
                  <td className="px-3.5 py-2.5">
                    <button
                      onClick={e => { e.stopPropagation(); onSelect({
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
                  }) }}
                      className="px-2.5 py-1 rounded-md bg-brand-600 text-white text-[13px] font-semibold hover:bg-brand-700 transition"
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
      )}
    </div>
  )
}

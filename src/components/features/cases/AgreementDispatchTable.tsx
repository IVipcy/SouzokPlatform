'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { AgreementDispatchRow, HeirRow } from '@/types'

type Props = {
  caseId: string
  heirs: HeirRow[]
  dispatches: AgreementDispatchRow[]
  onRefresh?: () => void
}

/**
 * 遺産分割協議書の送付・受領管理。1行＝1相続人（相続人一覧から自動展開）。
 * 「協議書の送付・調印 = OCから各相続人へ」のときだけ表示する。
 * 各相続人へ協議書を送付（送付日）→ 署名・押印して返送してもらう（受領日・受領済）を管理。
 * レコードは相続人ごとに upsert（初回入力時に作成）。
 */
export default function AgreementDispatchTable({ caseId, heirs, dispatches, onRefresh }: Props) {
  const supabase = createClient()
  // heir_id -> dispatch のマップ（行はheirs基準で描画）。propsからmemo化し、
  // 編集はoverridesに楽観反映 → onRefreshでpropsが更新されると自然に収束。
  const base = useMemo(() => {
    const m: Record<string, AgreementDispatchRow> = {}
    for (const d of dispatches) if (d.heir_id) m[d.heir_id] = d
    return m
  }, [dispatches])
  const [overrides, setOverrides] = useState<Record<string, Partial<AgreementDispatchRow>>>({})
  const byHeir = useMemo(() => {
    const m: Record<string, Partial<AgreementDispatchRow>> = {}
    const ids = new Set([...Object.keys(base), ...Object.keys(overrides)])
    for (const id of ids) m[id] = { ...base[id], ...overrides[id] }
    return m
  }, [base, overrides])

  const save = async (heir: HeirRow, patch: Partial<AgreementDispatchRow>) => {
    // 楽観更新
    setOverrides(prev => ({ ...prev, [heir.id]: { ...prev[heir.id], ...patch } }))
    const normalized = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]),
    )
    const { error } = await supabase
      .from('agreement_dispatches')
      .upsert(
        { case_id: caseId, heir_id: heir.id, sort_order: heir.sort_order ?? 0, ...normalized },
        { onConflict: 'case_id,heir_id' },
      )
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
    else onRefresh?.()
  }

  const dateCls = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'

  const sentCount = heirs.filter(h => byHeir[h.id]?.sent_date).length
  const recvCount = heirs.filter(h => byHeir[h.id]?.received).length

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[12px] text-gray-500">
        <span>送付 <span className="font-semibold text-gray-700">{sentCount}</span> / {heirs.length}</span>
        <span>受領 <span className="font-semibold text-green-600">{recvCount}</span> / {heirs.length}</span>
        {heirs.length > 0 && recvCount === heirs.length && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-green-50 text-green-600 border border-green-200">全員受領済</span>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-40">相続人</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">送付日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">返送（受領）日</th>
              <th className="px-2.5 py-2 text-center font-semibold w-16">受領済</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
            </tr>
          </thead>
          <tbody>
            {heirs.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-400">相続人を追加すると一覧に表示されます</td></tr>
            ) : heirs.map((h, i) => {
              const d = byHeir[h.id]
              return (
                <tr key={h.id} className={`border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-1.5">
                    <div className="text-[13px] font-semibold text-gray-800">{h.name}</div>
                    {(h.relationship_type || h.relationship) && (
                      <div className="text-[11px] text-gray-400">{h.relationship_type ?? h.relationship}</div>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input type="date" defaultValue={d?.sent_date ?? ''} key={`s-${d?.sent_date ?? ''}`} onBlur={e => { if (e.target.value !== (d?.sent_date ?? '')) save(h, { sent_date: e.target.value || null }) }} className={dateCls} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input type="date" defaultValue={d?.received_date ?? ''} key={`r-${d?.received_date ?? ''}`} onBlur={e => { if (e.target.value !== (d?.received_date ?? '')) save(h, { received_date: e.target.value || null }) }} className={dateCls} />
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <input type="checkbox" checked={d?.received ?? false} onChange={e => save(h, { received: e.target.checked })} className="w-4 h-4 accent-brand-600 cursor-pointer" />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <input type="text" defaultValue={d?.notes ?? ''} key={`n-${h.id}`} onBlur={e => { if (e.target.value !== (d?.notes ?? '')) save(h, { notes: e.target.value || null }) }} placeholder="—" className={dateCls} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">各相続人へ協議書を送付（送付日）→ 署名・押印のうえ返送してもらい、受領を確認（返送日・受領済）します。</p>
    </div>
  )
}

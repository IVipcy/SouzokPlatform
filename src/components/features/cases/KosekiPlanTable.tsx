'use client'

// 戸籍の取得計画（オーダーシート）。1行＝1人。
//
// 「誰の、どんな戸籍が要りそうか」の見立てをここで決める。役所までは決めない。
// 実務タブ（戸籍請求）は、これをもとに事務管理が依頼書1枚ずつに割っていく。
//   ・戸籍と戸籍の附票は1枚で請求できる → 同じ行
//   ・戸籍と住民票は1枚で請求できない   → 行を分ける
// この見立ては、実務タブで戸籍を追加したときの「請求範囲」の初期値になる。

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import SelectOrTextField from './SelectOrTextField'
import { KOSEKI_PLAN_RANGES, KOSEKI_PLAN_ADDRESS_DOCS } from '@/lib/constants'
import type { CaseRow, HeirRow, KosekiPlanRow } from '@/types'

type Props = {
  caseId: string
  caseData: CaseRow
  heirs: HeirRow[]
}

const cellInp = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition'
const cellSel = 'w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

export default function KosekiPlanTable({ caseId, caseData, heirs }: Props) {
  const [plans, setPlans] = useState<Record<string, KosekiPlanRow>>({})
  const [loading, setLoading] = useState(true)

  // 対象者＝被相続人＋相続人。名前で対応づける（実務タブの請求対象者と同じキー）。
  // 依頼者は戸籍請求の起点（この人の戸籍から出す）なので、ここで分かるようにバッジを出す。
  const people: { name: string; role: string; isClient?: boolean }[] = [
    ...(caseData.deceased_name ? [{ name: caseData.deceased_name, role: '被相続人' }] : []),
    ...heirs.filter(h => h.name).map(h => ({ name: h.name, role: h.relationship || '相続人', isClient: !!h.is_client })),
  ]

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await createClient().from('koseki_plans').select('*').eq('case_id', caseId)
      if (!alive) return
      const map: Record<string, KosekiPlanRow> = {}
      for (const p of (data ?? []) as KosekiPlanRow[]) map[p.person_name.trim()] = p
      setPlans(map)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [caseId])

  // 1マス変えるたびに保存（人ごとに1行。無ければ作る）
  const save = async (name: string, field: 'range_text' | 'address_doc' | 'note', value: string) => {
    const key = name.trim()
    const v = value.trim() || null
    setPlans(prev => ({ ...prev, [key]: { ...(prev[key] ?? {} as KosekiPlanRow), person_name: key, [field]: v } as KosekiPlanRow }))
    const supabase = createClient()
    const { error } = await supabase.from('koseki_plans')
      .upsert({ case_id: caseId, person_name: key, [field]: v }, { onConflict: 'case_id,person_name' })
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  if (loading) return <div className="text-[12px] text-gray-400 py-3">読み込み中…</div>
  if (people.length === 0) {
    return <div className="text-[12px] text-gray-400 py-3">被相続人・相続人を登録すると、ここに取得計画の表が出ます。</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse" style={{ minWidth: 680 }}>
        <thead>
          <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
            <th className="px-2 py-2 text-left font-semibold w-48">対象者</th>
            <th className="px-2 py-2 text-left font-semibold w-40">戸籍の取得範囲</th>
            <th className="px-2 py-2 text-left font-semibold w-40">住所関係書類</th>
            <th className="px-2 py-2 text-left font-semibold">備考</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const plan = plans[p.name.trim()]
            return (
              <tr key={p.name} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2 py-1.5">
                  <span className="text-[12.5px] text-gray-800">{p.name}</span>
                  <span className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10.5px] text-gray-400">{p.role}</span>
                    {p.isClient && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200"
                        title="この案件を依頼した相続人。戸籍請求はこの人の分から出します">依頼者</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <SelectOrTextField
                    value={plan?.range_text ?? null}
                    options={KOSEKI_PLAN_RANGES}
                    onSave={v => save(p.name, 'range_text', v)}
                    placeholder="出生～死亡すべて 等"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select value={plan?.address_doc ?? ''} onChange={e => save(p.name, 'address_doc', e.target.value)}
                    style={{ fontFamily: 'inherit' }} className={cellSel}>
                    <option value="">—</option>
                    {KOSEKI_PLAN_ADDRESS_DOCS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input defaultValue={plan?.note ?? ''} placeholder="（任意）"
                    onBlur={e => { if (e.target.value !== (plan?.note ?? '')) save(p.name, 'note', e.target.value) }}
                    className={cellInp} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-gray-400">
        ここは「どんな戸籍が要りそうか」の見立てです。役所ごとの請求条件（筆頭者・謄本/抄本など）は、実務タブの戸籍請求で決めます。
      </p>
    </div>
  )
}

'use client'

import { Section } from '@/components/ui/InlineFields'
import type { CaseRow, HeirRow } from '@/types'

type Props = {
  caseData: CaseRow
  gyomu: string
  heirs: HeirRow[]
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

type Info = NonNullable<CaseRow['court_procedure_info']>[string]

/**
 * 調停の当事者・争点。申立人・相手方は相続人一覧から選ぶ（再入力しない）。
 * 申立ての趣旨/争点はフリーテキスト。cases.court_procedure_info[gyomu] に保持。
 */
export default function MediationParties({ caseData, gyomu, heirs, patchCase }: Props) {
  const all = caseData.court_procedure_info ?? {}
  const info: Info = all[gyomu] ?? {}
  const opponents = info.opponent_heir_ids ?? []

  const save = (patch: Partial<Info>) => {
    const nextInfo = { ...info, ...patch }
    const next = { ...all, [gyomu]: nextInfo }
    return patchCase({ court_procedure_info: next })
  }

  const toggleOpponent = (id: string) => {
    const set = new Set(opponents)
    if (set.has(id)) set.delete(id); else set.add(id)
    save({ opponent_heir_ids: [...set] })
  }

  const selCls = 'w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

  return (
    <Section title="当事者・争点" icon="⚖️">
      {heirs.length === 0 ? (
        <p className="text-[12px] text-gray-400">相続人を追加すると、申立人・相手方を選べます。</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">申立人</div>
              <select value={info.applicant_heir_id ?? ''} onChange={e => save({ applicant_heir_id: e.target.value || null })} className={selCls}>
                <option value="">未選択</option>
                {heirs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">相手方</div>
              <div className="flex flex-wrap gap-1.5">
                {heirs.map(h => {
                  const on = opponents.includes(h.id)
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggleOpponent(h.id)}
                      className={`px-2.5 py-1 rounded-full border text-[12px] transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white font-semibold' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >{h.name}</button>
                  )
                })}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">申立ての趣旨・争点</div>
            <textarea
              defaultValue={info.claim ?? ''}
              key={info.claim ?? ''}
              onBlur={e => { if (e.target.value !== (info.claim ?? '')) save({ claim: e.target.value || undefined }) }}
              rows={3}
              placeholder="例：遺産分割の方法・特別受益・寄与分 等の争点"
              className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-500 resize-y"
            />
          </div>
        </div>
      )}
    </Section>
  )
}

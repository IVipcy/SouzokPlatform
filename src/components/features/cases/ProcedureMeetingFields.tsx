'use client'

// オーダーシートの手続き系（信託契約・相続放棄・調停・遺言検認・成年後見）に出す、面談時点で分かる項目だけ。
//   家裁手続き … 管轄家庭裁判所（事件番号・申立日・期日・結果は実務で）
//   調停       … 申立人・相手方（争点は実務で）
//   信託       … 信託契約書種別・最終帰属者（信託の内容の詳細は実務で）
// 保存先は実務タブと同じ（cases.court_procedure_info[gyomu] ／ cases.trust_*）。

import { FieldGrid, FieldRow, InlineEdit, InlineSelect } from '@/components/ui/InlineFields'
import { TRUST_CONTRACT_TYPES } from '@/lib/constants'
import type { CaseRow, HeirRow } from '@/types'

type Info = NonNullable<CaseRow['court_procedure_info']>[string]

export default function ProcedureMeetingFields({ caseData, gyomu, court, mediation, trust, heirs = [], patchCase }: {
  caseData: CaseRow
  gyomu: string
  court?: boolean
  mediation?: boolean
  trust?: boolean
  heirs?: HeirRow[]
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}) {
  const all = caseData.court_procedure_info ?? {}
  const info: Info = all[gyomu] ?? {}
  const saveInfo = (patch: Partial<Info>) => {
    const nextInfo = { ...info, ...patch }
    const hasAny = Object.values(nextInfo).some(v => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    const next = { ...all }
    if (hasAny) next[gyomu] = nextInfo; else delete next[gyomu]
    return patchCase({ court_procedure_info: Object.keys(next).length ? next : null })
  }
  const opponents = info.opponent_heir_ids ?? []
  const toggleOpponent = (id: string) => {
    const set = new Set(opponents)
    if (set.has(id)) set.delete(id); else set.add(id)
    return saveInfo({ opponent_heir_ids: [...set] })
  }
  if (!court && !mediation && !trust) return null
  return (
    <FieldGrid>
      {court && <InlineEdit label="管轄家庭裁判所" value={info.court ?? null} onSave={v => saveInfo({ court: v || undefined })} hint="被相続人の最後の住所地を管轄する家庭裁判所。事件番号・申立日・期日は実務タブで入れます" />}
      {mediation && (
        <>
          <FieldRow label="申立人">
            {heirs.length === 0 ? <span className="text-[12px] text-gray-400">相続人を入れると選べます</span> : (
              <select value={info.applicant_heir_id ?? ''} onChange={e => void saveInfo({ applicant_heir_id: e.target.value || null })} style={{ fontFamily: 'inherit' }} className="input-flat w-full px-2 py-1 text-[13px] text-gray-800 outline-none">
                <option value="">未選択</option>
                {heirs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}
          </FieldRow>
          <FieldRow label="相手方">
            {heirs.length === 0 ? <span className="text-[12px] text-gray-400">相続人を入れると選べます</span> : (
              <div className="flex flex-wrap gap-1.5">
                {heirs.map(h => {
                  const on = opponents.includes(h.id)
                  return <button key={h.id} type="button" onClick={() => void toggleOpponent(h.id)} className={`px-2.5 py-1 border text-[12px] ${on ? 'bg-brand-600 border-brand-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>{h.name}</button>
                })}
              </div>
            )}
          </FieldRow>
        </>
      )}
      {trust && (
        <>
          <InlineSelect label="信託契約書種別" value={caseData.trust_contract_type} options={[...TRUST_CONTRACT_TYPES]} onSave={v => patchCase({ trust_contract_type: v || null } as Partial<CaseRow>)} />
          <InlineEdit label="最終帰属者" value={caseData.trust_final_beneficiary} onSave={v => patchCase({ trust_final_beneficiary: v || null } as Partial<CaseRow>)} />
        </>
      )}
    </FieldGrid>
  )
}

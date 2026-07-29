'use client'

import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Section, FieldGrid, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import { CONTRACT_TYPES } from '@/lib/constants'
import {
  REFERRAL_ONLY_CATEGORY,
  ORDER_CATEGORY_ROWS, CATEGORY_AUTO_GYOMU, GYOMU_SELECTOR_ROWS,
  defaultRolesForGyomu, type GyomuSelectorItem,
} from '@/lib/serviceMaster'
import { partsForCase, activePartKeys, partRank, buildParts, type ServicePart } from '@/lib/serviceParts'
import { DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import TabHeader from './TabHeader'
import HintNote from '@/components/ui/HintNote'
import { WorkContentField } from './WorkContentField'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** オーダーシート埋め込み時は TabHeader を出さない（親のセクション見出しで足りる） */
  orderSheetMode?: boolean
}

// その他（自由入力）の1行 → intake_roles の custom ロールへ変換。業務名＝タスク名、内容＝作業内容。
type CustomEntry = { name: string; detail: string }
const customToRoles = (list: CustomEntry[]): RoleRow[] =>
  list.filter(c => c.name.trim()).map(c => ({ gyomu: c.name.trim(), sagyou: c.name.trim(), note: c.detail.trim(), owner: '自社', custom: true }))

/**
 * 受注内容タブ。
 *   受注区分（3行・複数選択・並行進行）→ 遺言/信託/検認等は選ぶと管理担当業務が自動で有効。
 *   実施業務（受注区分に依存せず全表示・初期未選択）→ 選んだ業務だけ実務タブ・記入欄が出る。
 *   その他（自由入力）→ 名もなき作業をここで定義。一括生成の候補に出る（業務名＝タスク名／内容＝作業内容）。
 *   業務・作業は intake_roles(JSONB)、区分は service_parts(JSONB) に保持。
 */
export default function OrderContentTab({ caseData, patchCase, orderSheetMode = false }: Props) {
  const [parts, setParts] = useState<ServicePart[]>(() => partsForCase(caseData))
  // 通常業務（非custom）と その他（custom）を分けて保持。保存時に両方を結合して intake_roles に入れる。
  const [roles, setRoles] = useState<RoleRow[]>(() => (caseData.intake_roles ?? DEFAULT_ROLES).filter(r => !r.custom))
  const [custom, setCustom] = useState<CustomEntry[]>(() => (caseData.intake_roles ?? []).filter(r => r.custom).map(r => ({ name: r.gyomu, detail: r.note })))

  const selectedKeys = activePartKeys(parts)
  const isReferralOnly = selectedKeys.includes(REFERRAL_ONLY_CATEGORY)
  const selectedGyomu = [...new Set(roles.map(r => r.gyomu).filter(Boolean))]
  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }

  // 通常業務を更新して保存（その他は現状を維持して結合）
  const saveRoles = async (nextRoles: RoleRow[]) => {
    setRoles(nextRoles)
    await patchCase({ intake_roles: [...nextRoles, ...customToRoles(custom)] })
  }
  // その他を更新して保存（通常業務は現状を維持して結合）
  const saveCustom = async (nextCustom: CustomEntry[]) => {
    setCustom(nextCustom)
    await patchCase({ intake_roles: [...roles, ...customToRoles(nextCustom)] })
  }

  // 受注区分（3行・複数選択）。遺言/信託/検認/後見/調停/放棄/執行は選ぶと管理業務が自動で有効に。
  const setCategories = async (rawKeys: string[]) => {
    let next = [...new Set(rawKeys)]
    if (next.includes(REFERRAL_ONLY_CATEGORY) && next.length > 1) {
      const justAdded = !selectedKeys.includes(REFERRAL_ONLY_CATEGORY)
      next = justAdded ? [REFERRAL_ONLY_CATEGORY] : next.filter(k => k !== REFERRAL_ONLY_CATEGORY)
    }
    const newKeys = next.sort((a, b) => partRank(a) - partRank(b))
    const removed = selectedKeys.filter(k => !newKeys.includes(k))
    if (removed.length > 0 && !confirm('受注区分を外すと、その区分の管理業務のタブ／セクションが表示されなくなります（入力済みのデータは消えません）。よろしいですか？')) return

    // 受注区分に紐づく管理業務（auto gyomu）だけ入れ替え、実施業務セレクタ・その他で選んだ業務は保持。
    const autoValues = new Set(Object.values(CATEGORY_AUTO_GYOMU))
    const autoNew = newKeys.map(k => CATEGORY_AUTO_GYOMU[k]).filter((g): g is string => !!g)
    let nextRoles = roles.filter(r => !(autoValues.has(r.gyomu) && !autoNew.includes(r.gyomu)))
    for (const g of autoNew) if (!nextRoles.some(r => r.gyomu === g)) nextRoles = [...nextRoles, ...(defaultRolesForGyomu(g) as RoleRow[])]

    const nextParts = buildParts(newKeys)
    setParts(nextParts); setRoles(nextRoles)
    await patchCase({
      service_parts: newKeys.length ? nextParts : null,
      service_category: newKeys[0] ?? null,
      service_category_2: newKeys[1] ?? null,
      procedure_type: newKeys.length ? newKeys : null,
      intake_roles: [...nextRoles, ...customToRoles(custom)],
    })
  }

  // 実施業務セレクタのトグル。全gyomuが入っていれば ON。ON→外す、OFF→既定作業をシード。
  const toggleSelector = async (item: GyomuSelectorItem) => {
    const on = item.gyomus.every(g => selectedGyomu.includes(g))
    let next: RoleRow[]
    if (on) {
      next = roles.filter(r => !item.gyomus.includes(r.gyomu))
    } else {
      const toAdd = item.gyomus.flatMap(g => selectedGyomu.includes(g) ? [] : (defaultRolesForGyomu(g) as RoleRow[]))
      next = [...roles, ...toAdd]
    }
    await saveRoles(next)
  }

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="受注内容" description="この案件で引き受けた仕事の種類と、実際にやる作業を選びます" />}
      <Section title="受注内容">
        {/* 受注内容（提案内容）＝フリー欄。面談シート(order)と同じキーで共有・引き継ぎ（エクセルR24） */}
        <div className="mb-4">
          <WorkContentField caseData={caseData} gyomu="order" patchCase={patchCase} label="受注内容（提案内容）／面談シートと共有" />
        </div>
        {/* 受注区分（3行・複数選択） */}
        <div className="mb-4">
          <div className="text-[13px] text-gray-600 mb-1.5">受注区分（複数選択できます）</div>
          <HintNote className="mb-2">この案件で引き受けた仕事の種類です。当てはまるものを選んでください（いくつでもOK）。</HintNote>
          <div className="space-y-1.5">
            {ORDER_CATEGORY_ROWS.map((row, ri) => (
              <div key={ri} className="flex flex-wrap gap-2">
                {row.map(o => {
                  const on = selectedKeys.includes(o)
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setCategories(on ? selectedKeys.filter(x => x !== o) : [...selectedKeys, o])}
                      className={`px-4 py-2 rounded-full border-[1.5px] text-[13px] font-medium transition select-none ${on ? 'bg-brand-700 border-brand-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {selectedKeys.length > 1 && (
            <p className="mt-2 text-[12px] text-gray-500">選んだ仕事は同時に進めます。あとから足したり外したりもできます。</p>
          )}
        </div>

        {/* 実施業務（受注区分に依存せず全表示・初期未選択） */}
        <div className="mb-4">
          <div className="text-[13px] text-gray-600 mb-1.5">実施業務</div>
          <HintNote className="mb-2">この案件で実際にやる作業を選びます。選んだ作業だけ、下のタブ・記入欄に出てきます。</HintNote>
          {isReferralOnly ? (
            <p className="text-[12px] text-gray-400">「紹介のみ」の場合、自社でやる相続手続きはありません。紹介先は「他事業者紹介」タブに書いてください。</p>
          ) : (
            <div className="space-y-2">
              {GYOMU_SELECTOR_ROWS.map((row, ri) => (
                <div key={ri} className="flex flex-wrap gap-2">
                  {row.map(item => {
                    const on = item.gyomus.every(g => selectedGyomu.includes(g))
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => toggleSelector(item)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition ${on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}
                      >
                        {on && <Check className="w-3.5 h-3.5 text-brand-600" strokeWidth={2.5} />}{item.label}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* その他（自由入力）＝一括生成の候補に出る。業務名＝タスク名、内容＝作業内容。 */}
        {!isReferralOnly && (
          <div className="mb-4">
            <div className="text-[13px] text-gray-600 mb-2">その他</div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              <div className="hidden sm:flex gap-2 mb-1.5 text-[11px] text-gray-400 px-0.5">
                <span className="w-[220px]">業務名（→タスク名）</span>
                <span className="flex-1">内容（→作業内容）</span>
                <span className="w-7" />
              </div>
              <div className="space-y-1.5">
                {custom.map((c, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-1.5">
                    <input
                      type="text"
                      value={c.name}
                      onChange={e => setCustom(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                      onBlur={() => saveCustom(custom)}
                      placeholder="業務名"
                      className="w-full sm:w-[220px] px-2.5 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400"
                    />
                    <input
                      type="text"
                      value={c.detail}
                      onChange={e => setCustom(prev => prev.map((x, idx) => idx === i ? { ...x, detail: e.target.value } : x))}
                      onBlur={() => saveCustom(custom)}
                      placeholder="内容（作業内容）"
                      className="flex-1 px-2.5 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400"
                    />
                    <button
                      type="button"
                      onClick={() => saveCustom(custom.filter((_, idx) => idx !== i))}
                      className="w-7 flex-none inline-flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCustom(prev => [...prev, { name: '', detail: '' }])}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 border border-gray-200 rounded-md px-2.5 py-1 bg-white"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.25} /> 行を追加
              </button>
            </div>
          </div>
        )}

        <FieldGrid>
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => save('contract_type', v)} />
          <InlineDate label="契約日" value={caseData.contract_date} onSave={v => save('contract_date', v)} />
          <InlineSelect label="難易度" value={caseData.difficulty} options={['難', '普', '易']} onSave={v => save('difficulty', v)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => save('expected_completion_date', v || null)} hint="目安：手続き一式＝4ヵ月＋延長1ヵ月／遺産承継＝4ヵ月＋延長2ヵ月で設定してください。" />
        </FieldGrid>
      </Section>
    </div>
  )
}

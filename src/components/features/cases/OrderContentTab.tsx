'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Section, FieldGrid, FieldRow, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import SelectChip from '@/components/ui/SelectChip'
import { CONTRACT_TYPES, DIFFICULTY_LEVELS, DIFFICULTY_REASONS } from '@/lib/constants'
import {
  REFERRAL_ONLY_CATEGORY,
  ORDER_CATEGORY_ROWS, CATEGORY_AUTO_GYOMU, GYOMU_SELECTOR_ROWS,
  defaultRolesForGyomu, type GyomuSelectorItem,
} from '@/lib/serviceMaster'
import { partsForCase, activePartKeys, partRank, buildParts, type ServicePart } from '@/lib/serviceParts'
import { DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** オーダーシート埋め込み時は TabHeader を出さない（親のセクション見出しで足りる） */
  orderSheetMode?: boolean
  /** 面談シート(①)埋め込み時は、契約日・難易度・完了予定日を隠す（これらはOS/実務で入力） */
  meetingSheetMode?: boolean
  /** ガイド入力(OrderSheetGuided)時は 受注内容(提案内容)フリー欄を親の簡易メモ位置に出すため、内部では非表示 */
  hideOrderMemo?: boolean
}

// その他（自由入力）の1行 → intake_roles の custom ロールへ変換。業務名＝タスク名、内容＝作業内容。
type CustomEntry = { name: string; detail: string }
const customToRoles = (list: CustomEntry[]): RoleRow[] =>
  list.filter(c => c.name.trim()).map(c => ({ gyomu: c.name.trim(), sagyou: c.name.trim(), note: c.detail.trim(), owner: '自社', custom: true }))

/**
 * 受注内容タブ。
 *   受注区分（3行・複数選択・並行進行）→ 遺言/信託/検認等は選ぶと管理担当業務が自動で有効。
 *   実施業務（受注区分に依存せず全表示・初期未選択）→ 選んだ業務だけ実務タブ・記入欄が出る。
 *   その他（自由入力）→ 名もなき作業をここで定義。タスク追加の候補に出る（業務名＝タスク名／内容＝作業内容）。
 *   業務・作業は intake_roles(JSONB)、区分は service_parts(JSONB) に保持。
 */
export default function OrderContentTab({ caseData, patchCase, orderSheetMode = false, meetingSheetMode = false, hideOrderMemo = false }: Props) {
  const [parts, setParts] = useState<ServicePart[]>(() => partsForCase(caseData))
  // 通常業務（非custom）と その他（custom）を分けて保持。保存時に両方を結合して intake_roles に入れる。
  const [roles, setRoles] = useState<RoleRow[]>(() => (caseData.intake_roles ?? DEFAULT_ROLES).filter(r => !r.custom))
  const [custom, setCustom] = useState<CustomEntry[]>(() => (caseData.intake_roles ?? []).filter(r => r.custom).map(r => ({ name: r.gyomu, detail: r.note })))

  const selectedKeys = activePartKeys(parts)
  const isReferralOnly = selectedKeys.includes(REFERRAL_ONLY_CATEGORY)
  const selectedGyomu = [...new Set(roles.map(r => r.gyomu).filter(Boolean))]
  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }
  // 難易度の「難しい理由」（複数選択）をトグル保存
  const toggleDiffReason = (r: string) => {
    const cur = caseData.difficulty_reasons ?? []
    const next = cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r]
    save('difficulty_reasons', next.length ? next : null)
  }

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

    // 受注区分に紐づく管理業務（auto gyomu＝遺言/信託/検認/精算書 等）だけ入れ替え。
    // 実施業務セレクタ・その他で選んだ業務は保持する。
    // 受注区分1つに業務が複数ぶら下がることがある（遺産承継＝精算書作成＋指図書作成）
    const autoValues = new Set(Object.values(CATEGORY_AUTO_GYOMU).flat())
    const autoNew = newKeys.flatMap(k => {
      const g = CATEGORY_AUTO_GYOMU[k]
      return g ? (Array.isArray(g) ? g : [g]) : []
    })
    const nextRoles = roles.filter(r => !(autoValues.has(r.gyomu) && !autoNew.includes(r.gyomu)))
    for (const g of autoNew) if (!nextRoles.some(r => r.gyomu === g)) nextRoles.push(...(defaultRolesForGyomu(g) as RoleRow[]))

    // ※以前は 手続き一式/遺産承継/登記 等を選ぶと その区分の全業務(戸籍/相関図/財産調査/…)を
    //   自動で種まきしていたが、実施業務は担当者が明示的に選ぶ運用にするため 自動種まきは廃止。
    //   （受注内容を選んでも実施業務は未選択スタート。必要な業務だけチップで選ぶ）

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
      {!orderSheetMode && <TabHeader title="受注内容" description="受注内容（提案内容）と実施する予定の作業を選びます" />}
      <Section title="受注内容">
        {/* 受注内容（提案内容）＝フリー欄。面談シート(order)と同じキーで共有・引き継ぎ（エクセルR24）
            面談シート①のときは、親のMemoField(タイピング/手書き切替)が同じ work_content['order'] に書くため、
            こちらの WorkContentField は非表示にして二重欄を回避する。 */}
        {!meetingSheetMode && !hideOrderMemo && (
          <div className="mb-4">
            <WorkContentField caseData={caseData} gyomu="order" patchCase={patchCase} label="受注内容（提案内容）／面談シートと共有" />
          </div>
        )}
        {/* 受注内容（提案内容）・実施業務・その他業務：他の項目と同じ「項目名＝左｜内容＝右」の表形式。
            チップは SelectChip（未選択＝薄グレー面／選択＝青塗り＋✓）で全画面統一。 */}
        <div className="mb-4">
          <FieldGrid cols={1}>
            <FieldRow label="受注内容（提案内容）" labelNote={<span className="text-[10.5px] font-normal text-gray-400">（複数選択可）</span>}>
              <div className="flex flex-wrap gap-2">
                {ORDER_CATEGORY_ROWS.flat().map(o => {
                  const on = selectedKeys.includes(o)
                  return (
                    <SelectChip key={o} on={on} onClick={() => setCategories(on ? selectedKeys.filter(x => x !== o) : [...selectedKeys, o])}>{o}</SelectChip>
                  )
                })}
              </div>
              {selectedKeys.length > 1 && (
                <p className="text-[12px] text-gray-500">選んだ仕事は同時に進めます。あとから足したり外したりもできます。</p>
              )}
            </FieldRow>
            <FieldRow label="実施業務" labelNote={<span className="text-[10.5px] font-normal text-gray-400">（複数選択可）</span>} hint="実施する予定の作業を選択してください。選んだ業務だけ実務タブ・記入欄が出ます。">
              {isReferralOnly ? (
                <p className="text-[12px] text-gray-400">「紹介のみ」の場合、自社でやる相続手続きはありません。紹介先は「他事業者紹介」タブに書いてください。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {GYOMU_SELECTOR_ROWS.flat().map(item => {
                    const on = item.gyomus.every(g => selectedGyomu.includes(g))
                    return (
                      <SelectChip key={item.label} on={on} onClick={() => toggleSelector(item)}>{item.label}</SelectChip>
                    )
                  })}
                </div>
              )}
            </FieldRow>

            {!isReferralOnly && (
              <FieldRow label="その他業務" labelNote={<span className="text-[10.5px] font-normal text-gray-400">（自由追加）</span>} hint="タスク追加の候補に出ます。業務名＝タスク名、内容＝作業内容になります。">
                <div className="space-y-1.5">
                  {custom.map((c, i) => (
                    <div key={i} className="flex flex-col sm:flex-row gap-1.5">
                      <input
                        type="text"
                        value={c.name}
                        onChange={e => setCustom(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                        onBlur={() => saveCustom(custom)}
                        placeholder="業務名（→タスク名）"
                        className="w-full sm:w-[220px] px-2.5 py-1.5 text-[13px] rounded-md focus:outline-none"
                      />
                      <input
                        type="text"
                        value={c.detail}
                        onChange={e => setCustom(prev => prev.map((x, idx) => idx === i ? { ...x, detail: e.target.value } : x))}
                        onBlur={() => saveCustom(custom)}
                        placeholder="内容（→作業内容）"
                        className="flex-1 px-2.5 py-1.5 text-[13px] rounded-md focus:outline-none"
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
                  <button
                    type="button"
                    onClick={() => setCustom(prev => [...prev, { name: '', detail: '' }])}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 rounded-md px-2.5 py-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.25} /> 行を追加
                  </button>
                </div>
              </FieldRow>
            )}
          </FieldGrid>
        </div>

        <FieldGrid>
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => save('contract_type', v)} />
          {!meetingSheetMode && <InlineDate label="契約日" value={caseData.contract_date} onSave={v => save('contract_date', v)} />}
          {!meetingSheetMode && <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => save('expected_completion_date', v || null)} hint="目安：手続き一式＝4ヵ月＋延長1ヵ月／遺産承継＝4ヵ月＋延長2ヵ月で設定してください。" />}
        </FieldGrid>

        {/* 難易度（普通/難/激難）＋難しい理由（複数選択）＋その他。面談シート(①)では非表示＝OS/実務で入力 */}
        {/* 他の項目と同じ「項目名＝左｜内容＝右」の表形式に揃える */}
        {!meetingSheetMode && (
          <div className="mt-3">
            <FieldGrid cols={1}>
              <FieldRow label="難易度">
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden self-start">
                  {DIFFICULTY_LEVELS.map((lv, i) => (
                    <button key={lv} type="button" onClick={() => save('difficulty', lv)}
                      className={`text-[13px] px-3.5 py-1.5 ${i > 0 ? 'border-l border-gray-200' : ''} ${caseData.difficulty === lv ? 'bg-brand-600 text-white font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{lv}</button>
                  ))}
                </div>
              </FieldRow>
              <FieldRow label="難しい理由" labelNote={<span className="text-[10.5px] font-normal text-gray-400">（複数選択）</span>}>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTY_REASONS.map(r => {
                    const on = (caseData.difficulty_reasons ?? []).includes(r)
                    return <SelectChip key={r} on={on} onClick={() => toggleDiffReason(r)}>{r}</SelectChip>
                  })}
                </div>
              </FieldRow>
              <FieldRow label="その他難しい理由">
                <input type="text" defaultValue={caseData.difficulty_reason_other ?? ''}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (caseData.difficulty_reason_other ?? '')) save('difficulty_reason_other', v || null) }}
                  placeholder="自由記述" className="w-full px-2.5 py-2 text-[13px] rounded-md focus:outline-none" />
              </FieldRow>
            </FieldGrid>
          </div>
        )}
      </Section>
    </div>
  )
}

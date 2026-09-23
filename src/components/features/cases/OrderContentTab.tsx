'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Section, FieldGrid, FieldRow, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import SelectChip from '@/components/ui/SelectChip'
import { CONTRACT_TYPES, KOSEKI_FIRMS, DIFFICULTY_LEVELS, DIFFICULTY_REASONS } from '@/lib/constants'
import {
  REFERRAL_ONLY_CATEGORY,
  ORDER_CATEGORY_ROWS, CATEGORY_AUTO_GYOMU, GYOMU_SELECTOR_ROWS,
  defaultRolesForGyomu, type GyomuSelectorItem,
} from '@/lib/serviceMaster'
import { partsForCase, activePartKeys, partRank, buildParts, type ServicePart } from '@/lib/serviceParts'
import { DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import type { RoleKind } from '@/components/features/tasks/NewTaskFields'
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

// その他（自由入力）の1行 → intake_roles の custom ロールへ変換。
// ここで入れたものは作業着手準備の「候補から選択」でそのままタスクになるので、タスク追加モーダルと同じ項目を持つ
// （担当区分・タスク名・作業内容・優先度・期限・外出）。業務名＝タスク名、内容＝作業内容。
type CustomEntry = { name: string; detail: string; roleKind: RoleKind; priority: string; due: string; outing: boolean }
const customToRoles = (list: CustomEntry[]): RoleRow[] =>
  list.filter(c => c.name.trim()).map(c => ({ gyomu: c.name.trim(), sagyou: c.name.trim(), note: c.detail.trim(), owner: '自社', custom: true, role_kind: c.roleKind, priority: c.priority || '通常', due: c.due || null, outing: c.outing }))
const ROLE_KIND_OPTIONS: Array<{ key: RoleKind; label: string }> = [
  { key: 'manager', label: '管理担当' }, { key: 'sales', label: '受注担当' }, { key: 'assistant', label: '事務管理' }, { key: 'touki', label: '相続登記チーム' },
]
const emptyCustom = (): CustomEntry => ({ name: '', detail: '', roleKind: 'manager', priority: '通常', due: '', outing: false })

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
  const [custom, setCustom] = useState<CustomEntry[]>(() => (caseData.intake_roles ?? []).filter(r => r.custom).map(r => ({ name: r.gyomu, detail: r.note, roleKind: (r.role_kind ?? 'manager') as RoleKind, priority: r.priority ?? '通常', due: r.due ?? '', outing: !!r.outing })))

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
      {/* オーダーシートの中では上の帯が「受注内容」なので、同じ名前の見出しを重ねない */}
      <Section title={orderSheetMode ? '' : '受注内容'}>
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

            {/* 作業ごとの要不要。「不要」にした作業はタスク候補に出ない。以前は面談結果登録の編集部品でしか変えられなかった */}
            {!isReferralOnly && roles.some(r => r.sagyou?.trim()) && (
              <FieldRow label="作業の要不要" labelNote={<span className="text-[10.5px] font-normal text-gray-400">（不要にした作業はタスク候補に出ません）</span>}>
                <div className="space-y-1.5">
                  {[...new Set(roles.map(r => r.gyomu))].map(g => (
                    <div key={g} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-gray-600 w-24 flex-none">{g}</span>
                      {roles.filter(r => r.gyomu === g && r.sagyou?.trim()).map((r, i) => {
                        const off = r.owner === '不要'
                        return (
                          <button key={`${g}-${i}`} type="button" onClick={() => void saveRoles(roles.map(x => (x === r ? { ...x, owner: off ? '自社' : '不要' } : x)))}
                            title={off ? '押すと要るに戻します' : '押すと不要にします'}
                            className={`px-2 py-0.5 text-[12px] border ${off ? 'bg-gray-100 text-gray-400 border-gray-200 line-through' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                            {r.sagyou}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </FieldRow>
            )}

            {!isReferralOnly && (
              <FieldRow label="その他業務" labelNote={<span className="text-[10.5px] font-normal text-gray-400">（自由追加）</span>} hint="ここに入れたものは、作業着手準備の「候補から選択」でそのままタスクになります。タスク追加と同じ項目（担当区分・タスク名・作業内容・優先度・期限・外出）を入れておいてください。">
                <div className="space-y-2">
                  {custom.map((c, i) => {
                    const set = (p: Partial<CustomEntry>) => setCustom(prev => prev.map((x, idx) => idx === i ? { ...x, ...p } : x))
                    const commit = () => saveCustom(custom)
                    return (
                      <div key={i} className="border border-gray-200 bg-white px-2.5 py-2 space-y-1.5">
                        <div className="flex flex-col sm:flex-row gap-1.5">
                          <select value={c.roleKind} onChange={e => { const v = e.target.value as RoleKind; setCustom(prev => { const next = prev.map((x, idx) => idx === i ? { ...x, roleKind: v } : x); void saveCustom(next); return next }) }}
                            style={{ fontFamily: 'inherit' }} className="w-full sm:w-[150px] px-2 py-1.5 text-[13px] rounded-md bg-gray-50 border border-gray-200 focus:outline-none" title="担当区分">
                            {ROLE_KIND_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                          <input type="text" value={c.name} onChange={e => set({ name: e.target.value })} onBlur={commit}
                            placeholder="タスク名" className="flex-1 px-2.5 py-1.5 text-[13px] rounded-md focus:outline-none" />
                          <button type="button" onClick={() => saveCustom(custom.filter((_, idx) => idx !== i))}
                            className="w-7 flex-none inline-flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors" title="削除">
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        </div>
                        <textarea value={c.detail} onChange={e => set({ detail: e.target.value })} onBlur={commit} rows={2}
                          placeholder="作業内容（何をどうするか）" className="w-full px-2.5 py-1.5 text-[13px] rounded-md focus:outline-none resize-y" />
                        <div className="flex flex-wrap items-center gap-3 text-[12px] text-gray-600">
                          <span className="inline-flex items-center gap-1">優先度
                            <select value={c.priority} onChange={e => { const v = e.target.value; setCustom(prev => { const next = prev.map((x, idx) => idx === i ? { ...x, priority: v } : x); void saveCustom(next); return next }) }}
                              style={{ fontFamily: 'inherit' }} className="px-2 py-1 text-[12.5px] rounded-md bg-gray-50 border border-gray-200 focus:outline-none">
                              {['通常', '急ぎ', '超急ぎ'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </span>
                          <span className="inline-flex items-center gap-1">期限
                            <input type="date" value={c.due} onChange={e => set({ due: e.target.value })} onBlur={commit} className="px-2 py-1 text-[12.5px] rounded-md bg-gray-50 border border-gray-200 focus:outline-none" />
                          </span>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={c.outing} onChange={e => { const v = e.target.checked; setCustom(prev => { const next = prev.map((x, idx) => idx === i ? { ...x, outing: v } : x); void saveCustom(next); return next }) }} className="w-3.5 h-3.5 accent-brand-600" />外出
                          </label>
                        </div>
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCustom(prev => [...prev, emptyCustom()])}
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
          {/* 実費（戸籍の小為替など）を誰の名義で請求するか。案件で1つ決まるので、
              戸籍請求ごとには選ばせず、戸籍タブの「請求法人」にこの値を出す。
              契約形態とは別。連名契約でも実費はどちらか一方の法人で請求する。 */}
          <InlineSelect label="実費請求法人" value={caseData.expense_billing_firm} options={[...KOSEKI_FIRMS]} onSave={v => save('expense_billing_firm', v)} />
          {!meetingSheetMode && <InlineDate label="契約日" value={caseData.contract_date} onSave={v => save('contract_date', v)} />}
          {!meetingSheetMode && <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => save('expected_completion_date', v || null)} hint="目安：手続き一式＝4ヵ月＋延長1ヵ月／遺産承継＝4ヵ月＋延長2ヵ月で設定してください。" />}
        </FieldGrid>

        {/* 難易度（普通/難/激難）＋難しい理由（複数選択）＋その他。面談シート(①)では非表示＝OS/実務で入力 */}
        {/* 他の項目と同じ「項目名＝左｜内容＝右」の表形式に揃える */}
        {!meetingSheetMode && (
          <div className="mt-3">
            <FieldGrid cols={1}>
              <FieldRow label="難易度">
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTY_LEVELS.map(lv => (
                    <SelectChip key={lv} on={caseData.difficulty === lv} onClick={() => save('difficulty', lv)}>{lv}</SelectChip>
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

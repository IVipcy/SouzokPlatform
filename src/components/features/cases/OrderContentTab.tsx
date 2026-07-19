'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Section, FieldGrid, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import { CONTRACT_TYPES } from '@/lib/constants'
import {
  ORDER_CATEGORIES, REFERRAL_ONLY_CATEGORY,
  gyomuForCategories, seedRolesForCategories,
} from '@/lib/serviceMaster'
import { partsForCase, activePartKeys, partRank, buildParts, type ServicePart } from '@/lib/serviceParts'
import { DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import TabHeader from './TabHeader'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** オーダーシート埋め込み時は TabHeader を出さない（親のセクション見出しで足りる） */
  orderSheetMode?: boolean
}

// 複数選択用ピル（受注区分パート）。
function MultiPills({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const selected = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(selected ? value.filter(x => x !== o) : [...value, o])}
            className={`px-4 py-2 rounded-full border-[1.5px] text-[13px] font-medium transition select-none ${
              selected ? 'bg-brand-700 border-brand-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 受注内容タブ。
 *   受注区分（複数選択・並行進行）→ 紐づく業務がプリセットで全選択表示（重複は1つ）
 *   → 業務ごとの作業に担当（既定=自社）。業務・作業・担当は intake_roles(JSONB) に保持。
 *   区分は service_parts(JSONB) に順序で保持（status は形の互換性のため進行中固定・読み取らない）。
 *   完了案件で区分を追加した場合は、別途案件ステータスを手動で「対応中」に戻してください。
 */
export default function OrderContentTab({ caseData, patchCase, orderSheetMode = false }: Props) {
  const [parts, setParts] = useState<ServicePart[]>(() => partsForCase(caseData))
  // 業務トラッキング用に intake_roles は保持するが、作業ごとの役割分担UIは廃止（担当は各実務タブで定義）。
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)

  const selectedKeys = activePartKeys(parts)
  const isReferralOnly = selectedKeys.includes(REFERRAL_ONLY_CATEGORY)
  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }

  // 受注区分（複数選択・並行進行）。追加=並び順に挿入、削除=確認。紹介のみは排他。
  const setCategories = async (rawKeys: string[]) => {
    let next = [...new Set(rawKeys)]
    if (next.includes(REFERRAL_ONLY_CATEGORY) && next.length > 1) {
      const justAdded = !selectedKeys.includes(REFERRAL_ONLY_CATEGORY)
      next = justAdded ? [REFERRAL_ONLY_CATEGORY] : next.filter(k => k !== REFERRAL_ONLY_CATEGORY)
    }
    const newKeys = next.sort((a, b) => partRank(a) - partRank(b))

    if (newKeys.length === 0) {
      setParts([]); setRoles([])
      await patchCase({ service_parts: null, service_category: null, service_category_2: null, procedure_type: null, intake_roles: [] })
      return
    }

    const removed = selectedKeys.filter(k => !newKeys.includes(k))
    if (removed.length > 0 && !confirm('受注区分を外すと、その区分の実務タブ／セクションが表示されなくなります（入力済みのデータは削除されません）。よろしいですか？')) return

    // 並行進行モデル：順序だけ持つフラットな配列に作り直す（status は使わないが互換のため進行中固定）。
    const nextParts: ServicePart[] = buildParts(newKeys)

    // 役割分担を入れ直し（既存の担当/メモは同じ業務×作業に引き継ぐ）
    const seeded = seedRolesForCategories(newKeys) as RoleRow[]
    const prevByKey = new Map(roles.map(r => [`${r.gyomu}|||${r.sagyou}`, r]))
    const merged = seeded.map(s => { const p = prevByKey.get(`${s.gyomu}|||${s.sagyou}`); return p ? { ...s, owner: p.owner, note: p.note } : s })

    setParts(nextParts); setRoles(merged)
    await patchCase({ service_parts: nextParts, service_category: newKeys[0] ?? null, service_category_2: newKeys[1] ?? null, procedure_type: newKeys, intake_roles: merged })
  }

  // 実施予定業務の選択（intake_roles の gyomu を出し入れ）。外すと該当タブ／セクションに表示されない
  // （CaseDetailClient / OrderSheet は intake_roles の gyomu でタブ・セクションを出し分ける）。
  const selectedGyomu = [...new Set(roles.map(r => r.gyomu).filter(Boolean))]
  const toggleGyomu = async (g: string) => {
    let nextRoles: RoleRow[]
    if (selectedGyomu.includes(g)) {
      nextRoles = roles.filter(r => r.gyomu !== g)
    } else {
      const seeded = seedRolesForCategories(selectedKeys) as RoleRow[]
      const toAdd = seeded.filter(s => s.gyomu === g && !roles.some(r => r.gyomu === s.gyomu && r.sagyou === s.sagyou))
      nextRoles = [...roles, ...toAdd]
    }
    setRoles(nextRoles)
    await patchCase({ intake_roles: nextRoles })
  }

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="受注内容" description="受注区分・業務・作業の設計と役割分担" />}
      <Section title="受注内容">
        <div className="mb-3">
          <div className="text-[13px] text-gray-500 mb-1.5">受注区分（複数選択できます）</div>
          <MultiPills value={selectedKeys} options={[...ORDER_CATEGORIES]} onChange={setCategories} />
          {selectedKeys.length > 1 && (
            <p className="mt-2 text-[12px] text-gray-500">
              複数の受注区分は<span className="font-semibold">並行</span>で進めます。区分の追加・削除は上のピルで操作します（完了案件は手動でステータスを「対応中」に戻してください）。
            </p>
          )}
        </div>

        {/* 実施予定業務（受注区分のすぐ下・選択式）。外すと該当タブ／セクションに表示されません。 */}
        <div className="mb-3">
          <div className="text-[13px] text-gray-500 mb-1.5">実施予定業務</div>
          {isReferralOnly ? (
            <p className="text-[12px] text-gray-400">紹介のみは自社で行う相続手続きはありません。紹介先（税理士＝相続税申告 / 不動産＝査定 / 遺品整理 / 弁護士）は「他事業者紹介」タブで入力してください。</p>
          ) : selectedKeys.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {gyomuForCategories(selectedKeys).map(g => {
                  const on = selectedGyomu.includes(g)
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGyomu(g)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition ${on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}
                    >
                      {on && <Check className="w-3.5 h-3.5 text-brand-600" strokeWidth={2.5} />}{g}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">実施する業務を選びます。外すと該当タブ／セクションに表示されません（担当は各実務タブで管理）。</p>
            </>
          ) : (
            <p className="text-[12px] text-gray-400">先に「受注区分」を選んでください。</p>
          )}
        </div>

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

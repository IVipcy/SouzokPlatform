'use client'

import { useState } from 'react'
import { Section, FieldGrid, InlineEdit, InlineSelect, InlineDate } from '@/components/ui/InlineFields'
import { CONTRACT_TYPES } from '@/lib/constants'
import {
  ORDER_CATEGORIES, REFERRAL_ONLY_CATEGORY,
  gyomuForCategories, tasksForCategories, seedRolesForCategories, kindForTask, isOptionalTask,
} from '@/lib/serviceMaster'
import { partsForCase, activePartKeys, partRank, buildParts, replaceCurrent, reopenWith, type ServicePart } from '@/lib/serviceParts'
import { IntakeRolesEditor, DEFAULT_ROLES, type RoleRow } from './ProcedureIntakeSection'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
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

// 区分を1つ選んでアクション（差し替え/再開）。選択で即実行。
function ChangePartSelect({ label, hint, options, onPick }: { label: string; hint: string; options: string[]; onPick: (key: string) => void }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-gray-600">{label}</div>
      <p className="text-[11px] text-gray-400 mb-1">{hint}</p>
      <select
        value=""
        onChange={e => { const v = e.target.value; if (v) onPick(v) }}
        className="text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 hover:border-gray-300"
      >
        <option value="">区分を選択…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

/**
 * 受注内容タブ。
 *   受注区分（複数選択・パート制）→ 紐づく業務がプリセットで全選択表示（重複は1つ）
 *   → 業務ごとの作業に担当（既定=自社）。業務・作業・担当は intake_roles(JSONB) に保持。
 *   パートは service_parts(JSONB) に順序＋status で保持。途中追加は未着手で末尾に足す（進捗は保持）。
 */
export default function OrderContentTab({ caseData, patchCase }: Props) {
  const [parts, setParts] = useState<ServicePart[]>(() => partsForCase(caseData))
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)
  // 途中（対応中）で区分を足したときに「役割分担を確認して」を促すナビ
  const [addedNotice, setAddedNotice] = useState<string[]>([])

  const selectedKeys = activePartKeys(parts)
  const isReferralOnly = selectedKeys.includes(REFERRAL_ONLY_CATEGORY)
  const save = async (field: string, value: unknown) => { await patchCase({ [field]: value ?? null } as Partial<CaseRow>) }
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }

  // 受注区分（複数選択）。追加=未着手で末尾、削除=確認（進行中/完了は進捗が失われる旨）。紹介のみは排他。
  // 進捗(完了/進行中/中止)が一切なければ buildParts で初期化、あれば既存パートの status/order を保持。
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
    const losingProgress = removed.some(k => { const p = parts.find(pp => pp.key === k); return !!p && (p.status === '完了' || p.status === '進行中') })
    if (removed.length > 0 && !confirm(losingProgress ? '進行中／完了のパートを外すと進捗が失われます。よろしいですか？' : '受注区分を外すと、その区分の業務が役割分担から消えます。よろしいですか？')) return

    const anyProgress = parts.some(p => p.status === '完了' || p.status === '進行中' || p.status === '中止')
    let nextParts: ServicePart[]
    if (!anyProgress) {
      nextParts = buildParts(newKeys)
    } else {
      const stopped = parts.filter(p => p.status === '中止')
      const kept = parts.filter(p => p.status !== '中止' && newKeys.includes(p.key))
      let maxOrder = [...stopped, ...kept].reduce((m, p) => Math.max(m, p.order), 0)
      const added = newKeys.filter(k => !kept.some(p => p.key === k)).map(k => ({ key: k, order: ++maxOrder, status: '未着手' as const }))
      nextParts = [...stopped, ...kept, ...added].sort((a, b) => a.order - b.order)
    }

    // 役割分担を入れ直し（既存の担当/メモは同じ業務×作業に引き継ぐ）
    const seeded = seedRolesForCategories(newKeys) as RoleRow[]
    const prevByKey = new Map(roles.map(r => [`${r.gyomu}|||${r.sagyou}`, r]))
    const merged = seeded.map(s => { const p = prevByKey.get(`${s.gyomu}|||${s.sagyou}`); return p ? { ...s, owner: p.owner, note: p.note } : s })

    // 対応中（=途中）で区分を足したら、役割分担の確認を促す
    const addedKeys = newKeys.filter(k => !selectedKeys.includes(k))
    if (addedKeys.length > 0 && caseData.status === '対応中') setAddedNotice(addedKeys)

    setParts(nextParts); setRoles(merged)
    await patchCase({ service_parts: nextParts, service_category: newKeys[0] ?? null, service_category_2: newKeys[1] ?? null, procedure_type: newKeys, intake_roles: merged })
  }

  // 区分追加時、既存の業務はそのまま残し、新区分の業務だけ足す（履歴・流用のため）。
  const addRolesFor = (newKey: string, existing: RoleRow[]): RoleRow[] => {
    const seeded = seedRolesForCategories([newKey]) as RoleRow[]
    const have = new Set(existing.map(r => `${r.gyomu}|||${r.sagyou}`))
    return [...existing, ...seeded.filter(s => !have.has(`${s.gyomu}|||${s.sagyou}`))]
  }
  const persistParts = async (nextParts: ServicePart[], nextRoles: RoleRow[], extra: Partial<CaseRow> = {}) => {
    const keys = activePartKeys(nextParts)
    setParts(nextParts); setRoles(nextRoles)
    await patchCase({ service_parts: nextParts, service_category: keys[0] ?? null, service_category_2: keys[1] ?? null, procedure_type: keys, intake_roles: nextRoles, ...extra })
  }

  // 差し替え（放棄等の方針変更）：現在の進行中パートを中止し、新区分を進行中に。業務は履歴として残す。
  const replaceWith = async (newKey: string) => {
    if (!confirm(`現在のパートを中止し、「${newKey}」に差し替えます。これまでの業務は履歴として残ります。よろしいですか？`)) return
    await persistParts(replaceCurrent(parts, newKey), addRolesFor(newKey, roles))
    setAddedNotice([newKey])
  }
  // 完了案件を再開：新区分を進行中で追加し、ステータスを対応中へ戻す（生前系→死亡後の再受注）。
  const reopen = async (newKey: string) => {
    if (!confirm(`完了案件を「${newKey}」で再開します（ステータスを対応中に戻します）。よろしいですか？`)) return
    await persistParts(reopenWith(parts, newKey), addRolesFor(newKey, roles), { status: '対応中' })
    setAddedNotice([newKey])
  }

  const hasRunning = parts.some(p => p.status === '進行中')
  const changeOptions = ORDER_CATEGORIES.filter(c => !selectedKeys.includes(c))

  return (
    <div className="space-y-3.5">
      <Section title="受注内容">
        <div className="mb-3">
          <div className="text-[13px] text-gray-500 mb-1.5">受注区分（複数選択できます）</div>
          <MultiPills value={selectedKeys} options={[...ORDER_CATEGORIES]} onChange={setCategories} />
          {selectedKeys.length > 1 && (
            <p className="mt-2 text-[12px] text-gray-500">
              進行順：{selectedKeys.map((k, i) => `${'①②③④⑤'[i] ?? `(${i + 1})`} ${k}`).join(' → ')}（先行→本体で自動・前から順に進みます）
            </p>
          )}
        </div>
        <FieldGrid>
          <InlineEdit label="その他手続" value={caseData.other_procedure} onSave={v => save('other_procedure', v)} />
          <InlineSelect label="契約形態" value={caseData.contract_type} options={[...CONTRACT_TYPES]} onSave={v => save('contract_type', v)} />
          <InlineSelect label="難易度" value={caseData.difficulty} options={['難', '普', '易']} onSave={v => save('difficulty', v)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => save('expected_completion_date', v || null)} />
        </FieldGrid>
        {((hasRunning && caseData.status === '対応中') || caseData.status === '完了') && changeOptions.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-6">
            {hasRunning && caseData.status === '対応中' && (
              <ChangePartSelect label="受注区分を変更（差し替え）" hint="現在のパートを中止し別区分へ。放棄などの方針変更に。" options={[...changeOptions]} onPick={replaceWith} />
            )}
            {caseData.status === '完了' && (
              <ChangePartSelect label="完了案件を再開（区分追加）" hint="生前作成→死亡後の再受注など。区分を足して対応中に戻します。" options={[...changeOptions]} onPick={reopen} />
            )}
          </div>
        )}
      </Section>

      {addedNotice.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <span className="flex-1">「{addedNotice.join('・')}」を追加しました。下の<span className="font-semibold">役割分担</span>で、増えた業務・担当（自社/依頼者）を確認してください。</span>
          <button type="button" onClick={() => setAddedNotice([])} className="text-amber-500 hover:text-amber-700 font-bold leading-none">×</button>
        </div>
      )}

      <Section title={isReferralOnly ? '紹介先（自社手続きはありません）' : '業務・役割分担（自社 / 依頼者 どちらが行うか）'}>
        {isReferralOnly ? (
          <p className="text-[12px] text-gray-400">紹介のみは自社で行う相続手続きはありません。紹介先（税理士＝相続税申告 / 不動産＝査定 / 遺品整理 / 弁護士）は「他事業者紹介」タブで入力してください。</p>
        ) : selectedKeys.length > 0 ? (
          <>
            <p className="text-[12px] text-gray-400 mb-2">
              {selectedKeys.length > 1 ? '選んだ区分の業務がまとめて表示されます（重複する業務は1つ）。' : '受注区分の業務が全選択で表示されます。'}やらない業務は外してください。作業ごとに担当（既定=自社）を変更できます。
            </p>
            <IntakeRolesEditor
              roles={roles}
              onSave={saveRoles}
              gyomuOptions={gyomuForCategories(selectedKeys)}
              presetFor={g => tasksForCategories(selectedKeys, g).filter(t => !isOptionalTask(t.task)).map(t => t.task)}
              addableFor={g => tasksForCategories(selectedKeys, g).map(t => ({ task: t.task, kind: kindForTask(selectedKeys, g, t.task) }))}
              kindFor={(g, s) => kindForTask(selectedKeys, g, s)}
            />
          </>
        ) : (
          <p className="text-[12px] text-gray-400">先に「受注区分」を選んでください。</p>
        )}
      </Section>
    </div>
  )
}

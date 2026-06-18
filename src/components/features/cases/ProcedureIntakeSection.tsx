'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus, Check, ArrowDownToLine } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { REFERRAL_ONLY_CATEGORY, categoriesOf, gyomuForCategories, tasksForCategories } from '@/lib/serviceMaster'
import ContractDocumentsTable from './ContractDocumentsTable'
import type { CaseRow, ContractDocumentRow } from '@/types'

export type DocRow = { name: string; status: string; arrival_date: string | null; note: string; category?: string }

// 調査系の業務を「依頼者」担当にしたとき、契約時にお客様からまとめてもらう書類（契約残手続きへ反映）。
// 業務(gyomu)単位で1書類にまとめる。解約・登記等の「依頼者が手続きする」系は対象外。
export const SURVEY_GYOMU_DOC: Record<string, { name: string; category: string }> = {
  '戸籍': { name: '戸籍一式（出生〜死亡・相続人の現在戸籍 等）', category: '戸籍' },
  '不動産': { name: '不動産関係書類（固定資産税通知書・権利証 等）', category: '財産' },
  '金融資産': { name: '金融資産資料（通帳コピー・残高がわかる資料 等）', category: '財産' },
}
// intake_roles から「依頼者にした調査系業務」→ もらう書類リスト（業務単位で重複排除）
export function clientProvidedDocs(roles: RoleRow[]): { name: string; category: string }[] {
  const seen = new Set<string>(); const out: { name: string; category: string }[] = []
  for (const r of roles) {
    const m = SURVEY_GYOMU_DOC[r.gyomu]
    if (r.owner === '依頼者' && m && !seen.has(r.gyomu)) { seen.add(r.gyomu); out.push(m) }
  }
  return out
}
// 役割分担: 業務（例:登記）→ 紐づく作業（複数）→ 各作業を 自社/依頼者/不要 ＋ 備考
// status/due は手続き系業務タブ（放棄/信託/調停/検認/後見）での進捗管理用（任意・JSONB）。
export type RoleRow = { gyomu: string; sagyou: string; owner: string; note: string; status?: string; due?: string | null }

const DOC_STATUS = ['その場で受領', '後日郵送', '依頼者が取得', '不要']
const ROLE_OWNER = ['自社', '依頼者', '不要']

// 業務の一覧（添付2ベース）。業務を選ぶと、その業務の定型作業が展開される。
const GYOMU_LIST = [
  '戸籍', '相関図', '法定相続情報取得', '不動産', '金融資産', '目録', '協議書',
  '登記', '解約', '手紙', '遺言起案', '申立書起案', '契約書案', '不動産査定',
]
// 業務ごとの定型作業（仮置き。後でヒアリング内容に差し替え予定）
const GYOMU_PRESET: Record<string, string[]> = {
  '戸籍': ['戸籍収集（請求・取得）', '相続人の確定'],
  '相関図': ['相続関係説明図の作成'],
  '法定相続情報取得': ['法定相続情報一覧図の申出・取得'],
  '不動産': ['登記事項証明の取得', '名寄帳請求', '固定資産評価証明取得'],
  '金融資産': ['残高証明取得', '取引履歴取得', '保険・年金照会'],
  '目録': ['財産目録の作成'],
  '協議書': ['遺産分割協議書の作成', '署名押印の回収'],
  '登記': ['相続登記の申請', '権利証の受領'],
  '解約': ['預貯金の解約・払戻', '証券の移管・売却'],
  '手紙': ['各相続人への通知・案内文の送付'],
  '遺言起案': ['遺言書文案の作成', '公証役場の調整'],
  '申立書起案': ['家裁申立書の作成・提出'],
  '契約書案': ['契約書の作成'],
  '不動産査定': ['査定の依頼・取得'],
}

// 契約時に必ずもらうオーソドックスな4点をデフォルトに。
// 戸籍・財産系（通帳コピー・運用レポート・固定資産税通知書 等）はお客様ごとに違うため、
// 自由入力で任意追加する（「到着物を追加」）。
export const DEFAULT_DOCS: DocRow[] = [
  { name: '契約書', status: '', arrival_date: null, note: '', category: '契約' },
  { name: '委任状', status: '', arrival_date: null, note: '', category: '契約' },
  { name: '本人確認書類', status: '', arrival_date: null, note: '', category: '契約' },
  { name: '印鑑証明書', status: '', arrival_date: null, note: '', category: '契約' },
]
// 役割分担は業務を選択してから作業を展開するため、初期値は空。
export const DEFAULT_ROLES: RoleRow[] = []

// ─── ① 受領書類エディタ（再利用可能） ───
export function IntakeDocsEditor({ docs, onSave }: { docs: DocRow[]; onSave: (next: DocRow[]) => void }) {
  const setDoc = (i: number, patch: Partial<DocRow>) => onSave(docs.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-56">到着物</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">受領状況</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">到着予定日</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {docs.map((d, i) => (
              <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <Cell value={d.name} onCommit={v => setDoc(i, { name: v })} placeholder="到着物名" />
                <SelectCell value={d.status} options={DOC_STATUS} onChange={v => setDoc(i, { status: v })} />
                <DateCell value={d.arrival_date} onCommit={v => setDoc(i, { arrival_date: v || null })} />
                <Cell value={d.note} onCommit={v => setDoc(i, { note: v })} placeholder="例：実印分は後日、料金 等" />
                <td className="px-2.5 py-1.5 text-center">
                  <button type="button" onClick={() => onSave(docs.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onSave([...docs, { name: '', status: '', arrival_date: null, note: '' }])} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
        <Plus className="w-3.5 h-3.5" /> 到着物を追加
      </button>
    </>
  )
}

// ─── ② 役割分担エディタ（業務→作業。再利用可能） ───
// 業務をチップで選ぶ → その業務の定型作業が展開され、各作業を 自社/依頼者/不要 で分担。
// 作業は定型＋任意追加。同じデータ（intake_roles）を面談フォーム・各タブ・OSで共有。
export function IntakeRolesEditor({ roles, onSave, gyomuOptions = GYOMU_LIST, presetFor }: {
  roles: RoleRow[]
  onSave: (next: RoleRow[]) => void
  // 受注区分マスタ駆動で業務候補・作業プリセットを差し替えるための任意引数
  gyomuOptions?: readonly string[]
  presetFor?: (gyomu: string) => string[]
}) {
  const setRole = (i: number, patch: Partial<RoleRow>) => onSave(roles.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const presetTasks = (g: string) => (presetFor ? presetFor(g) : (GYOMU_PRESET[g] ?? ['']))

  // 表示する業務グループ（候補の並び順 + 候補外のカスタム業務）
  const selected = gyomuOptions.filter(g => roles.some(r => r.gyomu === g))
  const custom = [...new Set(roles.map(r => r.gyomu).filter(g => g && !gyomuOptions.includes(g)))]
  const groups = [...selected, ...custom]

  const toggleGyomu = (g: string) => {
    const has = roles.some(r => r.gyomu === g)
    if (has) {
      const hasData = roles.some(r => r.gyomu === g && (r.owner !== '自社' || r.note))
      if (hasData && !confirm(`「${g}」を外しますか？担当の変更内容も消えます。`)) return
      onSave(roles.filter(r => r.gyomu !== g))
    } else {
      const tasks = presetTasks(g)
      const add = (tasks.length > 0 ? tasks : ['']).map(s => ({ gyomu: g, sagyou: s, owner: '自社', note: '' }))
      onSave([...roles, ...add])
    }
  }

  return (
    <div>
      {/* 業務チップ（選択で作業が展開） */}
      <div className="flex flex-wrap gap-2 mb-3">
        {gyomuOptions.map(g => {
          const on = roles.some(r => r.gyomu === g)
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggleGyomu(g)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-[12.5px] transition-colors ${
                on ? 'bg-brand-600 border-brand-600 text-white font-semibold' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {on && <Check className="w-3 h-3" />}{g}
            </button>
          )
        })}
      </div>

      {groups.length === 0 ? (
        <p className="text-[12px] text-gray-400">上の業務を選ぶと、その業務の作業（自社 / 依頼者）が表示されます。</p>
      ) : (
        groups.map(g => {
          const rowsWithIdx = roles.map((r, i) => ({ r, i })).filter(x => x.r.gyomu === g)
          return (
            <div key={g} className="mb-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-block w-[3px] h-3.5 bg-brand-600 rounded-full" />
                <span className="text-[12.5px] font-bold text-gray-700">{g}</span>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-[13px] border-collapse" style={{ minWidth: 620 }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                      <th className="px-2.5 py-2 text-left font-semibold w-64">作業</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-36">担当</th>
                      <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                      <th className="px-2.5 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rowsWithIdx.map(({ r, i }, n) => (
                      <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${n % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <Cell value={r.sagyou} onCommit={v => setRole(i, { sagyou: v })} placeholder="作業内容" />
                        <SelectCell value={r.owner} options={ROLE_OWNER} onChange={v => setRole(i, { owner: v })} />
                        <Cell value={r.note} onCommit={v => setRole(i, { note: v })} placeholder="例：名寄せは別料金 等" />
                        <td className="px-2.5 py-1.5 text-center">
                          <button type="button" onClick={() => onSave(roles.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => onSave([...roles, { gyomu: g, sagyou: '', owner: '自社', note: '' }])} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                <Plus className="w-3.5 h-3.5" /> 作業を追加
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  contractDocuments: ContractDocumentRow[]
  onRefresh?: () => void
}

/**
 * 手続き詳細（面談時のヒアリング）。新規案件登録（面談情報）時に入力する。
 *   ① 受領書類: 契約関連書類の受け取り（contract_documents・受信簿と連動）
 *   ② 役割分担: 業務→作業を自社/依頼者どちらが行うか（intake_roles JSONB）
 * 同じデータは「受注内容・契約手続き」タブでも編集できる。
 */
export default function ProcedureIntakeSection({ caseData, patchCase, contractDocuments, onRefresh }: Props) {
  const [roles, setRoles] = useState<RoleRow[]>(caseData.intake_roles ?? DEFAULT_ROLES)
  // 受注区分の変更等で intake_roles が外部から入れ直されたら同期（常時マウント画面対策）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRoles(caseData.intake_roles ?? DEFAULT_ROLES) }, [caseData.intake_roles])
  const saveRoles = (next: RoleRow[]) => { setRoles(next); patchCase({ intake_roles: next }) }
  // 受注区分が設定済みなら、業務候補・作業プリセットを serviceMaster 駆動にする（未設定の旧案件は従来の汎用候補）
  const category = caseData.service_category ?? ''
  const cats = categoriesOf(caseData.service_category, caseData.service_category_2)

  // 「依頼者」にした調査系業務（戸籍/不動産/金融資産）を、契約時にもらう到着物として契約残手続きへまとめて反映
  const [reflecting, setReflecting] = useState(false)
  const provided = clientProvidedDocs(roles)
  const reflectToContract = async () => {
    const existing = new Set((contractDocuments ?? []).map(d => (d.name ?? '').trim()))
    const toAdd = provided.filter(d => !existing.has(d.name))
    if (toAdd.length === 0) { showToast('追加する依頼者取得分はありません（反映済み）', 'info'); return }
    setReflecting(true)
    const base = contractDocuments?.length ?? 0
    const payload = toAdd.map((d, i) => ({ case_id: caseData.id, name: d.name, category: d.category, status: '依頼者が取得', sort_order: base + i }))
    const { error } = await createClient().from('contract_documents').insert(payload)
    setReflecting(false)
    if (error) { showToast(`反映に失敗しました: ${error.message}`, 'error'); return }
    showToast(`${toAdd.length}件を契約残手続き（到着物）に反映しました`, 'success')
    onRefresh?.()
  }

  return (
    <Section title="手続き詳細">
      <div className="mb-2 text-[12px] font-bold text-gray-500">① 到着物（その場で何をもらい、何が後日来るか）</div>
      <div className="mb-5">
        <ContractDocumentsTable caseId={caseData.id} documents={contractDocuments} onRefresh={onRefresh} />
      </div>
      {category === REFERRAL_ONLY_CATEGORY ? (
        <>
          <div className="mb-2 text-[12px] font-bold text-gray-500">② 紹介先（自社手続きはありません）</div>
          <p className="text-[12px] text-gray-400">紹介のみは自社で行う相続手続きはありません。紹介先（税理士＝相続税申告 / 不動産＝査定 / 遺品整理 / 弁護士）は下の「他事業者紹介要否」または「他事業者紹介」タブで入力してください。</p>
        </>
      ) : (
        <>
          <div className="mb-2 text-[12px] font-bold text-gray-500">② 役割分担（自社 / 依頼者 どちらが行うか）</div>
          <IntakeRolesEditor
            roles={roles}
            onSave={saveRoles}
            gyomuOptions={cats.length ? gyomuForCategories(cats) : undefined}
            presetFor={cats.length ? (g => tasksForCategories(cats, g).map(t => t.task)) : undefined}
          />
          {provided.length > 0 && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={reflectToContract}
                disabled={reflecting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 disabled:opacity-50"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                依頼者取得分を契約残手続き（到着物）に反映
              </button>
              <span className="text-[11px] text-gray-400">対象: {provided.map(d => d.category).join(' / ')}（契約時にお客様からまとめて受領）</span>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

function Cell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      {/* key={value}: 非制御入力なので、削除・再シードで行がずれても値で再マウントし表示ずれ（同一作業の重複表示）を防ぐ */}
      <input
        key={value}
        type="text"
        defaultValue={value}
        onBlur={e => { if (e.target.value !== value) onCommit(e.target.value) }}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}

function SelectCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )
}

function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="date"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}

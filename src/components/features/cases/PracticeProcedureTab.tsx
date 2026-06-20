'use client'

import { Trash2, Plus, ListPlus, ExternalLink } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { tasksFor, categoriesOf, kindForTask, kindOf } from '@/lib/serviceMaster'
import CourtProcedureInfo from './CourtProcedureInfo'
import TrustInfo from './TrustInfo'
import MediationParties from './MediationParties'
import ProcedureDocsTable from './ProcedureDocsTable'
import type { RoleRow } from './ProcedureIntakeSection'
import type { CaseRow, HeirRow, SagyoDocumentRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

const OWNER = ['自社', '依頼者', '不要']
// タスクの正規ステータス（着手前/対応中/完了）。進捗は tasks 側で持つ。
const TASK_STATUS = ['着手前', '対応中', '完了']
const normStatus = (s: string): string =>
  s === '未着手' ? '着手前'
  : (['Wチェック待ち', '保留'].includes(s) ? '対応中'
  : (s === 'キャンセル' ? '完了' : s))

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** 対象業務（例: 放棄手続き）。intake_roles をこの業務でフィルタして表示・編集する。 */
  gyomu: string
  title: string
  description?: string
  /** 家庭裁判所手続き（放棄/調停/検認/後見）なら家裁手続き情報を表示。 */
  court?: boolean
  /** 信託タブなら信託情報を表示。 */
  trust?: boolean
  /** 調停タブなら当事者・争点を表示。 */
  mediation?: boolean
  /** 相続人（調停の申立人・相手方の選択に使用）。 */
  heirs?: HeirRow[]
  /** 案件のタスク（実施タスク→生成したタスクの進捗を tasks 側から表示）。 */
  tasks?: TaskRow[]
  /** オーダーシートに埋め込む場合は true（外側の見出し Section を省く）。 */
  embedded?: boolean
  /** 作業に紐づく必要書類（sagyo_documents）。 */
  sagyoDocuments?: SagyoDocumentRow[]
  /** 受信簿（受領連動の選択肢）。 */
  receipts?: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 手続き系業務タブ（放棄 / 信託 / 調停 / 検認 / 後見）。相続人調査タブと同じ型で構成する：
 *   ① 家裁手続き情報（court のみ）… 管轄家裁・事件番号・申立日・期日・結果
 *   ② 資料（受領管理）… kind=doc の作業＝受領する資料を受信簿連動で管理
 *   ③ タスク（進捗）… kind=task の作業を 担当/期限/状況 で管理
 * 役割分担(intake_roles)を業務でフィルタし、各作業の kind（資料/タスク）で振り分ける。
 * 受領自体はタスクではない（②で管理）。タスクは受領した資料を使う作業（③）。
 */
export default function PracticeProcedureTab({ caseData, patchCase, gyomu, title, description, court, trust, mediation, heirs = [], tasks = [], embedded, sagyoDocuments = [], receipts = [], onRefresh }: Props) {
  const supabase = createClient()
  const roles: RoleRow[] = (caseData.intake_roles ?? []) as RoleRow[]
  const save = (next: RoleRow[]) => patchCase({ intake_roles: next })
  const cats = categoriesOf(caseData.service_category, caseData.service_category_2)
  // 行の実効kind: 明示値 → マスタ初期値 → task
  const effKind = (r: RoleRow) => r.kind ?? kindForTask(cats, gyomu, r.sagyou)

  const rowsWithIdx = roles.map((r, i) => ({ r, i })).filter(x => x.r.gyomu === gyomu)
  const docRoles = rowsWithIdx.filter(x => effKind(x.r) === 'doc').map(x => x.r)
  const taskRows = rowsWithIdx.filter(x => effKind(x.r) === 'task')
  const docs = sagyoDocuments.filter(d => d.gyomu === gyomu)

  // 実施タスク(role) → 生成済みタスク(tasks)の対応（source_rid で1対1）。進捗は tasks 側が持つ。
  const taskByRid = new Map(tasks.filter(t => t.source_rid).map(t => [t.source_rid as string, t]))
  const linkedTask = (r: RoleRow) => (r.rid ? taskByRid.get(r.rid) : undefined)

  const setRow = (i: number, patch: Partial<RoleRow>) => save(roles.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addTaskRow = () => save([...roles, { gyomu, sagyou: '', owner: '自社', note: '', kind: 'task' }])

  // 役割分担から作業が無い場合、マスタから標準作業（kind付き）を読み込む
  const seedFromMaster = () => {
    const seeded: RoleRow[] = tasksFor(caseData.service_category ?? '', gyomu)
      .map(t => ({ gyomu, sagyou: t.task, owner: '自社', note: '', kind: kindOf(t) }))
    save([...roles, ...(seeded.length ? seeded : [{ gyomu, sagyou: '', owner: '自社', note: '', kind: 'task' as const }])])
  }

  // 実施タスク行をタスク化（tasks に1件作成し、role.rid と tasks.source_rid を紐付け）。
  const makeTask = async (i: number) => {
    const r = roles[i]
    if (!r?.sagyou?.trim()) { showToast('作業名を入力してください', 'error'); return }
    const rid = r.rid ?? crypto.randomUUID()
    // role に rid を保存（未採番なら）
    if (!r.rid) await save(roles.map((x, idx) => idx === i ? { ...x, rid } : x))
    const { error } = await supabase.from('tasks').insert({
      case_id: caseData.id, task_kind: 'case', title: r.sagyou, phase: gyomu, category: gyomu,
      status: '着手前', priority: '通常', source_rid: rid, sort_order: 0,
    })
    if (error) { showToast(`タスク化に失敗しました: ${error.message}`, 'error'); return }
    showToast('タスク化しました', 'success')
    onRefresh?.()
  }

  const updateTaskField = async (taskId: string, patch: Partial<TaskRow>) => {
    const { error } = await supabase.from('tasks').update(patch).eq('id', taskId)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
    else onRefresh?.()
  }

  const body = (
    <div className="space-y-4">
      {description && <p className="text-[12px] text-gray-400">{description}</p>}

      {court && <CourtProcedureInfo caseData={caseData} gyomu={gyomu} patchCase={patchCase} />}
      {mediation && <MediationParties caseData={caseData} gyomu={gyomu} heirs={heirs} patchCase={patchCase} />}
      {trust && <TrustInfo caseData={caseData} patchCase={patchCase} />}

      {/* ② 資料（受領管理）。doc-kindの作業がある場合のみ。 */}
      {docRoles.length > 0 && (
        <Section title="書類受領（受信簿連動）" icon="📥">
          <ProcedureDocsTable caseId={caseData.id} gyomu={gyomu} docRoles={docRoles} documents={docs} receipts={receipts} onRefresh={onRefresh} />
        </Section>
      )}

      {/* ③ タスク（進捗）。 */}
      <Section title="タスク">
        {rowsWithIdx.length === 0 ? (
          <div className="text-[13px] text-gray-500">
            <p className="mb-2">この業務の作業がまだありません。</p>
            <button type="button" onClick={seedFromMaster} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> 標準の作業を読み込む
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                    <th className="px-2.5 py-2 text-left font-semibold w-72">作業</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-24">担当</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-40">状況</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-36">期限</th>
                    <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                    <th className="px-2.5 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {taskRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-[12px] text-gray-400">タスクはありません（受け取る書類は上の「書類受領」セクションです）</td></tr>
                  ) : taskRows.map(({ r, i }, n) => {
                    const t = linkedTask(r)
                    return (
                    <tr key={i} className={`border-b border-gray-100 last:border-b-0 ${n % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <TextCell value={r.sagyou} onCommit={v => setRow(i, { sagyou: v })} placeholder="作業内容" />
                      <SelectCell value={r.owner} options={OWNER} onChange={v => setRow(i, { owner: v })} />
                      {/* 状況: タスク化済みは tasks のステータス、未化は「タスク化」 */}
                      <td className="px-2.5 py-1.5">
                        {t ? (
                          <select value={normStatus(t.status)} onChange={e => updateTaskField(t.id, { status: e.target.value })} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                            {TASK_STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <button type="button" onClick={() => makeTask(i)} className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded hover:bg-brand-100" title="このタスクを生成して進捗管理を始める">
                            <ListPlus className="w-3.5 h-3.5" /> タスク化
                          </button>
                        )}
                      </td>
                      {/* 期限: タスク化済みは tasks.due_date */}
                      <td className="px-2.5 py-1.5">
                        {t ? (
                          <input type="date" defaultValue={t.due_date ?? ''} key={`due-${t.id}-${t.due_date ?? ''}`} onBlur={e => { if (e.target.value !== (t.due_date ?? '')) updateTaskField(t.id, { due_date: e.target.value || null }) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                        ) : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>
                      <TextCell value={r.note} onCommit={v => setRow(i, { note: v })} placeholder="メモ" />
                      <td className="px-2.5 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {t && <a href={`/tasks/${t.id}`} className="text-gray-300 hover:text-brand-600" title="タスク詳細を開く"><ExternalLink className="w-3.5 h-3.5" /></a>}
                          <button type="button" onClick={() => save(roles.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500" title="作業を削除（タスクは残ります）"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addTaskRow} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> 作業を追加
            </button>
            <p className="mt-1.5 text-[11px] text-gray-400">「タスク化」でタスクを生成すると、状況・期限はタスク側で管理されます（タスクタブと共通）。</p>
          </>
        )}
      </Section>
    </div>
  )

  if (embedded) return body
  return (
    <div className="space-y-3.5">
      <Section title={title}>{body}</Section>
    </div>
  )
}

function TextCell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        key={value}
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


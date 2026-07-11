'use client'

import { useRef, useState, useEffect } from 'react'
import { Trash2, Pencil, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toPng } from 'html-to-image'
import { showToast } from '@/components/ui/Toast'
import { HEIR_RELATIONSHIPS } from '@/lib/constants'
import { toWareki } from '@/lib/wareki'
import type { CaseRow, HeirRow, KosekiRequestRow, ContractDocumentRow, CaseClientRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import BirthdayPicker from '@/components/ui/BirthdayPicker'
import { lookupPostalAddress } from '@/lib/postal'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
import HeirValidationBanner from './HeirValidationBanner'
import KosekiRequestsTable from './KosekiRequestsTable'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import TabTasksSection from './TabTasksSection'
import { toReadinessReceipts } from '@/lib/taskReadiness'
import { SubTabs } from '@/components/ui/SubTabs'
import KosekiSection from './KosekiSection'
import {
  Section,
  FieldGrid,
  InlineEdit,
  InlineCheckbox,
  FormField,
} from '@/components/ui/InlineFields'

// 享年（生年月日→死亡日）。どちらか欠けたら null。
function ageAtDeath(birthday: string | null, deathDate: string | null): number | null {
  if (!birthday || !deathDate) return null
  const b = new Date(birthday), d = new Date(deathDate)
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null
  let age = d.getFullYear() - b.getFullYear()
  const m = d.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--
  return age >= 0 ? age : null
}

type Props = {
  caseData: CaseRow
  heirs: HeirRow[]
  kosekiRequests?: KosekiRequestRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時は戸籍請求の進捗列（請求日・到着日）を出さない
  orderSheetMode?: boolean
  // 契約残手続きの書類（区分=戸籍 を「契約時受領」として表示）
  contractDocuments?: ContractDocumentRow[]
  // 依頼者（同行者含む）。依頼者を相続人に追加する際のプリセット元
  caseClients?: CaseClientRow[]
  // 受信簿＋タスク（戸籍請求一覧の「関連タスク」リンク用）
  documentReceipts?: TimelineReceipt[]
  tasks?: TaskRow[]
}

const SUBTABS: { key: 'heirs' | 'koseki'; label: string }[] = [
  { key: 'heirs', label: '相続人' },
  { key: 'koseki', label: '戸籍請求' },
]

const RELATIONSHIP_OPTIONS = HEIR_RELATIONSHIPS
type RelType = typeof HEIR_RELATIONSHIPS[number]

const emptyHeirForm = () => ({
  name: '',
  furigana: '',
  relationship: '' as RelType | '',
  birth_date: '',
  address: '',
  registered_address: '',
  phone: '',
  email: '',
  is_legal_heir: true,
  is_applicant: false,
})

export default function DeceasedTab({ caseData, heirs, kosekiRequests = [], onRefresh, patchCase, orderSheetMode = false, contractDocuments = [], caseClients = [], documentReceipts = [], tasks = [] }: Props) {
  const [sub, setSub] = useState<'heirs' | 'koseki'>('heirs')
  const [showAddHeir, setShowAddHeir] = useState(false)
  // 既存行の編集状態: null = 追加モード or 非編集、string = 編集中の heir.id
  const [editingHeirId, setEditingHeirId] = useState<string | null>(null)
  const [heirForm, setHeirForm] = useState(emptyHeirForm())
  const diagramRef = useRef<HTMLDivElement>(null)
  const [savingDiagram, setSavingDiagram] = useState(false)

  const saveCaseField = async (field: string, value: string | boolean | string[]) => {
    await patchCase({ [field]: value === '' ? null : value } as Partial<CaseRow>)
  }

  const startAdd = () => {
    setEditingHeirId(null)
    setHeirForm(emptyHeirForm())
    setShowAddHeir(true)
  }

  // メイン依頼者（面談で氏名・生年月日・住所を聴取済み）を相続人としてプリセット追加。本籍のみ空欄。
  const mainClient = caseClients.find(c => c.priority === 'main') ?? caseClients[0]
  const startAddFromClient = () => {
    setEditingHeirId(null)
    setHeirForm({
      ...emptyHeirForm(),
      name: mainClient?.name ?? caseData.clients?.name ?? '',
      furigana: mainClient?.furigana ?? '',
      relationship: '',
      birth_date: mainClient?.birth_date ?? '',
      address: caseData.clients?.address ?? '',
      registered_address: '',
      phone: mainClient?.phone ?? '',
      email: mainClient?.email ?? '',
    })
    setShowAddHeir(true)
  }

  // 相続人が0名のとき、依頼者を最初の1人として「表に」自動投入する（法定相続人・申出人。本籍は空欄）。
  // 以前は追加フォームを自動展開して保存が必要だったが、分かりづらいため最初から行として入れる。
  const autoAddClientAsHeir = async () => {
    const name = mainClient?.name ?? caseData.clients?.name ?? ''
    if (!name.trim()) return
    const supabase = createClient()
    await supabase.from('heirs').insert({
      case_id: caseData.id,
      name,
      furigana: mainClient?.furigana ?? null,
      relationship_type: null,
      birth_date: mainClient?.birth_date || null,
      address: caseData.clients?.address ?? null,
      registered_address: null,
      phone: mainClient?.phone ?? null,
      email: mainClient?.email ?? null,
      is_legal_heir: true,
      is_applicant: true,
      sort_order: 0,
    })
    onRefresh()
  }
  const autoAddedRef = useRef(false)
  useEffect(() => {
    if (autoAddedRef.current) return
    if (heirs.length === 0 && (mainClient?.name || caseData.clients?.name)) {
      autoAddedRef.current = true
      autoAddClientAsHeir()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heirs.length])

  const startEdit = (heir: HeirRow) => {
    setEditingHeirId(heir.id)
    setHeirForm({
      name: heir.name,
      furigana: heir.furigana ?? '',
      relationship: (heir.relationship_type ?? heir.relationship ?? '') as RelType | '',
      birth_date: heir.birth_date ?? '',
      address: heir.address ?? '',
      registered_address: heir.registered_address ?? '',
      phone: heir.phone ?? '',
      email: heir.email ?? '',
      is_legal_heir: heir.is_legal_heir,
      is_applicant: heir.is_applicant,
    })
    setShowAddHeir(true)
  }

  const cancelEdit = () => {
    setShowAddHeir(false)
    setEditingHeirId(null)
    setHeirForm(emptyHeirForm())
  }

  const handleSaveHeir = async () => {
    if (!heirForm.name.trim()) return
    const supabase = createClient()
    // 申出人は1案件1名のみ
    if (heirForm.is_applicant) {
      let query = supabase.from('heirs').update({ is_applicant: false }).eq('case_id', caseData.id)
      if (editingHeirId) query = query.neq('id', editingHeirId)
      await query
    }
    const payload = {
      ...heirForm,
      relationship_type: heirForm.relationship || null,
      birth_date: heirForm.birth_date || null,
    }
    if (editingHeirId) {
      await supabase.from('heirs').update(payload).eq('id', editingHeirId)
      showToast('相続人情報を更新しました', 'success')
    } else {
      await supabase.from('heirs').insert({ case_id: caseData.id, ...payload, sort_order: heirs.length })
      showToast('相続人を追加しました', 'success')
    }
    cancelEdit()
    onRefresh()
  }

  const handleDeleteHeir = async (heirId: string) => {
    if (!confirm('この相続人を削除しますか？')) return
    const supabase = createClient()
    await supabase.from('heirs').delete().eq('id', heirId)
    onRefresh()
  }

  // 相続関係説明図を PNG として書類タブに保存
  const handleSaveDiagram = async () => {
    if (!diagramRef.current) return
    setSavingDiagram(true)
    try {
      const dataUrl = await toPng(diagramRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
      })
      const blob = await (await fetch(dataUrl)).blob()
      const ts = new Date()
      const ymd = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`
      const path = `${caseData.id}/inheritance-diagram-${ymd}.png`
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      // 相続関係説明図は「自社が作成する書類」なので作成書類(documents)へ保存する。
      // → 書類作成タブの作成書類一覧に出る（到着物＝受領書類とは分ける）。
      const { error: dbErr } = await supabase.from('documents').insert({
        case_id: caseData.id,
        name: `相続関係説明図_${ymd}.png`,
        file_path: path,
        file_type: 'PNG',
        status: '作成済',
        generated_by: 'system',
      })
      if (dbErr) throw dbErr
      showToast('相続関係説明図を作成書類に保存しました', 'success')
      onRefresh()
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSavingDiagram(false)
    }
  }

  return (
    <div>
      {!orderSheetMode && <TabHeader title="相続人調査" description="被相続人・相続人の確定と、戸籍請求の管理" />}
      {!orderSheetMode && (
        <div className="mb-3.5 rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="deceased" patchCase={patchCase} label="作業内容（フリー・オーダーシートと共有）" />
        </div>
      )}
      {!orderSheetMode && (
        <div className="mb-3.5">
          <TabTasksSection
            gyomus={['戸籍', '相関図', '法定相続情報取得']}
            tasks={tasks}
            receipts={toReadinessReceipts(documentReceipts)}
          />
        </div>
      )}

      {/* 子タブ（相続人 / 戸籍請求）。オーダーシートではサブタブを廃止し、相続人→戸籍を縦積み表示。 */}
      {!orderSheetMode && (
        <SubTabs tabs={SUBTABS} active={sub} onChange={k => setSub(k as 'heirs' | 'koseki')} className="mb-3.5" />
      )}

      {!orderSheetMode && sub === 'koseki' && (
        <div className="space-y-3.5">
          {/* 案件詳細（実務）：TOP＋左レール（請求単位）＋相関図 */}
          <KosekiSection caseId={caseData.id} caseData={caseData} requests={kosekiRequests} heirs={heirs} onRefresh={onRefresh} />
        </div>
      )}

      {(orderSheetMode || sub === 'heirs') && (
      <div>
      <div className="space-y-3.5">
          {/* 4. 被相続人情報 */}
          <Section title="被相続人情報" icon="🏛️">
            <FieldGrid>
              <InlineEdit label="被相続人氏名" value={caseData.deceased_name} onSave={v => saveCaseField('deceased_name', v)} />
              <InlineEdit label="被相続人ふりがな" value={caseData.deceased_furigana} onSave={v => saveCaseField('deceased_furigana', v)} />
              <div className="py-1.5">
                <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">被相続人生年月日</div>
                <BirthdayPicker value={caseData.deceased_birth_date} onChange={v => patchCase({ deceased_birth_date: v || null, deceased_age: ageAtDeath(v, caseData.date_of_death) })} />
              </div>
              <div className="py-1.5">
                <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">相続開始日（死亡日）<span className="text-red-500 ml-0.5">*</span></div>
                <BirthdayPicker value={caseData.date_of_death} onChange={v => patchCase({ date_of_death: v || null, deceased_age: ageAtDeath(caseData.deceased_birth_date, v) })} />
              </div>
              <div className="py-1.5">
                <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">被相続人年齢（享年・自動計算）</div>
                <div className="text-[13px] text-gray-700 font-medium min-h-[24px]">
                  {ageAtDeath(caseData.deceased_birth_date, caseData.date_of_death) != null
                    ? `${ageAtDeath(caseData.deceased_birth_date, caseData.date_of_death)} 歳`
                    : <span className="text-gray-300 italic text-xs">生年月日と死亡日から自動計算</span>}
                </div>
              </div>
              <InlineEdit
                label="被相続人郵便番号"
                hint="7桁の郵便番号を入力すると住所の候補を自動入力します"
                value={caseData.deceased_postal_code}
                onSave={async v => {
                  const z = v.replace(/[^0-9]/g, '')
                  await saveCaseField('deceased_postal_code', z)
                  // 7桁入力で住所を自動補完（入れ直したら上書き。番地・建物は追記）
                  if (z.length === 7) {
                    const addr = await lookupPostalAddress(z)
                    if (addr) await saveCaseField('deceased_address', addr)
                  }
                }}
              />
              <InlineEdit label="被相続人住所" value={caseData.deceased_address} onSave={v => saveCaseField('deceased_address', v)} fullWidth />
              <InlineEdit label="被相続人本籍" value={caseData.deceased_registered_address} onSave={v => saveCaseField('deceased_registered_address', v)} fullWidth />
              <InlineCheckbox label="被相続人外字有無" value={caseData.deceased_has_special_chars} onSave={v => saveCaseField('deceased_has_special_chars', v)} />
            </FieldGrid>
          </Section>
      </div>

      {/* A. 相続人一覧 */}
      <div className="mt-3.5">
        <HeirValidationBanner heirs={heirs} />
        <Section title={`相続人一覧（${heirs.length}名）`} icon="👪">
          {heirs.length === 0 && !showAddHeir ? (
            <div className="text-sm text-gray-400 text-center py-6">
              相続人を追加してください
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    {['氏名', '生年月日', '住所', '本籍', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[11px] font-medium text-brand-700 tracking-[0.04em] bg-brand-50/60 border-b border-brand-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heirs.map(heir => (
                    <tr key={heir.id} className="border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF] group">
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-semibold text-gray-900">{heir.name}</div>
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {(heir.relationship_type || heir.relationship) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border bg-brand-50 text-brand-600 border-brand-200">
                              {heir.relationship_type ?? heir.relationship}
                            </span>
                          )}
                          {heir.is_legal_heir && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">法定相続人</span>
                          )}
                          {heir.is_applicant && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">申出人</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-mono text-gray-600">
                        {heir.birth_date ? (
                          <>
                            {heir.birth_date}
                            {toWareki(heir.birth_date) && <div className="text-[11px] text-gray-400">{toWareki(heir.birth_date)}</div>}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600">{heir.address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600">{heir.registered_address ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => startEdit(heir)}
                            className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-brand-50 hover:text-brand-600 transition"
                            title="編集"
                          ><Pencil className="w-3 h-3" strokeWidth={1.75} /></button>
                          <button
                            onClick={() => handleDeleteHeir(heir.id)}
                            className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                            title="削除"
                          ><Trash2 className="w-3 h-3" strokeWidth={1.75} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add / Edit heir form */}
          {showAddHeir && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[13px] font-semibold text-gray-700 mb-2">
                {editingHeirId ? '相続人を編集' : '相続人を追加'}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="氏名" required>
                  <input
                    type="text"
                    value={heirForm.name}
                    onChange={e => setHeirForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
                  />
                </FormField>
                <FormField label="被相続人との続柄">
                  <select
                    value={heirForm.relationship}
                    onChange={e => setHeirForm(f => ({ ...f, relationship: e.target.value as RelType | '' }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
                  >
                    <option value="">選択してください</option>
                    {RELATIONSHIP_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="生年月日">
                  <BirthdayPicker
                    value={heirForm.birth_date}
                    onChange={v => setHeirForm(f => ({ ...f, birth_date: v }))}
                  />
                </FormField>
                <div>
                  <label className="text-[12px] font-semibold text-gray-500 block mb-1">フラグ</label>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={heirForm.is_legal_heir} onChange={e => setHeirForm(f => ({ ...f, is_legal_heir: e.target.checked }))} className="rounded" />
                      法定相続人
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={heirForm.is_applicant} onChange={e => setHeirForm(f => ({ ...f, is_applicant: e.target.checked }))} className="rounded" />
                      申出人（法定相続情報一覧図）
                    </label>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mb-3">
                <FormField label="住所">
                  <input
                    type="text"
                    value={heirForm.address}
                    onChange={e => setHeirForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
                  />
                </FormField>
                <FormField label="本籍">
                  <input
                    type="text"
                    value={heirForm.registered_address}
                    onChange={e => setHeirForm(f => ({ ...f, registered_address: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
                  />
                </FormField>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50">キャンセル</button>
                <button onClick={handleSaveHeir} className="px-3 py-1.5 text-xs text-white bg-brand-600 rounded-md hover:bg-brand-700">
                  {editingHeirId ? '更新' : '追加'}
                </button>
              </div>
            </div>
          )}
          {!showAddHeir && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={startAdd} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                <Plus className="w-3.5 h-3.5" /> 相続人を追加
              </button>
              {(mainClient?.name || caseData.clients?.name) && (
                <button type="button" onClick={startAddFromClient} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700" title="氏名・生年月日・住所を面談情報からプリセット（本籍は空欄）">
                  <Plus className="w-3.5 h-3.5" /> 依頼者を相続人に追加
                </button>
              )}
            </div>
          )}
        </Section>
      </div>

      {/* 相続関係説明図 */}
      <div className="mt-3.5">
        <Section
          title="相続関係説明図"
          icon="🔗"
          actionLabel={savingDiagram ? '保存中…' : '書類タブに保存'}
          onAction={heirs.length === 0 || savingDiagram ? undefined : handleSaveDiagram}
        >
          {heirs.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">
              相続人を追加すると相続関係説明図が表示されます
            </div>
          ) : (
            <div ref={diagramRef}>
              <InheritanceDiagramV2 deceased={caseData} heirs={heirs} />
            </div>
          )}
        </Section>
      </div>
      </div>
      )}

      {/* オーダーシート：戸籍請求一覧を相続人一覧の下に縦積み表示（サブタブ廃止） */}
      {orderSheetMode && (
        <div className="mt-3.5">
          <Section title="戸籍請求一覧" icon="🗂️">
            <KosekiRequestsTable caseId={caseData.id} requests={kosekiRequests} onRefresh={onRefresh} orderSheetMode roles={caseData.intake_roles ?? []} deceasedName={caseData.deceased_name} heirs={heirs} receipts={documentReceipts} tasks={tasks} contractDocs={contractDocuments.filter(d => d.category === '戸籍')} />
          </Section>
        </div>
      )}
    </div>
  )
}


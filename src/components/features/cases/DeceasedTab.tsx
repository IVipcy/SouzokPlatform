'use client'

import { useRef, useState } from 'react'
import { Trash2, Pencil, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toPng } from 'html-to-image'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, HeirRow, KosekiRequestRow, ContractDocumentRow } from '@/types'
import BirthdayPicker from '@/components/ui/BirthdayPicker'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
import HeirValidationBanner from './HeirValidationBanner'
import KosekiRequestsTable from './KosekiRequestsTable'
import ContractReceivedDocs from './ContractReceivedDocs'
import { SubTabs } from '@/components/ui/SubTabs'
import {
  Section,
  FieldGrid,
  InlineEdit,
  InlineDate,
  InlineCheckbox,
  FormField,
} from '@/components/ui/InlineFields'

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
}

const SUBTABS: { key: 'heirs' | 'koseki'; label: string }[] = [
  { key: 'heirs', label: '相続人' },
  { key: 'koseki', label: '戸籍請求' },
]

const RELATIONSHIP_OPTIONS = ['配偶者', '子', '父', '母', '兄弟姉妹', 'その他'] as const
type RelType = typeof RELATIONSHIP_OPTIONS[number]

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

export default function DeceasedTab({ caseData, heirs, kosekiRequests = [], onRefresh, patchCase, orderSheetMode = false, contractDocuments = [] }: Props) {
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
      const { error: dbErr } = await supabase.from('case_documents').insert({
        case_id: caseData.id,
        document_name: `相続関係説明図_${ymd}`,
        outbound_file_path: path,
        outbound_file_name: `相続関係説明図_${ymd}.png`,
        outbound_file_type: 'PNG',
        outbound_file_bucket: 'documents',
        generated_by: 'system',
      })
      if (dbErr) throw dbErr
      showToast('相続関係説明図を書類タブに保存しました', 'success')
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
      {/* 相続人・戸籍の調査セクション */}
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h3 className="text-[13px] font-semibold text-gray-900">相続人・戸籍の調査</h3>
        <span className="text-[12px] text-gray-400">被相続人・相続人の確定と、戸籍請求の管理</span>
      </div>

      {/* 子タブ（相続人 / 戸籍請求） */}
      <SubTabs tabs={SUBTABS} active={sub} onChange={k => setSub(k as 'heirs' | 'koseki')} className="mb-3.5" />

      {sub === 'koseki' && (
        <div className="space-y-3.5">
          {/* 戸籍請求（請求単位の管理表）。理由・目的・特記は各行で個別設定 */}
          <Section title="戸籍請求一覧" icon="🗂️">
            <KosekiRequestsTable caseId={caseData.id} requests={kosekiRequests} onRefresh={onRefresh} orderSheetMode={orderSheetMode} roles={caseData.intake_roles ?? []} deceasedName={caseData.deceased_name} heirs={heirs} />
          </Section>

          {/* 契約時にお客様から受領した戸籍関係書類（区分=戸籍）。戸籍請求一覧の下に表示。 */}
          <ContractReceivedDocs documents={contractDocuments} category="戸籍" title="契約時にお客様から受領した戸籍関係書類" />
        </div>
      )}

      {sub === 'heirs' && (
      <div>
      <div className="space-y-3.5">
          {/* 4. 被相続人情報 */}
          <Section title="被相続人情報" icon="🏛️">
            <FieldGrid>
              <InlineEdit label="被相続人氏名" value={caseData.deceased_name} onSave={v => saveCaseField('deceased_name', v)} />
              <InlineEdit label="被相続人ふりがな" value={caseData.deceased_furigana} onSave={v => saveCaseField('deceased_furigana', v)} />
              <div className="py-1.5">
                <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">被相続人生年月日</div>
                <BirthdayPicker value={caseData.deceased_birth_date} onChange={v => saveCaseField('deceased_birth_date', v)} />
              </div>
              <InlineEdit label="被相続人年齢" value={caseData.deceased_age != null ? String(caseData.deceased_age) : null} onSave={v => patchCase({ deceased_age: v.trim() === '' ? null : Number(v) })} />
              <InlineDate label="相続開始日（死亡日）" value={caseData.date_of_death} onSave={v => saveCaseField('date_of_death', v)} required />
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
            <div className="overflow-x-auto -mx-4 -mb-3">
              <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    {['氏名', 'ふりがな', '被相続人との続柄', '生年月日', '住所', '本籍', 'TEL', 'メール', '法定相続人', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[12px] font-bold text-gray-500 tracking-wider uppercase bg-gray-50 border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heirs.map(heir => (
                    <tr key={heir.id} className="border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF] group">
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-semibold text-gray-900">{heir.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600">{heir.furigana ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(heir.relationship_type || heir.relationship) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold border bg-brand-50 text-brand-600 border-brand-200">
                              {heir.relationship_type ?? heir.relationship}
                            </span>
                          )}
                          {heir.is_applicant && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">申出人</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-mono text-gray-600">{heir.birth_date ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600">{heir.address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600">{heir.registered_address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[13px] font-mono text-gray-600">{heir.phone ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[13px] font-mono text-gray-600">{heir.email ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {heir.is_legal_heir && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold bg-green-50 text-green-600 border border-green-200">✓</span>
                        )}
                      </td>
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
                <FormField label="ふりがな">
                  <input
                    type="text"
                    value={heirForm.furigana}
                    onChange={e => setHeirForm(f => ({ ...f, furigana: e.target.value }))}
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
                  <input
                    type="date"
                    value={heirForm.birth_date}
                    onChange={e => setHeirForm(f => ({ ...f, birth_date: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
                  />
                </FormField>
                <FormField label="TEL">
                  <input
                    type="text"
                    value={heirForm.phone}
                    onChange={e => setHeirForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
                  />
                </FormField>
                <FormField label="メール">
                  <input
                    type="text"
                    value={heirForm.email}
                    onChange={e => setHeirForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-brand-400 transition"
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
            <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> 相続人を追加
            </button>
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
    </div>
  )
}


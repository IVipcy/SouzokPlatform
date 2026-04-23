'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow, HeirRow } from '@/types'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
import HeirValidationBanner from './HeirValidationBanner'
import {
  Section,
  FieldGrid,
  InlineEdit,
  InlineSelect,
  InlineMultiSelect,
  InlineDate,
  InlineCheckbox,
  InlineTextarea,
  FormField,
} from '@/components/ui/InlineFields'
import {
  KOSEKI_REQUEST_REASONS,
  KOSEKI_REQUEST_PATTERNS,
  KOSEKI_REQUEST_TYPES,
} from '@/lib/constants'

type Props = {
  caseData: CaseRow
  heirs: HeirRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}

const RELATIONSHIP_OPTIONS = ['配偶者', '子', '父', '母', '兄弟姉妹', 'その他'] as const
type RelType = typeof RELATIONSHIP_OPTIONS[number]

export default function DeceasedTab({ caseData, heirs, onRefresh, patchCase }: Props) {
  const [showAddHeir, setShowAddHeir] = useState(false)
  const [heirForm, setHeirForm] = useState({
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

  const saveCaseField = async (field: string, value: string | boolean | string[]) => {
    await patchCase({ [field]: value === '' ? null : value } as Partial<CaseRow>)
  }

  const handleAddHeir = async () => {
    if (!heirForm.name.trim()) return
    const supabase = createClient()
    // 申出人は1案件1名のみ
    if (heirForm.is_applicant) {
      await supabase.from('heirs').update({ is_applicant: false }).eq('case_id', caseData.id)
    }
    await supabase.from('heirs').insert({
      case_id: caseData.id,
      ...heirForm,
      relationship_type: heirForm.relationship || null,  // relationship と relationship_type を同期
      birth_date: heirForm.birth_date || null,
      sort_order: heirs.length,
    })
    setHeirForm({ name: '', furigana: '', relationship: '', birth_date: '', address: '', registered_address: '', phone: '', email: '', is_legal_heir: true, is_applicant: false })
    setShowAddHeir(false)
    onRefresh()
  }

  const handleDeleteHeir = async (heirId: string) => {
    const supabase = createClient()
    await supabase.from('heirs').delete().eq('id', heirId)
    onRefresh()
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-3.5">
          {/* 4. 被相続人情報 */}
          <Section title="被相続人情報" icon="🏛️">
            <FieldGrid>
              <InlineEdit label="被相続人氏名" value={caseData.deceased_name} onSave={v => saveCaseField('deceased_name', v)} />
              <InlineEdit label="被相続人ふりがな" value={caseData.deceased_furigana} onSave={v => saveCaseField('deceased_furigana', v)} />
              <InlineDate label="被相続人生年月日" value={caseData.deceased_birth_date} onSave={v => saveCaseField('deceased_birth_date', v)} />
              <InlineDate label="相続開始日（死亡日）" value={caseData.date_of_death} onSave={v => saveCaseField('date_of_death', v)} required />
              <InlineEdit label="被相続人住所" value={caseData.deceased_address} onSave={v => saveCaseField('deceased_address', v)} fullWidth />
              <InlineEdit label="被相続人本籍" value={caseData.deceased_registered_address} onSave={v => saveCaseField('deceased_registered_address', v)} fullWidth />
              <InlineCheckbox label="被相続人外字有無" value={caseData.deceased_has_special_chars} onSave={v => saveCaseField('deceased_has_special_chars', v)} />
            </FieldGrid>
          </Section>

          {/* 6. 戸籍請求関連 */}
          <Section title="戸籍請求関連" icon="📜">
            <FieldGrid>
              <InlineSelect
                label="戸籍請求理由"
                value={caseData.koseki_request_reason}
                options={[...KOSEKI_REQUEST_REASONS]}
                onSave={v => saveCaseField('koseki_request_reason', v)}
                fullWidth
              />
              <InlineEdit
                label="戸籍請求理由（その他）"
                value={caseData.koseki_request_reason_other}
                onSave={v => saveCaseField('koseki_request_reason_other', v)}
                fullWidth
              />
              <InlineSelect
                label="実費負担者"
                value={caseData.koseki_request_pattern}
                options={[...KOSEKI_REQUEST_PATTERNS]}
                onSave={v => saveCaseField('koseki_request_pattern', v)}
              />
              <InlineMultiSelect
                label="請求の種別"
                value={caseData.koseki_request_type}
                options={[...KOSEKI_REQUEST_TYPES]}
                onSave={v => saveCaseField('koseki_request_type', v)}
                fullWidth
              />
              <InlineEdit
                label="使用目的"
                value={caseData.koseki_purpose}
                onSave={v => saveCaseField('koseki_purpose', v)}
                fullWidth
              />
              <InlineTextarea
                label="戸籍特記事項"
                value={caseData.koseki_notes}
                onSave={v => saveCaseField('koseki_notes', v)}
                fullWidth
              />
            </FieldGrid>
          </Section>
        </div>

        {/* Right column - empty for layout alignment */}
        <div />
      </div>

      {/* A. 相続人一覧 */}
      <div className="mt-3.5">
        <HeirValidationBanner heirs={heirs} />
        <Section title={`相続人一覧（${heirs.length}名）`} icon="👪" actionLabel="＋ 追加" onAction={() => setShowAddHeir(true)}>
          {heirs.length === 0 && !showAddHeir ? (
            <div className="text-sm text-gray-400 text-center py-6">
              相続人を追加してください
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 -mb-3">
              <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    {['氏名', 'ふりがな', '続柄', '生年月日', '住所', '本籍', 'TEL', 'メール', '法定相続人', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-gray-500 tracking-wider uppercase bg-gray-50 border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heirs.map(heir => (
                    <tr key={heir.id} className="border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFF]">
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-semibold text-gray-900">{heir.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-600">{heir.furigana ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(heir.relationship_type || heir.relationship) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border bg-blue-50 text-blue-600 border-blue-200">
                              {heir.relationship_type ?? heir.relationship}
                            </span>
                          )}
                          {heir.is_applicant && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">申出人</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-gray-600">{heir.birth_date ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-600">{heir.address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-600">{heir.registered_address ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-gray-600">{heir.phone ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[11px] font-mono text-gray-600">{heir.email ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        {heir.is_legal_heir && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-600 border border-green-200">✓</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleDeleteHeir(heir.id)}
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-gray-300 hover:bg-red-50 hover:text-red-500 transition"
                          title="削除"
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add heir form */}
          {showAddHeir && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="氏名" required>
                  <input
                    type="text"
                    value={heirForm.name}
                    onChange={e => setHeirForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
                <FormField label="ふりがな">
                  <input
                    type="text"
                    value={heirForm.furigana}
                    onChange={e => setHeirForm(f => ({ ...f, furigana: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
                <FormField label="続柄">
                  <select
                    value={heirForm.relationship}
                    onChange={e => setHeirForm(f => ({ ...f, relationship: e.target.value as RelType | '' }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
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
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
                <FormField label="TEL">
                  <input
                    type="text"
                    value={heirForm.phone}
                    onChange={e => setHeirForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
                <FormField label="メール">
                  <input
                    type="text"
                    value={heirForm.email}
                    onChange={e => setHeirForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1">フラグ</label>
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
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
                <FormField label="本籍">
                  <input
                    type="text"
                    value={heirForm.registered_address}
                    onChange={e => setHeirForm(f => ({ ...f, registered_address: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  />
                </FormField>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddHeir(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50">キャンセル</button>
                <button onClick={handleAddHeir} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700">追加</button>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* 相続関係説明図 */}
      <div className="mt-3.5">
        <Section title="相続関係説明図" icon="🔗" actionLabel="🖨️ 印刷" onAction={() => window.print()}>
          {heirs.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">
              相続人を追加すると相続関係説明図が表示されます
            </div>
          ) : (
            <InheritanceDiagramV2 deceased={caseData} heirs={heirs} />
          )}
        </Section>
      </div>
    </div>
  )
}


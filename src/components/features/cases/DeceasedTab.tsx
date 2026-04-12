'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow, HeirRow } from '@/types'
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
}

const RELATIONSHIP_OPTIONS = ['配偶者', '子', '父母', '兄弟姉妹', '代襲相続人', 'その他']

export default function DeceasedTab({ caseData, heirs, onRefresh }: Props) {
  const [showAddHeir, setShowAddHeir] = useState(false)
  const [heirForm, setHeirForm] = useState({
    name: '',
    furigana: '',
    relationship: '',
    address: '',
    registered_address: '',
    phone: '',
    email: '',
    is_legal_heir: true,
  })

  const saveCaseField = async (field: string, value: string | boolean | string[]) => {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value === '' ? null : value }).eq('id', caseData.id)
    onRefresh()
  }

  const handleAddHeir = async () => {
    if (!heirForm.name.trim()) return
    const supabase = createClient()
    await supabase.from('heirs').insert({
      case_id: caseData.id,
      ...heirForm,
      sort_order: heirs.length,
    })
    setHeirForm({ name: '', furigana: '', relationship: '', address: '', registered_address: '', phone: '', email: '', is_legal_heir: true })
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
                label="戸籍請求書パターン"
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
                    {['氏名', 'ふりがな', '続柄', '住所', '本籍', 'TEL', 'メール', '法定相続人', ''].map(h => (
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
                        {heir.relationship && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            heir.relationship === '代襲相続人' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-200'
                          }`}>{heir.relationship}</span>
                        )}
                      </td>
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
                    onChange={e => setHeirForm(f => ({ ...f, relationship: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-blue-400 transition"
                  >
                    <option value="">選択してください</option>
                    {RELATIONSHIP_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
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
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1">法定相続人</label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={heirForm.is_legal_heir} onChange={e => setHeirForm(f => ({ ...f, is_legal_heir: e.target.checked }))} className="rounded" />
                    法定相続人
                  </label>
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
            <InheritanceDiagram deceased={caseData} heirs={heirs} />
          )}
        </Section>
      </div>
    </div>
  )
}

// ─── Inheritance Diagram ───
function InheritanceDiagram({ deceased, heirs }: { deceased: CaseRow; heirs: HeirRow[] }) {
  const boxWidth = 120
  const boxHeight = 130
  const hGap = 40
  const vGap = 80

  // Center deceased at top, heirs in a row below
  const totalHeirsWidth = heirs.length * boxWidth + (heirs.length - 1) * hGap
  const canvasWidth = Math.max(totalHeirsWidth + 100, 600)
  const deceasedX = canvasWidth / 2 - boxWidth / 2
  const deceasedY = 40
  const heirsY = deceasedY + boxHeight + vGap
  const heirsStartX = canvasWidth / 2 - totalHeirsWidth / 2

  return (
    <div className="overflow-auto bg-white" style={{ minHeight: 350 }}>
      <div className="relative mx-auto" style={{ width: canvasWidth, minHeight: heirsY + boxHeight + 40 }}>
        {/* SVG lines */}
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {heirs.map((_, i) => {
            const heirCenterX = heirsStartX + i * (boxWidth + hGap) + boxWidth / 2
            const deceasedCenterX = deceasedX + boxWidth / 2
            return (
              <line
                key={i}
                x1={deceasedCenterX}
                y1={deceasedY + boxHeight}
                x2={heirCenterX}
                y2={heirsY}
                stroke="#000"
                strokeWidth="1.5"
              />
            )
          })}
        </svg>

        {/* Deceased box */}
        <div className="absolute" style={{ left: deceasedX, top: deceasedY, width: boxWidth, zIndex: 2 }}>
          <div className="border-[3px] border-black bg-white text-center">
            <div className="text-[8px] tracking-widest py-1 border-b border-black bg-gray-800 text-white font-semibold">被相続人</div>
            <div className="p-2 flex flex-col items-center gap-1">
              <div className="text-[13px] font-bold tracking-wider">{deceased.deceased_name ?? '—'}</div>
              <div className="text-[8px] text-gray-600 text-left w-full px-1 leading-relaxed">
                {deceased.deceased_birth_date && <div><span className="text-gray-400">生</span> {deceased.deceased_birth_date}</div>}
                {deceased.date_of_death && <div><span className="text-gray-400">没</span> {deceased.date_of_death}</div>}
                {deceased.deceased_registered_address && <div><span className="text-gray-400">籍</span> {deceased.deceased_registered_address}</div>}
              </div>
              <div className="w-[30px] h-[30px] border-[1.5px] border-red-600 rounded-full flex items-center justify-center text-[7px] text-red-600 font-bold mt-1">
                死亡
              </div>
            </div>
          </div>
        </div>

        {/* Heir boxes */}
        {heirs.map((heir, i) => {
          const x = heirsStartX + i * (boxWidth + hGap)
          return (
            <div key={heir.id} className="absolute" style={{ left: x, top: heirsY, width: boxWidth, zIndex: 2 }}>
              <div className="border-[1.5px] border-black bg-white text-center">
                <div className="text-[8px] tracking-widest py-1 border-b border-black bg-gray-100 text-gray-700 font-medium">
                  {heir.relationship === '配偶者' ? '配偶者' : heir.relationship ?? '相続人'}
                </div>
                <div className="p-2 flex flex-col items-center gap-1">
                  <div className="text-[13px] font-bold tracking-wider">{heir.name}</div>
                  <div className="text-[8px] text-gray-600 text-left w-full px-1 leading-relaxed">
                    {heir.birth_date && <div><span className="text-gray-400">生</span> {heir.birth_date}</div>}
                    {heir.registered_address && <div><span className="text-gray-400">籍</span> {heir.registered_address}</div>}
                  </div>
                  {heir.is_legal_heir && (
                    <div className="text-[8px] text-green-600 font-semibold mt-1">（法定相続人）</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

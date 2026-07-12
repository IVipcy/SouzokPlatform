'use client'

import { useState, type ReactNode } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown, Lock, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, SectionHeading, InlineEdit, InlineSelect, InlineCheckbox } from '@/components/ui/InlineFields'
import { PROPERTY_EVALUATION_METHODS } from '@/lib/constants'
import { useIsManager } from '@/components/providers/AuthProvider'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { MoneyInput } from './FinancialAssetsTable'
import type { RealEstatePropertyRow } from '@/types'

const PROPERTY_TYPES = ['戸建', 'マンション', '土地', '収益物件', 'その他']
const REQ = ['要', '不要', '確認中']

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  /** オーダーシート（調査前）では備考・結果列を出さない */
  orderSheetMode?: boolean
  /** 市区町村タブで使用：この市区町村の物件だけ表示し、新規行もこの市区町村にする */
  municipalityFilter?: string
  /** 市区町村タブで使用：確定済トグル列を表示（管理担当のみ操作可） */
  showConfirmed?: boolean
}

/** 不動産を表形式でインライン編集・行追加。行展開で詳細項目も編集できる（財産調査） */
export default function RealEstateTable({ caseId, properties, onRefresh, orderSheetMode = false, municipalityFilter, showConfirmed = false }: Props) {
  const supabase = createClient()
  const isManager = useIsManager()
  const memberId = useCurrentMember(null)
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  // 市区町村でフィルタ中は列を出さない（タブ名が市区町村のため）。
  // オーダーシートでは所在地だけ入力し、市区町村は所在地から自動抽出するため列を隠す。
  const showMuni = !municipalityFilter && !orderSheetMode
  // 明示の市区町村が無ければ所在地から抽出（RealEstateSection と同一ロジック）
  const muniOf = (r: RealEstatePropertyRow) => {
    const m = (r.municipality ?? '').trim()
    if (m) return m
    const a = (r.address ?? '').trim()
    const x = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
    return x ? `${x[1] ?? ''}${x[2]}` : ''
  }
  const visibleRows = municipalityFilter != null
    ? rows.filter(r => muniOf(r) === municipalityFilter)
    : rows
  // toggle +[市区町村] +物件種別 +所在地 +評価額 +[確定済] +備考 +[備考・結果] +削除
  const colCount = (orderSheetMode ? 0 : 1) + (showMuni ? 1 : 0) + 3 + (showConfirmed ? 1 : 0) + 1 + (orderSheetMode ? 0 : 1) + 1

  const toggleConfirmed = async (row: RealEstatePropertyRow) => {
    const next = !row.confirmed
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, confirmed: next } : r))
    const { error } = await supabase.from('real_estate_properties')
      .update({ confirmed: next, confirmed_by: next ? memberId : null, confirmed_at: next ? new Date().toISOString() : null })
      .eq('id', row.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
    else onRefresh?.()
  }

  const setLocal = (id: string, field: keyof RealEstatePropertyRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))

  const commit = async (id: string, field: keyof RealEstatePropertyRow, value: string) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('real_estate_properties').insert({ case_id: caseId, municipality: municipalityFilter ?? null }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as RealEstatePropertyRow])
    onRefresh?.()
  }

  const delRow = async (row: RealEstatePropertyRow) => {
    if (!confirm(`「${row.address || '未入力の不動産'}」を削除しますか？`)) return
    const { error } = await supabase.from('real_estate_properties').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      {/* PC: 表（スマホでは非表示）。オーダーシートは全幅でカード表示に統一（1項目=1行）。 */}
      <div className={`${orderSheetMode ? 'hidden' : 'hidden sm:block'} overflow-x-auto`}>
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 920 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              {!orderSheetMode && <th className="px-1 py-2 w-7" />}
              {showMuni && <th className="px-2.5 py-2 text-left font-semibold w-40">市区町村</th>}
              <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">評価額</th>
              {showConfirmed && <th className="px-2.5 py-2 text-center font-semibold w-24">確定済<span className="block text-[10px] font-normal text-gray-400">管理担当のみ</span></th>}
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-56">備考・結果</th>}
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</td></tr>
            ) : (
              visibleRows.map(r => (
                <RealRow
                  key={r.id}
                  r={r}
                  open={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  setLocal={setLocal}
                  commit={commit}
                  saveField={saveField}
                  onDelete={() => delRow(r)}
                  orderSheetMode={orderSheetMode}
                  showMuni={showMuni}
                  showConfirmed={showConfirmed}
                  isManager={isManager}
                  onToggleConfirmed={() => toggleConfirmed(r)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* カード表示（1件＝1カード・縦積み）。オーダーシートは全幅。 */}
      <div className={`${orderSheetMode ? '' : 'sm:hidden'} space-y-2.5`}>
        {visibleRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</div>
        ) : (
          visibleRows.map(r => (
            <RealCard
              key={r.id}
              r={r}
              open={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              setLocal={setLocal}
              commit={commit}
              saveField={saveField}
              onDelete={() => delRow(r)}
              orderSheetMode={orderSheetMode}
              showMuni={showMuni}
              showConfirmed={showConfirmed}
              isManager={isManager}
              onToggleConfirmed={() => toggleConfirmed(r)}
            />
          ))
        )}
      </div>

      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 不動産を追加
      </button>
    </div>
  )
}

function RealRow({ r, open, onToggle, setLocal, commit, saveField, onDelete, orderSheetMode, showMuni, showConfirmed, isManager, onToggleConfirmed }: {
  r: RealEstatePropertyRow
  open: boolean
  onToggle: () => void
  setLocal: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  commit: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  saveField: (id: string, field: keyof RealEstatePropertyRow, value: unknown) => Promise<void>
  onDelete: () => void
  orderSheetMode: boolean
  showMuni: boolean
  showConfirmed: boolean
  isManager: boolean
  onToggleConfirmed: () => void
}) {
  const sel = (field: keyof RealEstatePropertyRow, options: readonly string[]) => (
    <td className="px-2.5 py-1.5">
      <select value={(r[field] as string) ?? ''} onChange={e => { setLocal(r.id, field, e.target.value); commit(r.id, field, e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )

  return (
    <>
      <tr className="border-b border-gray-100">
        {!orderSheetMode && (
          <td className="px-1 py-1.5 text-center">
            <button type="button" onClick={onToggle} className="text-gray-400 hover:text-brand-600" title="詳細">
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </td>
        )}
        {showMuni && <CellInput value={r.municipality} onChange={v => setLocal(r.id, 'municipality', v)} onCommit={v => commit(r.id, 'municipality', v)} placeholder="例: 東京都墨田区" />}
        {sel('property_type', PROPERTY_TYPES)}
        <CellInput value={r.address} onChange={v => setLocal(r.id, 'address', v)} onCommit={v => commit(r.id, 'address', v)} placeholder="所在地" />
        <td className="px-2.5 py-1.5"><MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} /></td>
        {showConfirmed && (
          <td className="px-2.5 py-1.5 text-center">
            {r.confirmed ? (
              <button type="button" onClick={onToggleConfirmed} disabled={!isManager} title={isManager ? '確定を取消' : '確定は管理担当のみ'} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 disabled:cursor-default hover:bg-emerald-100 disabled:hover:bg-emerald-50">
                <Check className="w-3 h-3" strokeWidth={2.5} />確定済
              </button>
            ) : isManager ? (
              <button type="button" onClick={onToggleConfirmed} title="評価額を確定したらチェック（TOP一覧・財産目録へ反映）" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700">
                <Lock className="w-3 h-3" strokeWidth={2} />未確定
              </button>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200">未確定</span>
            )}
          </td>
        )}
        <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="住人・売却意向・ランク・査定状況 等" />
        {!orderSheetMode && <CellInput value={r.survey_result} onChange={v => setLocal(r.id, 'survey_result', v)} onCommit={v => commit(r.id, 'survey_result', v)} placeholder="この物件で分かったこと" />}
        <td className="px-2.5 py-1.5 text-center">
          <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
      {!orderSheetMode && open && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={1 + (showMuni ? 1 : 0) + 3 + (showConfirmed ? 1 : 0) + 1 + (orderSheetMode ? 0 : 1) + 1} className="px-4 py-3 space-y-3">
            {/* 物件詳細（固定資産申請書にも連携）。請求・取得の進捗は下の「取得資料管理」で管理。 */}
            <div>
              <SectionHeading title="物件詳細（固定資産申請書にも連携）" className="mb-2" />
              <FieldGrid>
                <InlineEdit label="所在（登記上の地番）" value={r.lot_number} onSave={v => saveField(r.id, 'lot_number', v || null)} />
                <InlineEdit label="家屋番号" value={r.kaoku_bango} onSave={v => saveField(r.id, 'kaoku_bango', v || null)} />
                <InlineSelect label="近傍宅地価格 要否" value={r.near_land_price} options={REQ} onSave={v => saveField(r.id, 'near_land_price', v)} />
                <InlineEdit label="築年数" value={r.building_age != null ? String(r.building_age) : null} onSave={v => saveField(r.id, 'building_age', v ? Number(v) : null)} />
                <InlineSelect label="評価方法" value={r.evaluation_method} options={[...PROPERTY_EVALUATION_METHODS]} onSave={v => saveField(r.id, 'evaluation_method', v)} />
                <InlineEdit label="売却仲介業者" value={r.sale_agent_name} onSave={v => saveField(r.id, 'sale_agent_name', v)} />
                <InlineCheckbox label="マンション敷地注意" value={r.is_condo_land} onSave={v => saveField(r.id, 'is_condo_land', v)} />
              </FieldGrid>
            </div>

            {/* 発見元（どの資料からこの不動産が判明したか） */}
            <div>
              <SectionHeading title="発見元（どの資料から判明したか）" className="mb-2" />
              <FieldGrid>
                <InlineCheckbox label="名寄せ参照" value={r.ref_nayose} onSave={v => saveField(r.id, 'ref_nayose', v)} />
                <InlineCheckbox label="権利書参照" value={r.ref_title_deed} onSave={v => saveField(r.id, 'ref_title_deed', v)} />
                <InlineCheckbox label="納税通知書参照" value={r.ref_tax_notice} onSave={v => saveField(r.id, 'ref_tax_notice', v)} />
              </FieldGrid>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CellInput({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}

// スマホ用：ラベル＋入力欄を縦に並べる小ブロック
function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-slate-600 mb-1">{label}</div>
      {children}
    </div>
  )
}

// スマホ用：不動産1件＝1カード（表の代わり。項目名の下に大きい入力欄を縦積み）
function RealCard({ r, open, onToggle, setLocal, commit, saveField, onDelete, orderSheetMode, showMuni, showConfirmed, isManager, onToggleConfirmed }: {
  r: RealEstatePropertyRow
  open: boolean
  onToggle: () => void
  setLocal: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  commit: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  saveField: (id: string, field: keyof RealEstatePropertyRow, value: unknown) => Promise<void>
  onDelete: () => void
  orderSheetMode: boolean
  showMuni: boolean
  showConfirmed: boolean
  isManager: boolean
  onToggleConfirmed: () => void
}) {
  const inputCls = 'w-full h-12 px-3 text-[15px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white transition'
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-end mb-1.5">
        <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 p-1.5" title="削除"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <FieldBlock label="物件種別">
          <select value={(r.property_type as string) ?? ''} onChange={e => { setLocal(r.id, 'property_type', e.target.value); commit(r.id, 'property_type', e.target.value) }} className="w-full h-12 px-3 text-[15px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500">
            <option value="">種別を選択</option>
            {PROPERTY_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FieldBlock>
        {showMuni && (
          <FieldBlock label="市区町村">
            <input type="text" value={r.municipality ?? ''} onChange={e => setLocal(r.id, 'municipality', e.target.value)} onBlur={e => commit(r.id, 'municipality', e.target.value)} placeholder="例: 東京都墨田区" className={inputCls} />
          </FieldBlock>
        )}
        <FieldBlock label="所在地">
          <input type="text" value={r.address ?? ''} onChange={e => setLocal(r.id, 'address', e.target.value)} onBlur={e => commit(r.id, 'address', e.target.value)} placeholder="所在地" className={inputCls} />
        </FieldBlock>
        <FieldBlock label="評価額">
          <MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} />
        </FieldBlock>
        <FieldBlock label="備考">
          <input type="text" value={r.notes ?? ''} onChange={e => setLocal(r.id, 'notes', e.target.value)} onBlur={e => commit(r.id, 'notes', e.target.value)} placeholder="住人・売却意向・ランク・査定状況 等" className={inputCls} />
        </FieldBlock>
        {!orderSheetMode && (
          <FieldBlock label="備考・結果">
            <input type="text" value={r.survey_result ?? ''} onChange={e => setLocal(r.id, 'survey_result', e.target.value)} onBlur={e => commit(r.id, 'survey_result', e.target.value)} placeholder="この物件で分かったこと" className={inputCls} />
          </FieldBlock>
        )}
        {showConfirmed && (
          <FieldBlock label="確定（管理担当のみ）">
            {r.confirmed ? (
              <button type="button" onClick={onToggleConfirmed} disabled={!isManager} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 disabled:cursor-default"><Check className="w-3 h-3" strokeWidth={2.5} />確定済</button>
            ) : isManager ? (
              <button type="button" onClick={onToggleConfirmed} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold text-gray-500 bg-white border border-gray-300"><Lock className="w-3 h-3" strokeWidth={2} />未確定</button>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold text-gray-400 bg-gray-50 border border-gray-200">未確定</span>
            )}
          </FieldBlock>
        )}
      </div>
      {!orderSheetMode && (
        <button type="button" onClick={onToggle} className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}{open ? '詳細を閉じる' : '詳細を入力'}
        </button>
      )}
      {!orderSheetMode && open && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-3">
          <div>
            <SectionHeading title="物件詳細（固定資産申請書にも連携）" className="mb-2" />
            <FieldGrid cols={1}>
              <InlineEdit label="所在（登記上の地番）" value={r.lot_number} onSave={v => saveField(r.id, 'lot_number', v || null)} />
              <InlineEdit label="家屋番号" value={r.kaoku_bango} onSave={v => saveField(r.id, 'kaoku_bango', v || null)} />
              <InlineSelect label="近傍宅地価格 要否" value={r.near_land_price} options={REQ} onSave={v => saveField(r.id, 'near_land_price', v)} />
              <InlineEdit label="築年数" value={r.building_age != null ? String(r.building_age) : null} onSave={v => saveField(r.id, 'building_age', v ? Number(v) : null)} />
              <InlineSelect label="評価方法" value={r.evaluation_method} options={[...PROPERTY_EVALUATION_METHODS]} onSave={v => saveField(r.id, 'evaluation_method', v)} />
              <InlineEdit label="売却仲介業者" value={r.sale_agent_name} onSave={v => saveField(r.id, 'sale_agent_name', v)} />
              <InlineCheckbox label="マンション敷地注意" value={r.is_condo_land} onSave={v => saveField(r.id, 'is_condo_land', v)} />
            </FieldGrid>
          </div>
          <div>
            <SectionHeading title="発見元（どの資料から判明したか）" className="mb-2" />
            <FieldGrid cols={1}>
              <InlineCheckbox label="名寄せ参照" value={r.ref_nayose} onSave={v => saveField(r.id, 'ref_nayose', v)} />
              <InlineCheckbox label="権利書参照" value={r.ref_title_deed} onSave={v => saveField(r.id, 'ref_title_deed', v)} />
              <InlineCheckbox label="納税通知書参照" value={r.ref_tax_notice} onSave={v => saveField(r.id, 'ref_tax_notice', v)} />
            </FieldGrid>
          </div>
        </div>
      )}
    </div>
  )
}

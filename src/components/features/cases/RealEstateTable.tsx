'use client'

import { useState, type ReactNode } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, SectionHeading, InlineEdit, InlineSelect, InlineCheckbox } from '@/components/ui/InlineFields'
import { PROPERTY_EVALUATION_METHODS, PROPERTY_TYPES } from '@/lib/constants'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { MoneyInput } from './FinancialAssetsTable'
import CheckRequestControl from './CheckRequestControl'
import type { RealEstatePropertyRow } from '@/types'

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
  /** 所在地の予測住所リスト（被相続人の住所・本籍など）。自由入力も可。 */
  addressSuggestions?: string[]
}

/** 不動産を表形式でインライン編集・行追加。行展開で詳細項目も編集できる（財産調査） */
export default function RealEstateTable({ caseId, properties, onRefresh, orderSheetMode = false, municipalityFilter, showConfirmed = false, addressSuggestions = [] }: Props) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  const [busy, setBusy] = useState(false)
  // 予測住所：被相続人の住所・本籍＋この案件で既に入力済みの所在地。datalistで候補表示（自由入力可）。
  const addrListId = `re-addr-${caseId}`
  const addrOptions = [...new Set([...addressSuggestions, ...rows.map(r => r.address ?? '')].map(s => s.trim()).filter(Boolean))]
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
  // [市区町村] +物件種別 +所在地 +評価額 +備考 +[確定済] +削除
  const colCount = (showMuni ? 1 : 0) + 4 + (showConfirmed ? 1 : 0) + 1

  // 評価額確定は「確認簿で確認」に一本化。ここでは依頼（confirm_requested_at）を出す／取り消すだけ。
  const patchConfirmReq = async (row: RealEstatePropertyRow, patch: Partial<RealEstatePropertyRow>) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } as RealEstatePropertyRow : r))
    const { error } = await supabase.from('real_estate_properties').update(patch).eq('id', row.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error'); else onRefresh?.()
  }
  const reqConfirm = (row: RealEstatePropertyRow) => patchConfirmReq(row, { confirm_requested_at: new Date().toISOString(), confirm_requested_by: memberId })
  const cancelConfirm = (row: RealEstatePropertyRow) => patchConfirmReq(row, { confirm_requested_at: null, confirm_requested_by: null })

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
    if (error || !data) { setBusy(false); showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    const prop = data as RealEstatePropertyRow
    const propMuni = (prop.municipality ?? municipalityFilter ?? '').trim() || null
    // 物件単位で必ず要る標準の取得資料（法務局へ請求・1行にまとめて）を自動生成。
    // 物件が消えても場所が分かるよう target_municipality も入れる（孤児化で「対象未設定」になるのを防ぐ）。
    const STANDARD_PROP = ['登記情報', '公図', '地積測量図']
    await supabase.from('real_estate_acquisitions').insert({
      case_id: caseId, scope: 'property', target_property_id: prop.id, target_municipality: propMuni,
      item_type: STANDARD_PROP[0], item_types: STANDARD_PROP, request_to: '法務局', sort_order: 0,
    })
    // 市区町村単位で必ず要る標準の取得資料（市区町村役場へ請求・1行にまとめて）を、
    // その市区町村でまだ行が無いときだけ自動生成。既存行があれば足りない資料だけ足す。
    if (propMuni) {
      const { data: existing } = await supabase.from('real_estate_acquisitions')
        .select('id,item_type,item_types').eq('case_id', caseId).eq('scope', 'municipality').eq('target_municipality', propMuni).maybeSingle()
      const STANDARD_MUNI = ['名寄帳', '固定資産評価証明']
      const office = `${propMuni.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')}役所`
      if (!existing) {
        await supabase.from('real_estate_acquisitions').insert({
          case_id: caseId, scope: 'municipality', target_municipality: propMuni,
          item_type: STANDARD_MUNI[0], item_types: STANDARD_MUNI, request_to: office, sort_order: 0,
        })
      } else {
        const cur = ((existing as { item_types: string[] | null; item_type: string | null }).item_types) ?? [(existing as { item_type: string | null }).item_type].filter((x): x is string => !!x)
        const merged = Array.from(new Set([...cur, ...STANDARD_MUNI]))
        if (merged.length !== cur.length) {
          await supabase.from('real_estate_acquisitions').update({ item_types: merged }).eq('id', (existing as { id: string }).id)
        }
      }
    }
    setBusy(false)
    setRows(prev => [...prev, prop])
    onRefresh?.()
  }

  const delRow = async (row: RealEstatePropertyRow) => {
    if (!confirm(`「${row.address || '未入力の不動産'}」を削除しますか？`)) return
    // その物件に紐づく取得資料（登記情報等）も一緒に削除（孤児＝「対象未設定」を残さない）
    await supabase.from('real_estate_acquisitions').delete().eq('target_property_id', row.id)
    const { error } = await supabase.from('real_estate_properties').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      {/* 所在地の予測住所（被相続人の住所・本籍＋入力済み。自由入力も可） */}
      {addrOptions.length > 0 && <datalist id={addrListId}>{addrOptions.map(a => <option key={a} value={a} />)}</datalist>}
      {/* PC(sm以上)は表・スマホはカード。案件詳細/オーダーシート共通（表に統一）。 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              {showMuni && <th className="px-2.5 py-2 text-left font-semibold w-40">市区町村</th>}
              <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">所在地<span className="block text-[10px] font-normal text-gray-400">名寄帳取得後に地番を要確認</span></th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">評価額</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              {showConfirmed && <th className="px-2.5 py-2 text-center font-semibold w-28">評価額確定<span className="block text-[10px] font-normal text-gray-400">確認簿で確認</span></th>}
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
                  setLocal={setLocal}
                  commit={commit}
                  onDelete={() => delRow(r)}
                  showMuni={showMuni}
                  showConfirmed={showConfirmed}
                  addrListId={addrListId}
                  onRequestConfirm={() => reqConfirm(r)}
                  onCancelConfirm={() => cancelConfirm(r)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* カード表示（1件＝1カード・縦積み）。スマホのみ（PCは上の表）。 */}
      <div className="sm:hidden space-y-2.5">
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
              addrListId={addrListId}
              onRequestConfirm={() => reqConfirm(r)}
              onCancelConfirm={() => cancelConfirm(r)}
            />
          ))
        )}
      </div>

      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> 不動産を追加
      </button>
    </div>
  )
}

function RealRow({ r, setLocal, commit, onDelete, showMuni, showConfirmed, addrListId, onRequestConfirm, onCancelConfirm }: {
  r: RealEstatePropertyRow
  setLocal: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  commit: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  onDelete: () => void
  showMuni: boolean
  showConfirmed: boolean
  addrListId: string
  onRequestConfirm: () => void
  onCancelConfirm: () => void
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
        {showMuni && <CellInput value={r.municipality} onChange={v => setLocal(r.id, 'municipality', v)} onCommit={v => commit(r.id, 'municipality', v)} placeholder="例: 東京都墨田区" />}
        {sel('property_type', PROPERTY_TYPES)}
        <CellInput value={r.address} onChange={v => setLocal(r.id, 'address', v)} onCommit={v => commit(r.id, 'address', v)} placeholder="所在地（住所を予測）" list={addrListId} />
        <td className="px-2.5 py-1.5"><MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} /></td>
        <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="住人・売却意向・ランク・査定状況 等" />
        {showConfirmed && (
          <td className="px-2.5 py-1.5 text-center">
            {r.appraisal_value != null
              ? <CheckRequestControl label="確定を依頼" requestedAt={r.confirm_requested_at} checkedAt={r.confirmed_at} checkedName={r.confirmed_name} onRequest={onRequestConfirm} onCancel={onCancelConfirm} />
              : <span className="text-[11px] text-gray-300">評価額待ち</span>}
          </td>
        )}
        <td className="px-2.5 py-1.5 text-center">
          <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
    </>
  )
}

function CellInput({ value, onChange, onCommit, placeholder, list }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string; list?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        list={list}
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
function RealCard({ r, open, onToggle, setLocal, commit, saveField, onDelete, orderSheetMode, showMuni, showConfirmed, addrListId, onRequestConfirm, onCancelConfirm }: {
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
  addrListId: string
  onRequestConfirm: () => void
  onCancelConfirm: () => void
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
          <input type="text" value={r.address ?? ''} onChange={e => setLocal(r.id, 'address', e.target.value)} onBlur={e => commit(r.id, 'address', e.target.value)} placeholder="所在地（住所を予測）" list={addrListId} className={inputCls} />
          <p className="mt-0.5 text-[11px] text-gray-400">名寄帳取得後に地番を要確認</p>
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
          <FieldBlock label="評価額確定（確認簿で確認）">
            {r.appraisal_value != null
              ? <CheckRequestControl label="確定を依頼" requestedAt={r.confirm_requested_at} checkedAt={r.confirmed_at} checkedName={r.confirmed_name} onRequest={onRequestConfirm} onCancel={onCancelConfirm} />
              : <span className="text-[12px] text-gray-400">評価額を入れると依頼できます</span>}
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

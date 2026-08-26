'use client'

// 不動産の物件一覧（財産調査／オーダーシート）。
//
// 財産調査では土地と建物で表を分ける。入れる項目が半分ちがい（地番・地目・地積／家屋番号・種類・構造）、
// 1つの表だと必ず半分が空欄になるため。列は財産目録の土地・建物の表とそろえてあるので、
// ここを埋めればそのまま目録に載る。
//
// 以前は「登記事項」のアコーディオンを開いて入力する作りだったが、
// 開かないと入っていないことに気づけず、目録を作る段になって空欄が判明していた。
// 表に出して、その場で埋められるようにした。
//
// オーダーシート（受注前の想定物件）は今までどおり1つの簡易表。登記の項目はまだ分からないため。

import { useState, type ReactNode } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { PROPERTY_TYPES, LAND_CATEGORIES, BUILDING_KINDS } from '@/lib/constants'
import { isLandProperty, isBuildingProperty } from '@/lib/registrationTax'
import { ACQUIRERS, acquirerLabel } from '@/lib/acquirer'
import { MoneyInput } from './FinancialAssetsTable'
import type { RealEstatePropertyRow } from '@/types'

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  /** オーダーシート（調査前）では登記の項目を出さず、1つの簡易表にする */
  orderSheetMode?: boolean
  /** 市区町村タブで使用：この市区町村の物件だけ表示し、新規行もこの市区町村にする */
  municipalityFilter?: string
  /** 市区町村タブで使用：確定済トグル列を表示（管理担当のみ操作可） */
  showConfirmed?: boolean
  /** 所在地の予測住所リスト（被相続人の住所・本籍など）。自由入力も可。 */
  addressSuggestions?: string[]
}

/** 不動産を表形式でインライン編集・行追加（財産調査／オーダーシート） */
// showConfirmed（評価額確定の依頼列）は廃止。呼び出し側の互換のため Props には残す。
export default function RealEstateTable({ caseId, properties, onRefresh, orderSheetMode = false, municipalityFilter, addressSuggestions = [] }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  const [busy, setBusy] = useState(false)
  const addrOptions = [...new Set([...addressSuggestions, ...rows.map(r => r.address ?? '')].map(s => s.trim()).filter(Boolean))]
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
  // 種別が未設定の行は土地側に置く。種別を選べばもう一方の表へ移る。
  const landRows = visibleRows.filter(r => isLandProperty(r.property_type) || !r.property_type)
  const buildingRows = visibleRows.filter(r => isBuildingProperty(r.property_type))

  const setLocal = (id: string, field: keyof RealEstatePropertyRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))

  // 市区町村単位の標準取得資料（名寄帳・固定資産評価証明）を、その市区町村でまだ無ければ自動生成。
  // 既存行があれば足りない資料だけ足す。オーダーシートは「行を先に足して後から住所を入力」する流れなので、
  // 物件追加時だけでなく所在地(市区町村)が判明したタイミングでも呼ぶ。
  const STANDARD_MUNI = ['名寄帳', '固定資産評価証明']
  const ensureMuniSeed = async (muni: string) => {
    const m = muni.trim()
    if (!m) return
    const { data: existing } = await supabase.from('real_estate_acquisitions')
      .select('id,item_type,item_types').eq('case_id', caseId).eq('scope', 'municipality').eq('target_municipality', m).maybeSingle()
    const office = `${m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')}役所`
    if (!existing) {
      await supabase.from('real_estate_acquisitions').insert({
        case_id: caseId, scope: 'municipality', target_municipality: m,
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

  const commit = async (id: string, field: keyof RealEstatePropertyRow, value: string) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    // 所在地/市区町村が入力されて市区町村が判明したら、名寄帳・評価証明を自動生成（追加時は空でスキップされているため）。
    if (field === 'address' || field === 'municipality') {
      const v = (value ?? '').trim()
      let muni = ''
      if (field === 'municipality') muni = v
      else { const x = v.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/); muni = x ? `${x[1] ?? ''}${x[2]}` : '' }
      if (muni) { await ensureMuniSeed(muni); onRefresh?.() }
    }
  }

  /** 数値の列（地積・持分）。空欄は null に戻す。 */
  const saveNumber = async (id: string, field: keyof RealEstatePropertyRow, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw)
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async (propertyType?: string) => {
    setBusy(true)
    const { data, error } = await supabase.from('real_estate_properties')
      .insert({ case_id: caseId, municipality: municipalityFilter ?? null, property_type: propertyType ?? null })
      .select('*').single()
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
    // 市区町村が判明していれば市区町村単位の標準資料（名寄帳・評価証明）も自動生成。
    // オーダーシートは追加時点で市区町村が空なので、後から所在地入力時に commit 側で生成される。
    if (propMuni) await ensureMuniSeed(propMuni)
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

  const rowProps = (r: RealEstatePropertyRow) => ({
    r, setLocal, commit, saveNumber,
    onDelete: () => delRow(r),
    showMuni, addrOptions,
  })

  // ── オーダーシート：登記の項目はまだ分からないので1つの簡易表のまま ──
  if (orderSheetMode) {
    return (
      <div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <th className={TH + ' w-28'}>物件種別</th>
                <th className={TH}>所在地<span className="block text-[10px] font-normal text-brand-700">名寄帳取得後に地番を要確認</span></th>
                <th className={TH + ' text-right w-32'}>評価額</th>
                <th className={TH}>備考</th>
                <th className="px-2.5 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</td></tr>
              ) : visibleRows.map(r => (
                <tr key={r.id} className="border-b border-gray-100">
                  <TypeCell r={r} setLocal={setLocal} commit={commit} />
                  <CellInput value={r.address} onChange={v => setLocal(r.id, 'address', v)} onCommit={v => commit(r.id, 'address', v)} placeholder="所在地（住所を予測）" suggestions={addrOptions} />
                  <td className="px-2.5 py-1.5"><MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} /></td>
                  <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="住人・売却意向 等" />
                  <DeleteCell onDelete={() => delRow(r)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sm:hidden space-y-2.5">
          {visibleRows.length === 0
            ? <div className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</div>
            : visibleRows.map(r => <RealCard key={r.id} {...rowProps(r)} saveNumber={saveNumber} orderSheetMode />)}
        </div>
        <AddButton label="不動産を追加" busy={busy} onClick={() => addRow()} />
      </div>
    )
  }

  // ── 財産調査：土地／建物で表を分ける ──
  return (
    <div className="space-y-4">
      <div className="hidden sm:block space-y-4">
        <PropertyTable
          title="土地" kind="land" rows={landRows}
          showMuni={showMuni}
          renderRow={r => <LandRow key={r.id} {...rowProps(r)} />}
          onAdd={() => addRow('土地')} busy={busy}
        />
        <PropertyTable
          title="建物" kind="building" rows={buildingRows}
          showMuni={showMuni}
          renderRow={r => <BuildingRow key={r.id} {...rowProps(r)} />}
          onAdd={() => addRow('建物')} busy={busy}
        />
      </div>

      {/* スマホは1件＝1カード（表の代わり） */}
      <div className="sm:hidden space-y-2.5">
        {visibleRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-gray-400">不動産が登録されていません</div>
        ) : visibleRows.map(r => <RealCard key={r.id} {...rowProps(r)} saveNumber={saveNumber} orderSheetMode={false} />)}
        <AddButton label="不動産を追加" busy={busy} onClick={() => addRow()} />
      </div>
    </div>
  )
}

const TH = 'px-2.5 py-2 whitespace-nowrap text-left font-semibold'

function AddButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
      <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> {label}
    </button>
  )
}

// 土地／建物の表の枠。見出し・列見出し・空状態・追加ボタンをまとめる。
function PropertyTable({ title, kind, rows, showMuni, renderRow, onAdd, busy }: {
  title: string
  kind: 'land' | 'building'
  rows: RealEstatePropertyRow[]
  showMuni: boolean
  renderRow: (r: RealEstatePropertyRow) => ReactNode
  onAdd: () => void
  busy: boolean
}) {
  const land = kind === 'land'
  // 市区町村 +種別 +取得区分 +所在地 +番号 +区分 +面積 +持分 +評価額 +備考 [+確定] +削除
  const colCount = (showMuni ? 1 : 0) + 10
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-block w-[3px] h-3.5 bg-brand-600 rounded-[1px]" />
        <span className="text-[12.5px] font-semibold text-brand-800 tracking-[0.02em]">{title}</span>
        <span className="text-[11px] text-gray-400">{rows.length}件</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              {showMuni && <th className={TH + ' w-40'}>市区町村</th>}
              <th className={TH + ' w-24'}>物件種別</th>
              <th className={TH + ' w-28'}>取得区分</th>
              <th className={TH}>所在<span className="block text-[10px] font-normal text-brand-700">名寄帳取得後に地番を要確認</span></th>
              <th className={TH + ' w-32'}>{land ? '地番' : '家屋番号'}</th>
              <th className={TH + ' w-28'}>{land ? '地目' : '種類'}</th>
              <th className={TH + (land ? ' text-right w-28' : ' w-44')}>{land ? '地積（㎡）' : '構造・床面積'}</th>
              <th className={TH + ' w-32'}>持分<span className="block text-[10px] font-normal text-brand-700">空欄＝全部</span></th>
              <th className={TH + ' text-right w-32'}>{land ? '固定資産評価額' : '評価額'}</th>
              <th className={TH}>備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={colCount} className="px-3 py-5 text-center text-[12.5px] text-gray-400">{title}が登録されていません</td></tr>
              : rows.map(renderRow)}
          </tbody>
        </table>
      </div>
      <AddButton label={`${title}を追加`} busy={busy} onClick={onAdd} />
    </div>
  )
}

type RowProps = {
  r: RealEstatePropertyRow
  setLocal: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  commit: (id: string, field: keyof RealEstatePropertyRow, value: string) => void
  saveNumber: (id: string, field: keyof RealEstatePropertyRow, raw: string) => Promise<void>
  onDelete: () => void
  showMuni: boolean
  addrOptions: string[]
}

function LandRow(p: RowProps) {
  const { r, setLocal, commit, saveNumber } = p
  return (
    <tr className="border-b border-gray-100">
      <HeadCells {...p} />
      <CellInput value={r.lot_number} onChange={v => setLocal(r.id, 'lot_number', v)} onCommit={v => commit(r.id, 'lot_number', v)} placeholder="12番3" />
      <SelectCell value={r.land_category} options={LAND_CATEGORIES} onPick={v => { setLocal(r.id, 'land_category', v); commit(r.id, 'land_category', v) }} />
      <td className="px-2.5 py-1.5">
        <input type="number" step="0.01" defaultValue={r.land_area ?? ''} onBlur={e => saveNumber(r.id, 'land_area', e.target.value)}
          placeholder="0.00" className="w-full px-1.5 py-1.5 text-[12px] text-right bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition" />
      </td>
      <TailCells {...p} />
    </tr>
  )
}

function BuildingRow(p: RowProps) {
  const { r, setLocal, commit } = p
  return (
    <tr className="border-b border-gray-100">
      <HeadCells {...p} />
      <CellInput value={r.kaoku_bango} onChange={v => setLocal(r.id, 'kaoku_bango', v)} onCommit={v => commit(r.id, 'kaoku_bango', v)} placeholder="12番3" />
      <SelectCell value={r.building_kind} options={BUILDING_KINDS} onPick={v => { setLocal(r.id, 'building_kind', v); commit(r.id, 'building_kind', v) }} />
      <CellInput value={r.building_structure} onChange={v => setLocal(r.id, 'building_structure', v)} onCommit={v => commit(r.id, 'building_structure', v)} placeholder="木造2階建 95.20㎡" />
      <TailCells {...p} />
    </tr>
  )
}

/** 土地・建物で共通の左側（市区町村・種別・取得区分・所在） */
function HeadCells({ r, setLocal, commit, showMuni, addrOptions }: RowProps) {
  return (
    <>
      {showMuni && <CellInput value={r.municipality} onChange={v => setLocal(r.id, 'municipality', v)} onCommit={v => commit(r.id, 'municipality', v)} placeholder="例: 東京都墨田区" />}
      <TypeCell r={r} setLocal={setLocal} commit={commit} />
      <AcquirerCell r={r} setLocal={setLocal} commit={commit} />
      <CellInput value={r.address} onChange={v => setLocal(r.id, 'address', v)} onCommit={v => commit(r.id, 'address', v)} placeholder="所在地（住所を予測）" suggestions={addrOptions} />
    </>
  )
}

/** 土地・建物で共通の右側（持分・評価額・備考・確定・削除） */
function TailCells({ r, setLocal, commit, saveNumber, onDelete }: RowProps) {
  return (
    <>
      <td className="px-2.5 py-1.5">
        <div className="flex items-center gap-1">
          <input type="number" defaultValue={r.share_numerator ?? ''} onBlur={e => saveNumber(r.id, 'share_numerator', e.target.value)}
            placeholder="1" aria-label="持分の分子" className={SHARE_CLS} />
          <span className="text-gray-400">/</span>
          <input type="number" defaultValue={r.share_denominator ?? ''} onBlur={e => saveNumber(r.id, 'share_denominator', e.target.value)}
            placeholder="2" aria-label="持分の分母" className={SHARE_CLS} />
        </div>
      </td>
      <td className="px-2.5 py-1.5"><MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} /></td>
      <CellInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="住人・売却意向・ランク・査定状況 等" />
      <DeleteCell onDelete={onDelete} />
    </>
  )
}

const SHARE_CLS = 'w-12 px-1 py-1.5 text-[12px] text-center bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition'

function TypeCell({ r, setLocal, commit }: Pick<RowProps, 'r' | 'setLocal' | 'commit'>) {
  return (
    <SelectCell value={r.property_type} options={PROPERTY_TYPES}
      onPick={v => { setLocal(r.id, 'property_type', v); commit(r.id, 'property_type', v) }} />
  )
}

function AcquirerCell({ r, setLocal, commit }: Pick<RowProps, 'r' | 'setLocal' | 'commit'>) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={r.acquirer ?? '自社'} onChange={e => { setLocal(r.id, 'acquirer', e.target.value); commit(r.id, 'acquirer', e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
      </select>
    </td>
  )
}

function SelectCell({ value, options, onPick }: { value: string | null; options: readonly string[]; onPick: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={value ?? ''} onChange={e => onPick(e.target.value)}
        className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )
}

function DeleteCell({ onDelete }: { onDelete: () => void }) {
  return (
    <td className="px-2.5 py-1.5 text-center">
      <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
    </td>
  )
}

function CellInput({ value, onChange, onCommit, placeholder, suggestions }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string; suggestions?: string[] }) {
  // 候補が渡されたら「datalistの▼」ではなく自前のクリック候補ドロップダウンを表示（アプリのUIトーンに揃える）。
  const [open, setOpen] = useState(false)
  const cur = value ?? ''
  const filtered = (suggestions ?? []).filter(s => s && (cur.length === 0 || s.includes(cur)) && s !== cur)
  return (
    <td className="px-2.5 py-1.5">
      <div className="relative">
        <input
          type="text"
          value={cur}
          onChange={e => onChange(e.target.value)}
          onFocus={() => suggestions && suggestions.length > 0 && setOpen(true)}
          onBlur={e => { setTimeout(() => setOpen(false), 150); onCommit(e.target.value) }}
          placeholder={placeholder}
          className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-0.5 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded shadow-md">
            {filtered.map(s => (
              <button key={s} type="button" onMouseDown={() => { onChange(s); onCommit(s); setOpen(false) }}
                className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-brand-50">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
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
function RealCard({ r, setLocal, commit, saveNumber, onDelete, orderSheetMode, showMuni }: RowProps & { orderSheetMode: boolean }) {
  const inputCls = 'w-full h-10 px-3 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white transition'
  const selCls = 'w-full h-10 px-3 text-[13px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500'
  const land = isLandProperty(r.property_type) || !r.property_type
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-end mb-1.5">
        <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 p-1.5" title="削除"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <FieldBlock label="物件種別">
          <select value={r.property_type ?? ''} onChange={e => { setLocal(r.id, 'property_type', e.target.value); commit(r.id, 'property_type', e.target.value) }} className={selCls}>
            <option value="">種別を選択</option>
            {r.property_type && !(PROPERTY_TYPES as readonly string[]).includes(r.property_type) && <option value={r.property_type}>{r.property_type}</option>}
            {PROPERTY_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FieldBlock>
        {!orderSheetMode && (
        <FieldBlock label="取得区分">
          <select value={r.acquirer ?? '自社'} onChange={e => { setLocal(r.id, 'acquirer', e.target.value); commit(r.id, 'acquirer', e.target.value) }} className={selCls}>
            {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
          </select>
        </FieldBlock>
        )}
        {showMuni && (
          <FieldBlock label="市区町村">
            <input type="text" value={r.municipality ?? ''} onChange={e => setLocal(r.id, 'municipality', e.target.value)} onBlur={e => commit(r.id, 'municipality', e.target.value)} placeholder="例: 東京都墨田区" className={inputCls} />
          </FieldBlock>
        )}
        <FieldBlock label="所在">
          <input type="text" value={r.address ?? ''} onChange={e => setLocal(r.id, 'address', e.target.value)} onBlur={e => commit(r.id, 'address', e.target.value)} placeholder="所在地（住所を予測）" className={inputCls} />
          <p className="mt-0.5 text-[11px] text-gray-400">名寄帳取得後に地番を要確認</p>
        </FieldBlock>
        {!orderSheetMode && (land ? (
          <>
            <FieldBlock label="地番">
              <input type="text" value={r.lot_number ?? ''} onChange={e => setLocal(r.id, 'lot_number', e.target.value)} onBlur={e => commit(r.id, 'lot_number', e.target.value)} placeholder="12番3" className={inputCls} />
            </FieldBlock>
            <FieldBlock label="地目">
              <select value={r.land_category ?? ''} onChange={e => { setLocal(r.id, 'land_category', e.target.value); commit(r.id, 'land_category', e.target.value) }} className={selCls}>
                <option value="">—</option>
                {LAND_CATEGORIES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </FieldBlock>
            <FieldBlock label="地積（㎡）">
              <input type="number" step="0.01" defaultValue={r.land_area ?? ''} onBlur={e => saveNumber(r.id, 'land_area', e.target.value)} placeholder="0.00" className={inputCls} />
            </FieldBlock>
          </>
        ) : (
          <>
            <FieldBlock label="家屋番号">
              <input type="text" value={r.kaoku_bango ?? ''} onChange={e => setLocal(r.id, 'kaoku_bango', e.target.value)} onBlur={e => commit(r.id, 'kaoku_bango', e.target.value)} placeholder="12番3" className={inputCls} />
            </FieldBlock>
            <FieldBlock label="種類">
              <select value={r.building_kind ?? ''} onChange={e => { setLocal(r.id, 'building_kind', e.target.value); commit(r.id, 'building_kind', e.target.value) }} className={selCls}>
                <option value="">—</option>
                {BUILDING_KINDS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </FieldBlock>
            <FieldBlock label="構造・床面積">
              <input type="text" value={r.building_structure ?? ''} onChange={e => setLocal(r.id, 'building_structure', e.target.value)} onBlur={e => commit(r.id, 'building_structure', e.target.value)} placeholder="木造2階建 95.20㎡" className={inputCls} />
            </FieldBlock>
          </>
        ))}
        {!orderSheetMode && (
          <FieldBlock label="持分（空欄なら全部）">
            <div className="flex items-center gap-2">
              <input type="number" defaultValue={r.share_numerator ?? ''} onBlur={e => saveNumber(r.id, 'share_numerator', e.target.value)} placeholder="分子" className={inputCls} />
              <span className="text-gray-400">/</span>
              <input type="number" defaultValue={r.share_denominator ?? ''} onBlur={e => saveNumber(r.id, 'share_denominator', e.target.value)} placeholder="分母" className={inputCls} />
            </div>
          </FieldBlock>
        )}
        <FieldBlock label="評価額">
          <MoneyInput value={r.appraisal_value} onCommit={v => commit(r.id, 'appraisal_value', v)} />
        </FieldBlock>
        <FieldBlock label="備考">
          <input type="text" value={r.notes ?? ''} onChange={e => setLocal(r.id, 'notes', e.target.value)} onBlur={e => commit(r.id, 'notes', e.target.value)} placeholder="住人・売却意向・ランク・査定状況 等" className={inputCls} />
        </FieldBlock>
      </div>
    </div>
  )
}

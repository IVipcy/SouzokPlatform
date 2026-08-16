'use client'

// 統合入力アプリ ①面談シート（項目モード）。エクセルの[面談シート]=〇項目だけをセクション別に表示。
// 各セクションのメモ欄＝そのセクションのフリー作業欄(work_content)に統合。ここは【タイピング専用】。
// 手書きは「白紙モード」(WhiteboardTab)に一本化した（原本が2か所に散らばるのを防ぐため）。
// 構造化できる所は「AIで項目に反映」（createRunExtract を白紙モードと共通利用）。
import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Trash2, Plus, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, InlineEdit } from '@/components/ui/InlineFields'
import BirthdayPicker from '@/components/ui/BirthdayPicker'
import InheritanceDiagramV2 from '@/components/features/cases/InheritanceDiagramV2'
import OtherAssetsTable from '@/components/features/cases/OtherAssetsTable'
import { HEIR_RELATIONSHIPS, PROPERTY_TYPES, needsLotNumber, needsBuildingNumber, OTHER_ASSET_KINDS, isFormerSpouse } from '@/lib/constants'
import OrderContentTab from '@/components/features/cases/OrderContentTab'
import CaseClientsTable from '@/components/features/cases/CaseClientsTable'
import { MoneyInput } from '@/components/features/cases/FinancialAssetsTable'
import { useRowsFrom } from '@/lib/useRowsFrom'
import type { CaseRow, CaseClientRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, CaseOtherAssetRow } from '@/types'
import type { MeetingMemoRow } from './IntakeCaseClient'
import MemoPhotoBox from './MemoPhotoBox'
import { toKatakana } from '@/lib/kana'

const BUCKET = 'meeting-memos'

// AIで項目に反映のスキーマ（単一項目・cases/clients テーブルに1レコード上書き）。
type XField = { key: string; label: string; target: 'case' | 'client'; enum?: string[]; type?: 'date' | 'number' }
const EXTRACT_SCHEMA: Record<string, XField[]> = {
  // 依頼者情報：住所・振込名義（clients テーブル）を中心にAI反映。
  clientInfo: [
    { key: 'address', label: '依頼者住所', target: 'client' },
    { key: 'transfer_name_kana', label: '振込名義人（カナ）', target: 'client' },
  ],
  deceased: [
    { key: 'deceased_name', label: '被相続人氏名', target: 'case' },
    { key: 'deceased_furigana', label: '被相続人ふりがな', target: 'case' },
    { key: 'deceased_birth_date', label: '被相続人生年月日', target: 'case', type: 'date' },
    { key: 'date_of_death', label: '相続開始日（死亡日）', target: 'case', type: 'date' },
    { key: 'deceased_address', label: '被相続人住所', target: 'case' },
    { key: 'deceased_registered_address', label: '被相続人本籍', target: 'case' },
  ],
  // 提案内容・手続き内容：契約形態と、面談その他メモ（提案内容の補足）をAIで反映。
  //   procedure_type(手続き区分の複数選択) は enum配列で扱いにくいため、フリー欄側で確認する運用。
  order: [
    { key: 'contract_type', label: '契約形態', target: 'case', enum: ['行・司連名', '行政書士法人単独', '司法書士法人単独', 'いきいきライフ協会'] },
    { key: 'meeting_other_notes', label: '提案内容・その他メモ', target: 'case' },
  ],
}

// AIで項目に反映（行データ）：メモから複数行を抽出して該当テーブルへINSERT。
// key = API 応答のグループ key（AI に返させる配列の名前）。fixedValues は毎行に付与。
type ExtractField = { key: string; label: string; enum?: string[]; type?: 'date' | 'number' }
type RowExtractSchema = {
  key: string       // 応答JSONで返る配列のキー
  label: string     // AIに伝える意味
  table: 'heirs' | 'real_estate_properties' | 'financial_assets'
  fields: ExtractField[]
  fixedValues?: Record<string, unknown>
  /**
   * 重複判定に使う列。既に同じ値の行があればAI追加をスキップする。
   * 「白紙の家系図→表」と「表へ直接入力」の両方を使えるようにしたため、
   * これが無いと同じ人・同じ口座が二重登録される。
   */
  dedupeKey?: string
}
// case_clients の table 型は 'heirs'/'real_estate_properties'/'financial_assets' 以外を許容する必要がある
type ExtractRowTable = 'heirs' | 'real_estate_properties' | 'financial_assets' | 'case_clients'
const ROW_EXTRACT_SCHEMA: Record<string, (Omit<RowExtractSchema, 'table'> & { table: ExtractRowTable })[]> = {
  // 依頼者情報：CaseClientsTable(case_clients)へAI追加。優先度は既定 companion(安全側)。ユーザーが必要に応じてメイン依頼人に切替。
  clientInfo: [{
    key: 'clients', label: '依頼者・同行者一覧', table: 'case_clients', dedupeKey: 'name',
    fields: [
      { key: 'name', label: '氏名' },
      { key: 'furigana', label: 'ふりがな' },
      { key: 'relationship', label: '続柄', enum: [...HEIR_RELATIONSHIPS] },
      { key: 'mobile_phone', label: 'TEL（携帯）' },
    ],
    fixedValues: { priority: 'companion' },
  }],
  // 相続人調査：被相続人6項目(EXTRACT_SCHEMA['deceased']) と併用。相続人一覧も同じメモから抽出。
  deceased: [{
    key: 'heirs', label: '相続人一覧', table: 'heirs', dedupeKey: 'name',
    fields: [
      { key: 'name', label: '氏名' },
      { key: 'relationship_type', label: '続柄', enum: [...HEIR_RELATIONSHIPS] },
    ],
  }],
  assets_re: [{
    key: 'properties', label: '不動産一覧', table: 'real_estate_properties', dedupeKey: 'address',
    fields: [
      { key: 'property_type', label: '物件種別', enum: [...PROPERTY_TYPES] },
      { key: 'address', label: '所在地' },
      { key: 'appraisal_value', label: '評価額', type: 'number' },
      { key: 'notes', label: '備考' },
    ],
  }],
  assets_deposit: [{
    key: 'deposits', label: '預金口座一覧', table: 'financial_assets', dedupeKey: 'institution_name',
    fields: [
      { key: 'institution_name', label: '金融機関名' },
      { key: 'branch_name', label: '支店' },
      { key: 'account_number', label: '口座番号' },
      { key: 'balance_amount', label: '残高', type: 'number' },
    ],
    fixedValues: { asset_type: '預貯金', acquirer: '自社' },
  }],
  assets_securities: [{
    key: 'securities', label: '証券一覧', table: 'financial_assets', dedupeKey: 'institution_name',
    fields: [
      { key: 'institution_name', label: '証券会社名' },
      { key: 'branch_name', label: '支店' },
      { key: 'balance_amount', label: '評価額', type: 'number' },
    ],
    fixedValues: { asset_type: '証券', acquirer: '自社' },
  }],
  assets_trust: [{
    key: 'trusts', label: '信託一覧', table: 'financial_assets', dedupeKey: 'institution_name',
    fields: [
      { key: 'institution_name', label: '信託銀行名' },
      { key: 'balance_amount', label: '残高', type: 'number' },
    ],
    fixedValues: { asset_type: '信託銀行', acquirer: '自社' },
  }],
  assets_insurance: [{
    key: 'insurances', label: '生命保険一覧', table: 'financial_assets', dedupeKey: 'institution_name',
    fields: [{ key: 'institution_name', label: '保険会社名' }],
    fixedValues: { asset_type: '生命保険', acquirer: '自社' },
  }],
}

// 保存済み手書きメモ（画像）一覧。署名URLで表示。
function SavedMemos({ memos, onDelete, readOnly }: { memos: MeetingMemoRow[]; onDelete: (m: MeetingMemoRow) => void; readOnly?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const supabase = createClient()
    const missing = memos.filter(m => m.image_path && !urls[m.id]); if (missing.length === 0) return
    ;(async () => { const next: Record<string, string> = {}; for (const m of missing) { const { data } = await supabase.storage.from(m.image_bucket || BUCKET).createSignedUrl(m.image_path!, 3600); if (data?.signedUrl) next[m.id] = data.signedUrl } if (Object.keys(next).length) setUrls(prev => ({ ...prev, ...next })) })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos])
  if (memos.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {memos.map(m => (
        <div key={m.id} className="relative">
          {m.image_path && urls[m.id]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={urls[m.id]} alt="手書き" className="h-16 rounded border border-gray-200 bg-white" />
            : <div className="h-16 w-24 rounded border border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">画像</div>}
          {!readOnly && <button type="button" onClick={() => onDelete(m)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 flex items-center justify-center shadow-sm"><Trash2 className="w-3 h-3" /></button>}
        </div>
      ))}
    </div>
  )
}

// ③オーダーシートへ引き継ぐ、手書きメモ（読み取り専用・セクション別）。
export const SEC_LABEL: Record<string, string> = { memoPhoto: '面談メモ（写真）', clientInfo: '依頼者情報', order: '提案内容・手続き内容', deceased: '相続人調査', assets_re: '財産調査（不動産）', assets_deposit: '財産調査（預金）', assets_securities: '財産調査（証券）', assets_trust: '財産調査（信託）', assets_insurance: '財産調査（生命保険）', referral: '他事業者紹介' }

/** 白紙メモの帯（＝セクション）の並び順。SEC_LABEL からラベルを引く。 */
export const WB_ORDER = ['clientInfo', 'order', 'deceased', 'assets_re', 'assets_deposit', 'assets_securities', 'assets_trust', 'assets_insurance', 'referral'] as const

/** 「AIで項目に反映」に対応しているセクション（他事業者紹介はメモのみ＝非対応）。 */
export const isExtractable = (sec: string) => !!EXTRACT_SCHEMA[sec] || !!ROW_EXTRACT_SCHEMA[sec]
export function MemoCarryOver({ memos }: { memos: MeetingMemoRow[] }) {
  if (memos.length === 0) return null
  const groups = [...new Set(memos.map(m => m.section || 'other'))]
  return (
    <div className="rounded-xl border border-[#D5E4FB] bg-[#F4F8FF] p-3.5 mb-3.5">
      <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-[#378ADD]" strokeWidth={2} /><span className="text-[12.5px] font-semibold text-[#185FA5]">面談シートの手書きメモ（引き継ぎ）</span><span className="text-[10px] text-[#7FA8D9] bg-[#E6F1FB] px-1.5 py-0.5 rounded">{memos.length}件</span></div>
      <div className="space-y-2.5">
        {groups.map(g => (<div key={g}><div className="text-[11px] font-semibold text-[#185FA5] mb-1">{SEC_LABEL[g] ?? 'メモ'}</div><SavedMemos memos={memos.filter(m => (m.section || 'other') === g)} onDelete={() => {}} readOnly /></div>))}
      </div>
    </div>
  )
}

// ── メモ欄＝セクションのフリー作業欄(work_content)。タイピング/手書き切替。 ──
function MemoField({ caseData, patchCase, section, memos, setMemos, onExtract }: {
  caseData: CaseRow; patchCase: (p: Partial<CaseRow>) => Promise<void>; section: string
  memos: MeetingMemoRow[]; setMemos: React.Dispatch<React.SetStateAction<MeetingMemoRow[]>>
  onExtract?: (src: { image?: string; text?: string }) => Promise<void>
}) {
  const wc = (caseData.work_content ?? {}) as Record<string, string>
  const [draft, setDraft] = useState(wc[section] ?? '')
  const [extractingText, setExtractingText] = useState(false)
  const secMemos = memos.filter(m => m.section === section)

  const saveText = (v: string) => patchCase({ work_content: { ...wc, [section]: v || null } } as Partial<CaseRow>)
  const delImg = async (m: MeetingMemoRow) => { const supabase = createClient(); if (m.image_path) await supabase.storage.from(m.image_bucket || BUCKET).remove([m.image_path]); await supabase.from('meeting_memos').delete().eq('id', m.id); setMemos(prev => prev.filter(x => x.id !== m.id)) }

  return (
    <div className="rounded-lg border border-gray-200 bg-[#FBFCFE] p-2.5 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-gray-500">メモ（＝このセクションのフリー作業欄・OS/実務と共有）</span>
      </div>
      {/* 項目モードはタイピング専用。手書きは「白紙モード」に一本化した（原本が2か所に散らばるのを防ぐ）。 */}
      <textarea data-handwriting-tool value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== (wc[section] ?? '')) saveText(draft) }} rows={4} placeholder="ここに入力（オーダーシート/実務タブのフリー欄に反映されます）" className="w-full text-[14px] leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-brand-400 resize-y" />
      {/* 本文をAIで項目に反映（onExtract=このセクションのextract定義あり時のみ表示） */}
      {onExtract && (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={async () => { if (!draft.trim()) return; setExtractingText(true); try { await onExtract({ text: draft }) } finally { setExtractingText(false) } }} disabled={!draft.trim() || extractingText} className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40"><Sparkles className="w-4 h-4" />{extractingText ? '反映中…' : 'AIで項目に反映'}</button>
        </div>
      )}
      {/* 過去に手書きで保存した画像がある場合のみ表示（新規追加は白紙モードから） */}
      <SavedMemos memos={secMemos} onDelete={delImg} />
    </div>
  )
}

// ── 相続人一覧（面談シート：氏名・続柄だけ・追加可） ──
function HeirsMini({ caseId, heirs, onRefresh, ensureCaseId }: { caseId: string; heirs: HeirRow[]; onRefresh?: () => void; ensureCaseId?: () => Promise<string> }) {
  const supabase = createClient()
  const [rows, setRows] = useRowsFrom(heirs)
  const save = (id: string, field: string, v: string) => {
    setRows(p => p.map(r => r.id === id ? { ...r, [field]: v } as HeirRow : r))
    // 続柄を「前妻/前夫」にしたら相続人フラグを落とす（離婚しているので相続人ではない）
    const patch: Record<string, unknown> = { [field]: v || null }
    if (field === 'relationship_type' && isFormerSpouse(v)) patch.is_legal_heir = false
    supabase.from('heirs').update(patch).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') })
  }
  // 同居（boolean）。相関図に「同居」バッジで出る。書類回収・連絡の起点になるため面談中に拾う。
  const saveLived = (id: string, v: boolean) => { setRows(p => p.map(r => r.id === id ? { ...r, lived_together: v } : r)); supabase.from('heirs').update({ lived_together: v }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }); onRefresh?.() }
  // 依頼者（boolean・migration 232）。続柄とは別軸。戸籍タスクはこの人の分から出すので面談中に押さえる。
  const saveClient = (id: string, v: boolean) => { setRows(p => p.map(r => r.id === id ? { ...r, is_client: v } : r)); supabase.from('heirs').update({ is_client: v }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }); onRefresh?.() }
  const add = async () => { const cid = ensureCaseId ? await ensureCaseId() : caseId; const { data, error } = await supabase.from('heirs').insert({ case_id: cid, name: '', sort_order: rows.length }).select('*').single(); if (error || !data) { showToast('追加に失敗', 'error'); return } setRows(p => [...p, data as HeirRow]); onRefresh?.() }
  const del = async (id: string) => { await supabase.from('heirs').delete().eq('id', id); setRows(p => p.filter(r => r.id !== id)); onRefresh?.() }
  // 前妻・前夫が入力されているときだけ「誰との子か」を聞く（未選択＝現配偶者との子）。
  const formerSpouses = rows.filter(r => isFormerSpouse(r.relationship_type ?? r.relationship))
  const saveParent = (id: string, v: string) => { setRows(p => p.map(r => r.id === id ? { ...r, other_parent_heir_id: v || null } : r)); supabase.from('heirs').update({ other_parent_heir_id: v || null }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }); onRefresh?.() }
  return (
    <div>
      <div className="text-[12px] font-semibold text-gray-500 mb-1.5">相続人一覧</div>
      {/* スマホは 氏名を1行／続柄・同居・削除を次の行 に折り返す（横に5つ並べると潰れて押せない）。
          sm以上はこれまでどおり1行。 */}
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 border border-gray-100 sm:border-0 rounded-lg sm:rounded-none p-2 sm:p-0">
            <input type="text" value={r.name ?? ''} onChange={e => save(r.id, 'name', e.target.value)} placeholder="氏名" className="w-full sm:flex-1 px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" />
            <select value={r.relationship_type ?? r.relationship ?? ''} onChange={e => save(r.id, 'relationship_type', e.target.value)} className="flex-1 sm:flex-none sm:w-28 min-w-[96px] px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400">
              <option value="">続柄</option>{HEIR_RELATIONSHIPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {formerSpouses.length > 0 && !isFormerSpouse(r.relationship_type ?? r.relationship) && (
              <select value={r.other_parent_heir_id ?? ''} onChange={e => saveParent(r.id, e.target.value)} className="flex-1 sm:flex-none sm:w-32 min-w-[120px] px-1.5 py-1.5 text-[11.5px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" title="誰との子か（相関図の線の出どころ）">
                <option value="">現配偶者との子</option>
                {formerSpouses.map(f => <option key={f.id} value={f.id}>{f.name || '前配偶者'}との子</option>)}
              </select>
            )}
            <label className={`inline-flex items-center gap-1 flex-none text-[11.5px] px-2 py-1.5 min-h-[40px] rounded border cursor-pointer whitespace-nowrap ${r.is_client ? 'bg-brand-50 border-brand-300 text-brand-800 font-semibold' : 'bg-white border-gray-200 text-gray-400'}`} title="この案件を依頼した相続人。戸籍タスクはこの人の分から出します">
              <input type="checkbox" checked={!!r.is_client} onChange={e => saveClient(r.id, e.target.checked)} className="w-4 h-4 accent-brand-600" />依頼者
            </label>
            <label className={`inline-flex items-center gap-1 flex-none text-[11.5px] px-2 py-1.5 min-h-[40px] rounded border cursor-pointer whitespace-nowrap ${r.lived_together ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold' : 'bg-white border-gray-200 text-gray-400'}`} title="被相続人と同居していたか（相関図に表示されます）">
              <input type="checkbox" checked={!!r.lived_together} onChange={e => saveLived(r.id, e.target.checked)} className="w-4 h-4 accent-amber-600" />同居
            </label>
            <button type="button" onClick={() => del(r.id)} className="p-2 flex-none text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />相続人を追加</button>
    </div>
  )
}

// ── 不動産（面談シート：物件種別・所在地・評価額・備考だけ） ──
function REMini({ caseId, properties, onRefresh, ensureCaseId }: { caseId: string; properties: RealEstatePropertyRow[]; onRefresh?: () => void; ensureCaseId?: () => Promise<string> }) {
  const supabase = createClient()
  const [rows, setRows] = useRowsFrom(properties)
  const save = (id: string, field: string, v: string) => { setRows(p => p.map(r => r.id === id ? { ...r, [field]: v } as RealEstatePropertyRow : r)); supabase.from('real_estate_properties').update({ [field]: v || null }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }) }
  const saveNum = (id: string, v: string) => { supabase.from('real_estate_properties').update({ appraisal_value: v ? Number(v) : null }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }) }
  const add = async () => { const cid = ensureCaseId ? await ensureCaseId() : caseId; const { data, error } = await supabase.from('real_estate_properties').insert({ case_id: cid }).select('*').single(); if (error || !data) { showToast('追加に失敗', 'error'); return } setRows(p => [...p, data as RealEstatePropertyRow]); onRefresh?.() }
  const del = async (id: string) => { await supabase.from('real_estate_properties').delete().eq('id', id); setRows(p => p.filter(r => r.id !== id)); onRefresh?.() }
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="border border-gray-200 rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block"><span className="block text-[11px] text-gray-400 mb-0.5">物件種別</span>
            <select value={r.property_type ?? ''} onChange={e => save(r.id, 'property_type', e.target.value)} className="w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400"><option value="">—</option>{r.property_type && !(PROPERTY_TYPES as readonly string[]).includes(r.property_type) && <option value={r.property_type}>{r.property_type}</option>}{PROPERTY_TYPES.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
          <label className="block"><span className="block text-[11px] text-gray-400 mb-0.5">所在地</span><input type="text" value={r.address ?? ''} onChange={e => save(r.id, 'address', e.target.value)} className="w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" /></label>
          {/* 地番＝土地、家屋番号＝建物。マンションは両方（財産目録の表記に使う） */}
          {needsLotNumber(r.property_type) && (
            <label className="block"><span className="block text-[11px] text-gray-400 mb-0.5">地番</span><input type="text" value={r.lot_number ?? ''} onChange={e => save(r.id, 'lot_number', e.target.value)} className="w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" /></label>
          )}
          {needsBuildingNumber(r.property_type) && (
            <label className="block"><span className="block text-[11px] text-gray-400 mb-0.5">家屋番号</span><input type="text" value={r.kaoku_bango ?? ''} onChange={e => save(r.id, 'kaoku_bango', e.target.value)} className="w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" /></label>
          )}
          <label className="block"><span className="block text-[11px] text-gray-400 mb-0.5">評価額</span><MoneyInput value={r.appraisal_value} onCommit={v => saveNum(r.id, v)} /></label>
          <label className="block"><span className="block text-[11px] text-gray-400 mb-0.5">備考</span><input type="text" value={r.notes ?? ''} onChange={e => save(r.id, 'notes', e.target.value)} placeholder="売却意向・査定状況 等" className="w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" /></label>
          <div className="sm:col-span-2 flex justify-end"><button type="button" onClick={() => del(r.id)} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" />削除</button></div>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />不動産を追加</button>
    </div>
  )
}

// ── 金融資産（種別ごと・要点列だけ） ──
type FinCol = { key: keyof FinancialAssetRow; label: string; money?: boolean }
function FinMini({ caseId, kind, cols, addLabel, assets, onRefresh, ensureCaseId }: { caseId: string; kind: string; cols: FinCol[]; addLabel: string; assets: FinancialAssetRow[]; onRefresh?: () => void; ensureCaseId?: () => Promise<string> }) {
  const supabase = createClient()
  // 種別で絞った配列は毎回作ると別物になるので、識別子を固定してから渡す
  const ofKind = useMemo(() => assets.filter(a => a.asset_type === kind), [assets, kind])
  const [rows, setRows] = useRowsFrom(ofKind)
  const save = (id: string, field: string, v: string) => { setRows(p => p.map(r => r.id === id ? { ...r, [field]: v } as FinancialAssetRow : r)); supabase.from('financial_assets').update({ [field]: v || null }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }) }
  const saveNum = (id: string, v: string) => { supabase.from('financial_assets').update({ balance_amount: v ? Number(v) : null }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }) }
  const add = async () => { const cid = ensureCaseId ? await ensureCaseId() : caseId; const { data, error } = await supabase.from('financial_assets').insert({ case_id: cid, asset_type: kind, institution_name: '', acquirer: '自社' }).select('*').single(); if (error || !data) { showToast('追加に失敗', 'error'); return } setRows(p => [...p, data as FinancialAssetRow]); onRefresh?.() }
  const del = async (id: string) => { await supabase.from('financial_assets').delete().eq('id', id); setRows(p => p.filter(r => r.id !== id)); onRefresh?.() }
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="border border-gray-200 rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cols.map(c => (
            <label key={c.key as string} className="block"><span className="block text-[11px] text-gray-400 mb-0.5">{c.label}</span>
              {c.money
                ? <MoneyInput value={r[c.key] as number | null} onCommit={v => saveNum(r.id, v)} />
                : <input type="text" value={(r[c.key] as string) ?? ''} onChange={e => save(r.id, c.key as string, e.target.value)} className="w-full px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" />}
            </label>
          ))}
          <div className="sm:col-span-2 flex justify-end"><button type="button" onClick={() => del(r.id)} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" />削除</button></div>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />{addLabel}</button>
    </div>
  )
}

// ── AIで項目に反映（共通処理） ───────────────────────────────
// ①面談シートの各セクションからも、白紙メモタブ（WhiteboardTab）からも使えるよう
// コンポーネント外に切り出したファクトリ。手書き画像(dataUrl)／テキストのどちらでも呼べる。
// 単一項目(EXTRACT_SCHEMA)と行データ(ROW_EXTRACT_SCHEMA)を同じメモから同時に抽出する。
export function createRunExtract(deps: {
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  caseId: string
  ensureCaseId?: () => Promise<string>
  onRefresh?: () => void
  onFilled?: (keys: string[]) => void
  /** true でトーストを出さない（まとめて反映で件数を集計してから1回だけ出したいとき） */
  silent?: boolean
}) {
  const toast = (msg: string, kind: 'success' | 'error') => { if (!deps.silent) showToast(msg, kind) }
  return (sec: string) => async (source: { image?: string; text?: string }): Promise<{ filled: number; added: number }> => {
    const singleSchema = EXTRACT_SCHEMA[sec]
    const rowSchemas = ROW_EXTRACT_SCHEMA[sec]
    if (!singleSchema && !rowSchemas) return { filled: 0, added: 0 }
    try {
      const body: Record<string, unknown> = {}
      if (singleSchema) body.fields = singleSchema.map(f => ({ key: f.key, label: f.label, enum: f.enum, type: f.type }))
      if (rowSchemas) body.rowGroups = rowSchemas.map(g => ({ key: g.key, label: g.label, fields: g.fields }))
      if (source.image) body.image = source.image
      if (source.text) body.text = source.text
      const res = await fetch('/api/ocr-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await res.json()) as { values?: Record<string, string | number>; rows?: Record<string, Array<Record<string, string | number>>>; error?: string }
      if (!res.ok) { toast(j.error ?? '反映に失敗しました', 'error'); return { filled: 0, added: 0 } }
      // 単一項目：case/clientへ上書き
      const values = j.values ?? {}
      const casePatch: Record<string, unknown> = {}, clientPatch: Record<string, unknown> = {}
      const filled: string[] = []
      for (const f of singleSchema ?? []) {
        const v = values[f.key]; if (v === undefined || v === null || v === '') continue
        if (f.target === 'case') casePatch[f.key] = v; else clientPatch[f.key] = v
        filled.push(f.key)
      }
      if (Object.keys(casePatch).length) await deps.patchCase(casePatch as Partial<CaseRow>)
      if (Object.keys(clientPatch).length) await deps.patchClient(clientPatch)
      // 行データ：該当テーブルへINSERT。
      // 「図→表」「表→図」どちらの順でも使えるようにしたため、両方やると同じ人が二重登録される。
      // そこで dedupeKey（相続人なら氏名）が既存行と一致するものはスキップする。
      let addedRowsTotal = 0
      let skippedRowsTotal = 0
      const cid = deps.ensureCaseId ? await deps.ensureCaseId() : deps.caseId
      const supabase = createClient()
      const norm = (v: unknown) => String(v ?? '').replace(/[\s　]/g, '')
      for (const g of rowSchemas ?? []) {
        const rows = j.rows?.[g.key] ?? []
        if (rows.length === 0) continue
        let fresh = rows
        if (g.dedupeKey) {
          // 既存行を取り出して突合（同一テーブルを複数グループで使うので fixedValues でも絞る）
          let q = supabase.from(g.table).select(`${g.dedupeKey}`).eq('case_id', cid)
          const at = (g.fixedValues as Record<string, unknown> | undefined)?.asset_type
          if (typeof at === 'string') q = q.eq('asset_type', at)
          const { data: existing } = await q
          // 動的 select のため戻り値の型が確定しない。unknown を経由して素の連想配列として読む。
          const existingRows = (existing ?? []) as unknown as Array<Record<string, unknown>>
          const seen = new Set(existingRows.map(r => norm(r[g.dedupeKey!])).filter(Boolean))
          fresh = rows.filter(r => {
            const k = norm(r[g.dedupeKey!])
            if (!k || seen.has(k)) return false
            seen.add(k)   // 同じ応答内での重複も弾く
            return true
          })
          skippedRowsTotal += rows.length - fresh.length
        }
        if (fresh.length === 0) continue
        const inserts = fresh.map(r => ({ case_id: cid, ...g.fixedValues, ...r }))
        const { error } = await supabase.from(g.table).insert(inserts)
        if (error) { toast(`${g.label}のAI追加に失敗: ${error.message}`, 'error'); continue }
        addedRowsTotal += fresh.length
      }
      if (addedRowsTotal > 0) deps.onRefresh?.()
      const parts: string[] = []
      if (filled.length) parts.push(`${filled.length}項目を反映`)
      if (addedRowsTotal > 0) parts.push(`${addedRowsTotal}件を追加`)
      if (skippedRowsTotal > 0) parts.push(`${skippedRowsTotal}件は登録済みのためスキップ`)
      if (parts.length === 0) {
        // 全部スキップ＝既に入っている、は失敗ではないので分けて伝える
        toast(skippedRowsTotal > 0 ? 'すべて登録済みでした（重複は追加していません）' : '反映できる項目が読み取れませんでした',
          skippedRowsTotal > 0 ? 'success' : 'error')
        return { filled: 0, added: 0 }
      }
      if (filled.length) deps.onFilled?.(filled)
      const note = addedRowsTotal > 0
        ? '青文字の項目・追加された行はAIが入力しました。中身が合っているか見直してください。'
        : '青文字の項目はAIが入力しました。中身が合っているか見直してください。'
      toast(`${parts.join('・')}しました。${note}`, 'success')
      return { filled: filled.length, added: addedRowsTotal }
    } catch { toast('通信に失敗しました', 'error'); return { filled: 0, added: 0 } }
  }
}

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  /** 未作成（下書き）モードで、書き込み前に案件を遅延作成して実IDを返す */
  ensureCaseId?: () => Promise<string>
  currentMemberId: string | null
  memos: MeetingMemoRow[]
  setMemos: React.Dispatch<React.SetStateAction<MeetingMemoRow[]>>
  caseClients: CaseClientRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  /** その他財産／相続債務／その他費用（case_other_assets） */
  otherAssets?: CaseOtherAssetRow[]
  onRefresh?: () => void
}

// 任意追加の金融種別
const OPTIONAL_FIN: { kind: string; label: string; section: string; cols: FinCol[] }[] = [
  { kind: '証券', label: '証券', section: 'assets_securities', cols: [{ key: 'institution_name', label: '証券会社' }, { key: 'branch_name', label: '支店' }, { key: 'balance_amount', label: '残高（評価額）', money: true }] },
  { kind: '信託銀行', label: '信託', section: 'assets_trust', cols: [{ key: 'institution_name', label: '信託銀行名' }, { key: 'balance_amount', label: '残高（評価額）', money: true }] },
  { kind: '生命保険', label: '生命保険', section: 'assets_insurance', cols: [{ key: 'institution_name', label: '保険会社名' }] },
]

// currentMemberId は面談メモ（写真）の保存者として使う。
export default function MeetingSheetTab({ caseData, patchCase, patchClient, ensureCaseId, memos, setMemos, caseClients, heirs, properties, financialAssets, otherAssets = [], onRefresh, currentMemberId }: Props) {
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set())
  const [diagramOpen, setDiagramOpen] = useState(false)   // 相続関係図の開閉（既定は閉じる）
  // 追加表示中の財産種別。すでに1行でも入っている種別は開いた状態で始める。
  // ここに その他財産／相続債務／その他費用 を含めていなかったため、
  // 入力したあとに開き直すとセクションごと消えて見えていた。
  const [extraFin, setExtraFin] = useState<Set<string>>(() => new Set([
    ...OPTIONAL_FIN.filter(f => financialAssets.some(a => a.asset_type === f.kind)).map(f => f.kind),
    ...OTHER_ASSET_KINDS.filter(k => otherAssets.some(o => o.kind === k.kind)).map(k => k.kind),
  ]))
  // その他財産／相続債務／その他費用 を種別ごとに分けておく。
  // 描画のたびに filter すると毎回別の配列になり、表側の「行の状態を親に合わせる」処理が
  // 毎レンダー走って入力中の行が作り直される（＝追加した行が一瞬消える）ため、識別子を固定する。
  const otherByKind = useMemo(() => {
    const m: Record<string, CaseOtherAssetRow[]> = {}
    for (const k of OTHER_ASSET_KINDS) m[k.kind] = otherAssets.filter(o => o.kind === k.kind)
    return m
  }, [otherAssets])
  const cl = caseData.clients
  // 振込名義人の自動入力元＝メイン依頼者のふりがな（clients.furigana が空なら依頼者一覧のメインから）
  const mainFurigana = cl?.furigana || (caseClients.find(c => c.priority === 'main') ?? caseClients[0])?.furigana

  const clearAi = (key: string) => setAiFilled(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n })

  // 財産の種類を足したとき、新しいセクションは「種類を追加」ボタンより上に生まれる。
  // そのままだと画面外に増えるので「押しても何も起きない」ように見える。追加したセクションまで送る。
  const showKind = (kind: string, sectionKey: string) => {
    setExtraFin(prev => new Set([...prev, kind]))
    setTimeout(() => {
      document.getElementById(`sec-${sectionKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }
  // AIで項目に反映：手書き画像（dataUrl）またはタイピング本文（text）のどちらでも呼べる。
  // 単一項目(EXTRACT_SCHEMA) と 行データ(ROW_EXTRACT_SCHEMA) を同じメモから同時に抽出できる。
  // AIで項目に反映：共通ファクトリ（createRunExtract）を使う。白紙メモタブと同じ処理。
  const runExtractRaw = createRunExtract({
    patchCase, patchClient, caseId: caseData.id, ensureCaseId, onRefresh,
    onFilled: keys => setAiFilled(prev => new Set([...prev, ...keys])),
  })
  const runExtract = (sec: string) => async (source: { image?: string; text?: string }) => { await runExtractRaw(sec)(source) }

  // セクション枠（描画関数：コンポーネント化すると再マウントで手書きが消えるため）。
  const sec = (key: string, title: string, badge: string | null, body: React.ReactNode, extract?: (src: { image?: string; text?: string }) => Promise<void>, hideMemo?: boolean) => (
    <div key={key} id={`sec-${key}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1E3A8A]"><span className="text-[14px] font-bold text-white flex-1">{title}</span>{badge && <span className="text-[10px] text-white bg-white/22 rounded-full px-1.5 py-0.5">{badge}</span>}</div>
      <div className="p-4">
        {!hideMemo && <MemoField caseData={caseData} patchCase={patchCase} section={key} memos={memos} setMemos={setMemos} onExtract={extract} />}
        {body}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {sec('clientInfo', '依頼者情報', null, (
        <div className="space-y-3">
          <CaseClientsTable caseId={caseData.id} clients={caseClients} onRefresh={onRefresh} clientId={caseData.client_id} ensureCaseId={ensureCaseId} />
          <FieldGrid>
            <InlineEdit label="住所" value={cl?.address ?? null} ai={aiFilled.has('address')} onSave={v => { clearAi('address'); return patchClient({ address: v || null }) }} fullWidth />
            {/* 振込名義人＝入金CSV突合のキー。本人振込なら依頼者のふりがなをカタカナで入れる。
                案件詳細の依頼者タブと同じボタンを、面談シートにも置く。 */}
            <InlineEdit
              label="振込名義人 候補①（カナ）"
              value={cl?.transfer_name_kana ?? null}
              ai={aiFilled.has('transfer_name_kana')}
              onSave={v => { clearAi('transfer_name_kana'); return patchClient({ transfer_name_kana: toKatakana(v) || null }) }}
              mono
              hint={mainFurigana ? undefined : 'メイン依頼者にふりがなが未入力です（上の依頼者一覧で入れると取得できます）'}
              action={
                <button
                  type="button"
                  disabled={!mainFurigana}
                  onClick={() => mainFurigana && patchClient({ transfer_name_kana: toKatakana(mainFurigana) })}
                  className="text-[11px] font-medium text-brand-600 hover:text-brand-700 px-1.5 py-0.5 rounded border border-brand-200 bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >メイン依頼者のフリガナを取得</button>
              }
            />
          </FieldGrid>
        </div>
      ), runExtract('clientInfo'))}

      {sec('order', '提案内容・手続き内容', null, (
        <OrderContentTab caseData={caseData} patchCase={patchCase} orderSheetMode meetingSheetMode />
      ), runExtract('order'))}

      {sec('deceased', '相続人調査', null, (
        <div className="space-y-3">
          <FieldGrid>
            <InlineEdit label="被相続人氏名" value={caseData.deceased_name} ai={aiFilled.has('deceased_name')} onSave={v => { clearAi('deceased_name'); return patchCase({ deceased_name: v || null }) }} />
            <InlineEdit label="被相続人ふりがな" value={caseData.deceased_furigana} ai={aiFilled.has('deceased_furigana')} onSave={v => { clearAi('deceased_furigana'); return patchCase({ deceased_furigana: v || null }) }} />
            {/* 生年月日・死亡日は役所申請が和暦基準のため、②面談結果登録・実務タブと同じ和暦入力に統一。
                DBには従来どおり西暦ISOで保存する。 */}
            <div className="py-1.5">
              <div className="text-[12.5px] font-semibold text-gray-500 tracking-wide mb-1">被相続人生年月日</div>
              <BirthdayPicker value={caseData.deceased_birth_date} onChange={v => { clearAi('deceased_birth_date'); patchCase({ deceased_birth_date: v || null }) }} />
            </div>
            <div className="py-1.5">
              <div className="text-[12.5px] font-semibold text-gray-500 tracking-wide mb-1">相続開始日（死亡日）</div>
              <BirthdayPicker value={caseData.date_of_death} onChange={v => { clearAi('date_of_death'); patchCase({ date_of_death: v || null }) }} />
            </div>
            <InlineEdit label="被相続人住所" value={caseData.deceased_address} ai={aiFilled.has('deceased_address')} onSave={v => { clearAi('deceased_address'); return patchCase({ deceased_address: v || null }) }} fullWidth />
            <InlineEdit label="被相続人本籍" value={caseData.deceased_registered_address} ai={aiFilled.has('deceased_registered_address')} onSave={v => { clearAi('deceased_registered_address'); return patchCase({ deceased_registered_address: v || null }) }} fullWidth />
          </FieldGrid>
          <HeirsMini caseId={caseData.id} heirs={heirs} onRefresh={onRefresh} ensureCaseId={ensureCaseId} />

          {/* 相関図。面談中にその場で家族関係を確認・訂正できるよう、折りたたみで置く
              （常時展開だと面談シートが縦に長くなりすぎるため）。図は実務タブと同じ部品。 */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button type="button" onClick={() => setDiagramOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
              <span className="text-[12.5px] font-semibold text-gray-700 flex-1 text-left">相続関係図</span>
              <span className="text-[11px] text-gray-400">{heirs.length}名</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${diagramOpen ? 'rotate-180' : ''}`} />
            </button>
            {diagramOpen && (
              <div className="p-2 bg-white">
                {heirs.length === 0
                  ? <p className="text-[12px] text-gray-400 text-center py-6">相続人を追加すると関係図が表示されます</p>
                  : <div className="overflow-x-auto"><InheritanceDiagramV2 deceased={caseData} heirs={heirs} /></div>}
              </div>
            )}
          </div>
        </div>
      ), runExtract('deceased'))}

      {sec('assets_re', '財産調査（不動産）', '常時表示', (
        <REMini caseId={caseData.id} properties={properties} onRefresh={onRefresh} ensureCaseId={ensureCaseId} />
      ), runExtract('assets_re'))}

      {sec('assets_deposit', '財産調査（預金）', '常時表示', (
        <FinMini caseId={caseData.id} kind="預貯金" addLabel="口座を追加" assets={financialAssets} onRefresh={onRefresh} ensureCaseId={ensureCaseId} cols={[{ key: 'institution_name', label: '金融機関名' }, { key: 'branch_name', label: '支店' }, { key: 'account_number', label: '口座番号' }, { key: 'balance_amount', label: '残高（評価額）', money: true }]} />
      ), runExtract('assets_deposit'))}

      {OPTIONAL_FIN.filter(f => extraFin.has(f.kind)).map(f => (
        <div key={f.kind}>
          {sec(f.section, `財産調査（${f.label}）`, '任意', (
            <FinMini caseId={caseData.id} kind={f.kind} addLabel={`${f.label}を追加`} assets={financialAssets} onRefresh={onRefresh} ensureCaseId={ensureCaseId} cols={f.cols} />
          ), runExtract(f.section))}
        </div>
      ))}

      {/* その他財産／相続債務／その他費用。面談シートでは 項目・金額 だけを入力する
          （根拠資料・精算・立替者は実務タブで詰める）。 */}
      {OTHER_ASSET_KINDS.filter(k => extraFin.has(k.kind)).map(k => (
        <div key={k.kind}>
          {sec(`other_${k.kind}`, k.kind, k.negative ? 'マイナス' : '任意', (
            <>
              <p className="text-[11px] text-gray-400 mb-1.5">{k.hint}</p>
              <OtherAssetsTable caseId={caseData.id} kind={k.kind} rows={otherByKind[k.kind] ?? []} onRefresh={onRefresh} ensureCaseId={ensureCaseId} />
            </>
          ), undefined, true)}
        </div>
      ))}

      {/* 財産の種類を追加 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-gray-500">財産の種類を追加：</span>
        {OPTIONAL_FIN.filter(f => !extraFin.has(f.kind)).map(f => (
          <button key={f.kind} type="button" onClick={() => showKind(f.kind, f.section)} className="inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-brand-600 hover:border-brand-300"><Plus className="w-3.5 h-3.5" />{f.label}</button>
        ))}
        {/* 相続債務・その他費用はマイナス計上なので色で区別する */}
        {OTHER_ASSET_KINDS.filter(k => !extraFin.has(k.kind)).map(k => (
          <button key={k.kind} type="button" onClick={() => showKind(k.kind, `other_${k.kind}`)} title={k.hint}
            className={`inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-dashed ${k.negative ? 'border-red-300 text-red-600 hover:border-red-400' : 'border-gray-300 text-brand-600 hover:border-brand-300'}`}>
            <Plus className="w-3.5 h-3.5" />{k.kind}
          </button>
        ))}
        {OPTIONAL_FIN.every(f => extraFin.has(f.kind)) && OTHER_ASSET_KINDS.every(k => extraFin.has(k.kind)) && <span className="text-[11px] text-gray-300">すべて表示中</span>}
      </div>

      {sec('referral', '他事業者紹介', null, (
        <p className="text-[12px] text-gray-400">紹介の要否はメモ欄に記録してください（不動産査定・税理士など。詳細は③オーダーシートの他事業者紹介で入力）。</p>
      ))}

      {/* 遺産分割 / 遺言 / 相続登記 / 解約等：メモ欄のみのセクション。
          work_content キーはOS/実務タブと同一にして、面談で書いたメモが③受注内容以降の同名セクションと共有される。
          ※「信託契約 ほか手続き」は廃止。7業務の寄せ集めで何を書く欄か分かりにくいうえ、
            キー(trust_other)がOS・実務タブのどこからも読まれず、書いても引き継がれなかったため。
            信託・放棄・調停・検認・後見などは「提案内容・手続き内容」のメモに書く（こちらはOSと共有される）。 */}
      {sec('division', '遺産分割', null, (
        <p className="text-[12px] text-gray-400">分割方針・分配イメージ等をメモ欄に記録してください（詳細は③オーダーシートで入力）。</p>
      ))}
      {sec('will', '遺言', null, (
        <p className="text-[12px] text-gray-400">遺言の種類（自筆/公正証書）や作成場所・文案の状況をメモ欄に記録してください。</p>
      ))}
      {sec('registration', '相続登記', null, (
        <p className="text-[12px] text-gray-400">登記種別（所有権移転・住所氏名変更 等）・登記原因をメモ欄に記録してください。</p>
      ))}
      {sec('cancellation', '解約等（銀行・証券・自動車）', null, (
        <p className="text-[12px] text-gray-400">解約したい口座・自動車の内容や優先順位をメモ欄に記録してください。</p>
      ))}
    </div>
  )
}

'use client'

// 統合入力アプリ ①面談シート。エクセルの[面談シート]=〇項目だけをセクション別に表示。
// 各セクションのメモ欄＝そのセクションのフリー作業欄(work_content)に統合。タイピング/手書き切替。
// 手書きは「テキスト化→フリー欄へ」＋画像は meeting_memos に保存し③へ引き継ぎ。構造化できる所は「AIで項目に反映」。
import { useRef, useState, useEffect, useCallback, type PointerEvent as RPointerEvent } from 'react'
import { Eraser, Sparkles, Save, Trash2, Plus, Pen, Highlighter, Keyboard, PencilLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, InlineEdit, InlineDate } from '@/components/ui/InlineFields'
import { HEIR_RELATIONSHIPS, PROPERTY_TYPES } from '@/lib/constants'
import OrderContentTab from '@/components/features/cases/OrderContentTab'
import CaseClientsTable from '@/components/features/cases/CaseClientsTable'
import { MoneyInput } from '@/components/features/cases/FinancialAssetsTable'
import type { CaseRow, CaseClientRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow } from '@/types'
import type { MeetingMemoRow } from './IntakeCaseClient'

type Pt = { x: number; y: number }
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
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
}
// case_clients の table 型は 'heirs'/'real_estate_properties'/'financial_assets' 以外を許容する必要がある
type ExtractRowTable = 'heirs' | 'real_estate_properties' | 'financial_assets' | 'case_clients'
const ROW_EXTRACT_SCHEMA: Record<string, (Omit<RowExtractSchema, 'table'> & { table: ExtractRowTable })[]> = {
  // 依頼者情報：CaseClientsTable(case_clients)へAI追加。優先度は既定 companion(安全側)。ユーザーが必要に応じてメイン依頼人に切替。
  clientInfo: [{
    key: 'clients', label: '依頼者・同行者一覧', table: 'case_clients',
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
    key: 'heirs', label: '相続人一覧', table: 'heirs',
    fields: [
      { key: 'name', label: '氏名' },
      { key: 'relationship_type', label: '続柄', enum: [...HEIR_RELATIONSHIPS] },
    ],
  }],
  assets_re: [{
    key: 'properties', label: '不動産一覧', table: 'real_estate_properties',
    fields: [
      { key: 'property_type', label: '物件種別', enum: [...PROPERTY_TYPES] },
      { key: 'address', label: '所在地' },
      { key: 'appraisal_value', label: '評価額', type: 'number' },
      { key: 'notes', label: '備考' },
    ],
  }],
  assets_deposit: [{
    key: 'deposits', label: '預金口座一覧', table: 'financial_assets',
    fields: [
      { key: 'institution_name', label: '金融機関名' },
      { key: 'balance_amount', label: '残高', type: 'number' },
    ],
    fixedValues: { asset_type: '預貯金', acquirer: '自社' },
  }],
  assets_securities: [{
    key: 'securities', label: '証券一覧', table: 'financial_assets',
    fields: [{ key: 'institution_name', label: '証券会社名' }],
    fixedValues: { asset_type: '証券', acquirer: '自社' },
  }],
  assets_trust: [{
    key: 'trusts', label: '信託一覧', table: 'financial_assets',
    fields: [
      { key: 'institution_name', label: '信託銀行名' },
      { key: 'notes', label: '備考' },
    ],
    fixedValues: { asset_type: '信託銀行', acquirer: '自社' },
  }],
  assets_insurance: [{
    key: 'insurances', label: '生命保険一覧', table: 'financial_assets',
    fields: [{ key: 'institution_name', label: '保険会社名' }],
    fixedValues: { asset_type: '生命保険', acquirer: '自社' },
  }],
}

// ── 縦リサイズ可の手書きキャンバス（ペン/蛍光ペン/消しゴム）。テキスト化・画像保存・AI反映は親のコールバック。 ──
function HandwriteCanvas({ onText, onSaveImage, onExtract, saving, onDrawingChange }: {
  onText: (t: string) => void; onSaveImage: (dataUrl: string) => Promise<void>; onExtract?: (src: { image?: string; text?: string }) => Promise<void>; saving: boolean
  onDrawingChange?: (active: boolean) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<Pt | null>(null)
  const [empty, setEmpty] = useState(true)
  const emptyRef = useRef(true)
  const [busy, setBusy] = useState<'' | 'ocr' | 'extract'>('')
  const [mode, setMode] = useState<'pen' | 'marker' | 'eraser'>('pen')
  const modeRef = useRef(mode); modeRef.current = mode

  // キャンバスの元の CSS サイズを覚えておく（リサイズ時に旧描画を等倍で貼り戻すため）。
  const prevCssRef = useRef<{ w: number; h: number } | null>(null)
  const setup = useCallback(() => {
    const c = canvasRef.current, wrap = wrapRef.current; if (!c || !wrap) return
    const rect = wrap.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return
    const prev = emptyRef.current ? null : c.toDataURL('image/png')
    const prevCss = prevCssRef.current
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    // 旧描画を等倍で左上に貼り戻す（拡大時に補間でぼやけないように）。書き足しは新しく増えた領域で継続可能。
    if (prev) {
      const img = new Image()
      img.onload = () => { const w = prevCss?.w ?? rect.width, h = prevCss?.h ?? rect.height; ctx.drawImage(img, 0, 0, w, h) }
      img.src = prev
    }
    prevCssRef.current = { w: rect.width, h: rect.height }
  }, [])
  useEffect(() => { setup(); const wrap = wrapRef.current; if (!wrap) return; const ro = new ResizeObserver(() => setup()); ro.observe(wrap); return () => ro.disconnect() }, [setup])

  const pos = (e: RPointerEvent<HTMLCanvasElement>): Pt => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => { drawing.current = true; onDrawingChange?.(true); last.current = pos(e); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ } }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !last.current) return
    const p = pos(e); const m = modeRef.current
    if (m === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = 20 }
    else if (m === 'marker') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(250,204,21,0.4)'; ctx.lineWidth = 16 }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1 + (e.pressure ? e.pressure * 2.4 : 1.2) }
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    last.current = p; if (emptyRef.current && m !== 'eraser') { emptyRef.current = false; setEmpty(false) }
  }
  const up = () => { drawing.current = false; onDrawingChange?.(false); last.current = null }
  const clear = () => { const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d'); if (ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore() } emptyRef.current = true; setEmpty(true) }
  const ocr = async () => {
    const c = canvasRef.current; if (!c || empty) return; setBusy('ocr')
    try {
      const res = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/png') }) })
      const j = (await res.json()) as { text?: string; error?: string }
      if (!res.ok) { showToast(j.error ?? '認識に失敗しました', 'error'); return }
      if (j.text) {
        onText(j.text)
        // ※ キャンバスは自動クリアしない。ユーザーは同じ手書きに対して続けて「AIで項目に反映」や「画像を保存」を行えるようにする。
        //   書き足してから再テキスト化するときは、既にテキスト化したストロークを手動で消しゴム/全消去してから再実行することを推奨。
      } else {
        showToast('認識できませんでした', 'error')
      }
    } catch { showToast('通信に失敗しました', 'error') } finally { setBusy('') }
  }
  const saveImg = async () => { const c = canvasRef.current; if (!c || empty) return; await onSaveImage(c.toDataURL('image/png')) }
  const extract = async () => { const c = canvasRef.current; if (!c || empty || !onExtract) return; setBusy('extract'); try { await onExtract({ image: c.toDataURL('image/png') }) } finally { setBusy('') } }

  return (
    <div>
      <div ref={wrapRef} style={{ height: 240, minHeight: 140, resize: 'vertical', overflow: 'hidden' }} className="rounded-lg bg-white border border-dashed border-gray-300 relative">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }} className="cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-gray-300">↕ 下端で拡大</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {([['pen', 'ペン', Pen], ['marker', '蛍光', Highlighter], ['eraser', '消しゴム', Eraser]] as const).map(([k, label, Icon], i) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] ${i > 0 ? 'border-l border-gray-200' : ''} ${mode === k ? (k === 'marker' ? 'bg-amber-100 text-amber-800' : 'bg-brand-600 text-white') : 'bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100'}`}><Icon className="w-4 h-4" />{label}</button>
          ))}
        </div>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100"><Trash2 className="w-4 h-4" />全消去</button>
        {/* 使う順序を数字プレフィックスで明示：①テキスト化 → ②AIで項目反映 → ③画像を保存(バックアップ) */}
        <button type="button" onClick={ocr} disabled={empty || !!busy} title="① 手書きをテキストに起こしてフリー欄へ転記" className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold">1</span><Sparkles className="w-4 h-4" />{busy === 'ocr' ? '認識中…' : 'テキスト化→フリー欄へ'}</button>
        {onExtract && <button type="button" onClick={extract} disabled={empty || !!busy} title="② 手書きから項目値をAIが読み取って各フィールドを埋める" className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span><Sparkles className="w-4 h-4" />{busy === 'extract' ? '反映中…' : 'AIで項目に反映'}</button>}
        <button type="button" onClick={saveImg} disabled={empty || saving} title="③ 手書きの原本をバックアップ画像として保存" className="ml-auto inline-flex items-center gap-1 text-[13px] px-3.5 py-2 min-h-[40px] rounded-lg text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-brand-700 text-[10px] font-bold">3</span><Save className="w-4 h-4" />画像を保存</button>
      </div>
    </div>
  )
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
export const SEC_LABEL: Record<string, string> = { clientInfo: '依頼者情報', order: '提案内容・手続き内容', deceased: '相続人調査', assets_re: '財産調査（不動産）', assets_deposit: '財産調査（預金）', assets_securities: '財産調査（証券）', assets_trust: '財産調査（信託）', assets_insurance: '財産調査（生命保険）', referral: '他事業者紹介' }

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
function MemoField({ caseData, patchCase, section, memos, currentMemberId, setMemos, onExtract, ensureCaseId }: {
  caseData: CaseRow; patchCase: (p: Partial<CaseRow>) => Promise<void>; section: string
  memos: MeetingMemoRow[]; currentMemberId: string | null; setMemos: React.Dispatch<React.SetStateAction<MeetingMemoRow[]>>
  onExtract?: (src: { image?: string; text?: string }) => Promise<void>; ensureCaseId?: () => Promise<string>
}) {
  const wc = (caseData.work_content ?? {}) as Record<string, string>
  const [mode, setMode] = useState<'type' | 'hand'>('type')
  const [draft, setDraft] = useState(wc[section] ?? '')
  const [saving, setSaving] = useState(false)
  const [extractingText, setExtractingText] = useState(false)
  const secMemos = memos.filter(m => m.section === section)

  // 手書き中は他の項目（input/textarea/select）を触れなくする（掌が誤タップするのを防ぐ）。
  // body に .is-handwriting-active クラスを付けて CSS で pointer-events を制御。
  const setDrawingActive = (active: boolean) => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('is-handwriting-active', active)
  }

  const saveText = (v: string) => patchCase({ work_content: { ...wc, [section]: v || null } } as Partial<CaseRow>)
  const appendText = (t: string) => { setDraft(prev => { const next = (prev ? prev + '\n' : '') + t; saveText(next); return next }) }
  const saveImage = async (dataUrl: string) => {
    setSaving(true); const supabase = createClient()
    try {
      const cid = ensureCaseId ? await ensureCaseId() : caseData.id
      // 上書き保存：同じ (case, section) の既存画像を先に削除してから新規insert。
      // これにより 同じセクションで「画像を保存」を何度押しても 1枚だけになる。
      const existing = memos.filter(m => m.section === section)
      if (existing.length > 0) {
        const paths = existing.map(m => m.image_path).filter((p): p is string => !!p)
        if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
        await supabase.from('meeting_memos').delete().in('id', existing.map(m => m.id))
      }
      const blob = await (await fetch(dataUrl)).blob(); const path = `${cid}/${uid()}.png`
      const { error: up } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false }); if (up) throw new Error(up.message)
      const { data: row, error } = await supabase.from('meeting_memos').insert({ case_id: cid, section, image_path: path, image_bucket: BUCKET, sort_order: 0, created_by: currentMemberId }).select('*').single()
      if (error || !row) throw new Error(error?.message ?? '保存に失敗')
      // ローカルからは同 section の旧レコードを除いて 新レコードを追加(=常に1枚)
      setMemos(prev => [...prev.filter(m => m.section !== section), row as MeetingMemoRow])
      showToast('手書きを保存しました（上書き）', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : '保存に失敗', 'error') } finally { setSaving(false) }
  }
  const delImg = async (m: MeetingMemoRow) => { const supabase = createClient(); if (m.image_path) await supabase.storage.from(m.image_bucket || BUCKET).remove([m.image_path]); await supabase.from('meeting_memos').delete().eq('id', m.id); setMemos(prev => prev.filter(x => x.id !== m.id)) }

  return (
    <div className="rounded-lg border border-gray-200 bg-[#FBFCFE] p-2.5 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-gray-500">メモ（＝このセクションのフリー作業欄・OS/実務と共有）</span>
        <div className="ml-auto inline-flex rounded-md border border-gray-200 overflow-hidden">
          <button type="button" onClick={() => setMode('type')} className={`inline-flex items-center gap-1 text-[13px] px-3.5 py-2 min-h-[40px] ${mode === 'type' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 active:bg-gray-100'}`}><Keyboard className="w-4 h-4" />タイピング</button>
          <button type="button" onClick={() => setMode('hand')} className={`inline-flex items-center gap-1 text-[13px] px-3.5 py-2 min-h-[40px] border-l border-gray-200 ${mode === 'hand' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 active:bg-gray-100'}`}><PencilLine className="w-4 h-4" />手書き</button>
        </div>
      </div>
      {mode === 'type' ? (
        <>
          <textarea data-handwriting-tool value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== (wc[section] ?? '')) saveText(draft) }} rows={4} placeholder="ここに入力（オーダーシート/実務タブのフリー欄に反映されます）" className="w-full text-[14px] leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-brand-400 resize-y" />
          {/* タイピング本文をAIで項目に反映（onExtract=このセクションのextract定義あり時のみ表示） */}
          {onExtract && (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={async () => { if (!draft.trim()) return; setExtractingText(true); try { await onExtract({ text: draft }) } finally { setExtractingText(false) } }} disabled={!draft.trim() || extractingText} className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40"><Sparkles className="w-4 h-4" />{extractingText ? '反映中…' : 'AIで項目に反映'}</button>
            </div>
          )}
        </>
      ) : (
        <>
          <HandwriteCanvas onText={appendText} onSaveImage={saveImage} onExtract={onExtract} saving={saving} onDrawingChange={setDrawingActive} />
          {draft && <p className="mt-2 text-[12px] text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">フリー欄：{draft}</p>}
        </>
      )}
      <SavedMemos memos={secMemos} onDelete={delImg} />
    </div>
  )
}

// ── 相続人一覧（面談シート：氏名・続柄だけ・追加可） ──
function HeirsMini({ caseId, heirs, onRefresh, ensureCaseId }: { caseId: string; heirs: HeirRow[]; onRefresh?: () => void; ensureCaseId?: () => Promise<string> }) {
  const supabase = createClient()
  const [rows, setRows] = useState<HeirRow[]>(heirs)
  useEffect(() => setRows(heirs), [heirs])
  const save = (id: string, field: string, v: string) => { setRows(p => p.map(r => r.id === id ? { ...r, [field]: v } as HeirRow : r)); supabase.from('heirs').update({ [field]: v || null }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') }) }
  const add = async () => { const cid = ensureCaseId ? await ensureCaseId() : caseId; const { data, error } = await supabase.from('heirs').insert({ case_id: cid, name: '', sort_order: rows.length }).select('*').single(); if (error || !data) { showToast('追加に失敗', 'error'); return } setRows(p => [...p, data as HeirRow]); onRefresh?.() }
  const del = async (id: string) => { await supabase.from('heirs').delete().eq('id', id); setRows(p => p.filter(r => r.id !== id)); onRefresh?.() }
  return (
    <div>
      <div className="text-[12px] font-semibold text-gray-500 mb-1.5">相続人一覧</div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2">
            <input type="text" value={r.name ?? ''} onChange={e => save(r.id, 'name', e.target.value)} placeholder="氏名" className="flex-1 px-2 py-1.5 text-[13px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400" />
            <select value={r.relationship_type ?? r.relationship ?? ''} onChange={e => save(r.id, 'relationship_type', e.target.value)} className="w-28 px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-400">
              <option value="">続柄</option>{HEIR_RELATIONSHIPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <button type="button" onClick={() => del(r.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
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
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  useEffect(() => setRows(properties), [properties])
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
  const [rows, setRows] = useState<FinancialAssetRow[]>(assets.filter(a => a.asset_type === kind))
  useEffect(() => setRows(assets.filter(a => a.asset_type === kind)), [assets, kind])
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
      // 行データ：該当テーブルへINSERT（重複判定なし・常に追加）
      let addedRowsTotal = 0
      const cid = deps.ensureCaseId ? await deps.ensureCaseId() : deps.caseId
      const supabase = createClient()
      for (const g of rowSchemas ?? []) {
        const rows = j.rows?.[g.key] ?? []
        if (rows.length === 0) continue
        const inserts = rows.map(r => ({ case_id: cid, ...g.fixedValues, ...r }))
        const { error } = await supabase.from(g.table).insert(inserts)
        if (error) { toast(`${g.label}のAI追加に失敗: ${error.message}`, 'error'); continue }
        addedRowsTotal += rows.length
      }
      if (addedRowsTotal > 0) deps.onRefresh?.()
      const parts: string[] = []
      if (filled.length) parts.push(`${filled.length}項目を反映`)
      if (addedRowsTotal > 0) parts.push(`${addedRowsTotal}件を追加`)
      if (parts.length === 0) { toast('反映できる項目が読み取れませんでした', 'error'); return { filled: 0, added: 0 } }
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
  onRefresh?: () => void
}

// 任意追加の金融種別
const OPTIONAL_FIN: { kind: string; label: string; section: string; cols: FinCol[] }[] = [
  { kind: '証券', label: '証券', section: 'assets_securities', cols: [{ key: 'institution_name', label: '証券会社' }] },
  { kind: '信託銀行', label: '信託', section: 'assets_trust', cols: [{ key: 'institution_name', label: '信託銀行名' }, { key: 'notes', label: '備考' }] },
  { kind: '生命保険', label: '生命保険', section: 'assets_insurance', cols: [{ key: 'institution_name', label: '保険会社名' }] },
]

export default function MeetingSheetTab({ caseData, patchCase, patchClient, ensureCaseId, currentMemberId, memos, setMemos, caseClients, heirs, properties, financialAssets, onRefresh }: Props) {
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set())
  const [extraFin, setExtraFin] = useState<Set<string>>(() => new Set(OPTIONAL_FIN.filter(f => financialAssets.some(a => a.asset_type === f.kind)).map(f => f.kind)))
  const cl = caseData.clients

  const clearAi = (key: string) => setAiFilled(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n })
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
    <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1E3A8A]"><span className="text-[14px] font-bold text-white flex-1">{title}</span>{badge && <span className="text-[10px] text-white bg-white/22 rounded-full px-1.5 py-0.5">{badge}</span>}</div>
      <div className="p-4">
        {!hideMemo && <MemoField caseData={caseData} patchCase={patchCase} section={key} memos={memos} currentMemberId={currentMemberId} setMemos={setMemos} onExtract={extract} ensureCaseId={ensureCaseId} />}
        {body}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-gray-500">面談中の要点を記録します。各項目・メモは案件に保存され、②面談結果登録・③オーダーシートに引き継がれます。</p>

      {sec('clientInfo', '依頼者情報', null, (
        <div className="space-y-3">
          <CaseClientsTable caseId={caseData.id} clients={caseClients} onRefresh={onRefresh} clientId={caseData.client_id} ensureCaseId={ensureCaseId} />
          <FieldGrid>
            <InlineEdit label="住所" value={cl?.address ?? null} ai={aiFilled.has('address')} onSave={v => { clearAi('address'); return patchClient({ address: v || null }) }} fullWidth />
            <InlineEdit label="振込名義人 候補①（カナ）" value={cl?.transfer_name_kana ?? null} ai={aiFilled.has('transfer_name_kana')} onSave={v => { clearAi('transfer_name_kana'); return patchClient({ transfer_name_kana: v || null }) }} mono />
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
            <InlineDate label="被相続人生年月日" value={caseData.deceased_birth_date} ai={aiFilled.has('deceased_birth_date')} onSave={v => { clearAi('deceased_birth_date'); return patchCase({ deceased_birth_date: v || null }) }} />
            <InlineDate label="相続開始日（死亡日）" value={caseData.date_of_death} ai={aiFilled.has('date_of_death')} onSave={v => { clearAi('date_of_death'); return patchCase({ date_of_death: v || null }) }} />
            <InlineEdit label="被相続人住所" value={caseData.deceased_address} ai={aiFilled.has('deceased_address')} onSave={v => { clearAi('deceased_address'); return patchCase({ deceased_address: v || null }) }} fullWidth />
            <InlineEdit label="被相続人本籍" value={caseData.deceased_registered_address} ai={aiFilled.has('deceased_registered_address')} onSave={v => { clearAi('deceased_registered_address'); return patchCase({ deceased_registered_address: v || null }) }} fullWidth />
          </FieldGrid>
          <HeirsMini caseId={caseData.id} heirs={heirs} onRefresh={onRefresh} ensureCaseId={ensureCaseId} />
        </div>
      ), runExtract('deceased'))}

      {sec('assets_re', '財産調査（不動産）', '常時表示', (
        <REMini caseId={caseData.id} properties={properties} onRefresh={onRefresh} ensureCaseId={ensureCaseId} />
      ), runExtract('assets_re'))}

      {sec('assets_deposit', '財産調査（預金）', '常時表示', (
        <FinMini caseId={caseData.id} kind="預貯金" addLabel="口座を追加" assets={financialAssets} onRefresh={onRefresh} ensureCaseId={ensureCaseId} cols={[{ key: 'institution_name', label: '金融機関名' }, { key: 'balance_amount', label: '残高（評価額）', money: true }]} />
      ), runExtract('assets_deposit'))}

      {OPTIONAL_FIN.filter(f => extraFin.has(f.kind)).map(f => (
        <div key={f.kind}>
          {sec(f.section, `財産調査（${f.label}）`, '任意', (
            <FinMini caseId={caseData.id} kind={f.kind} addLabel={`${f.label}を追加`} assets={financialAssets} onRefresh={onRefresh} ensureCaseId={ensureCaseId} cols={f.cols} />
          ), runExtract(f.section))}
        </div>
      ))}

      {/* 財産の種類を追加 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-gray-500">財産の種類を追加：</span>
        {OPTIONAL_FIN.filter(f => !extraFin.has(f.kind)).map(f => (
          <button key={f.kind} type="button" onClick={() => setExtraFin(prev => new Set([...prev, f.kind]))} className="inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-brand-600 hover:border-brand-300"><Plus className="w-3.5 h-3.5" />{f.label}</button>
        ))}
        {OPTIONAL_FIN.every(f => extraFin.has(f.kind)) && <span className="text-[11px] text-gray-300">すべて表示中</span>}
      </div>

      {sec('referral', '他事業者紹介', null, (
        <p className="text-[12px] text-gray-400">紹介の要否はメモ欄に記録してください（不動産査定・税理士など。詳細は③オーダーシートの他事業者紹介で入力）。</p>
      ))}

      {/* 遺産分割 / 遺言 / 相続登記 / 解約等 / 信託契約ほか：エクセル面談シート〇（メモ欄のみ）。
          work_content キーはOS/実務タブと同一にして、面談で書いたメモが③受注内容以降の同名セクションと共有される。 */}
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
      {sec('trust_other', '信託契約 ほか手続き', null, (
        <p className="text-[12px] text-gray-400">信託契約・相続放棄・調停・遺言検認・成年後見・手紙・執行通知・契約書作成 の要否/内容をメモ欄に記録してください（③OSでは専用項目なし＝フリー欄のみ）。</p>
      ))}
    </div>
  )
}

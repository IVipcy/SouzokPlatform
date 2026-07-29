'use client'

// 統合入力アプリ ①面談シート。セクション構成＋各セクションの「＋メモ」でセクション別の手書きメモを展開。
// 項目は案件(caseData)に保存＝②面談結果登録・③オーダーシートへ自動で引き継がれる（同じ列を編集するため）。
// 手書きは meeting_memos に section キー付きで保存し、③でも参照できる（親でstate管理）。
import { useRef, useState, useEffect, useCallback, type PointerEvent as RPointerEvent } from 'react'
import { Eraser, Sparkles, Save, Trash2, Plus, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section, FieldGrid, InlineEdit, InlineDate } from '@/components/ui/InlineFields'
import { HEIR_RELATIONSHIPS } from '@/lib/constants'
import { InlineSelect } from '@/components/ui/InlineFields'
import OrderContentTab from '@/components/features/cases/OrderContentTab'
import { WorkContentField } from '@/components/features/cases/WorkContentField'
import type { CaseRow } from '@/types'
import type { MeetingMemoRow } from './IntakeCaseClient'

type Pt = { x: number; y: number }
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const BUCKET = 'meeting-memos'

// 縦に自由に広げられる手書きキャンバス（ペン・筆圧対応）。リサイズしても描画は保持。
function HandwriteCanvas({ onSave, saving }: { onSave: (dataUrl: string, text: string) => void; saving: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<Pt | null>(null)
  const [empty, setEmpty] = useState(true)
  const emptyRef = useRef(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // 実寸×DPRでビットマップを確保。リサイズ時は既存の描画を退避→再設定→再描画で保持。
  const setup = useCallback(() => {
    const c = canvasRef.current, wrap = wrapRef.current
    if (!c || !wrap) return
    const rect = wrap.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const prev = emptyRef.current ? null : c.toDataURL('image/png')
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2937'
    if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = prev }
  }, [])
  useEffect(() => {
    setup()
    const wrap = wrapRef.current; if (!wrap) return
    const ro = new ResizeObserver(() => setup())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [setup])

  const pos = (e: RPointerEvent<HTMLCanvasElement>): Pt => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => { drawing.current = true; last.current = pos(e); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ } }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !last.current) return
    const p = pos(e)
    ctx.lineWidth = 1 + (e.pressure ? e.pressure * 2.4 : 1.2)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; if (emptyRef.current) { emptyRef.current = false; setEmpty(false) }
  }
  const up = () => { drawing.current = false; last.current = null }
  const clear = () => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    if (ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore() }
    emptyRef.current = true; setEmpty(true); setText('')
  }
  const toText = async () => {
    const c = canvasRef.current; if (!c || empty) return
    setBusy(true)
    try {
      const res = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/png') }) })
      const j = (await res.json()) as { text?: string; error?: string }
      setText(res.ok ? (j.text || '（認識できませんでした）') : `__ERROR__${j.error ?? '認識に失敗しました'}`)
    } catch { setText('__ERROR__通信に失敗しました') } finally { setBusy(false) }
  }
  const doSave = () => { const c = canvasRef.current; if (!c || empty) return; onSave(c.toDataURL('image/png'), text && !text.startsWith('__ERROR__') ? text : ''); clear() }
  const isError = text.startsWith('__ERROR__')

  return (
    <div>
      {/* 縦にドラッグで拡大できるキャンバス枠（resize: vertical） */}
      <div ref={wrapRef} style={{ height: 200, minHeight: 120, resize: 'vertical', overflow: 'hidden' }} className="rounded-lg bg-white border border-dashed border-gray-300 relative">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }} className="cursor-crosshair"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-gray-300">↕ 下端をドラッグで拡大</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><Eraser className="w-3.5 h-3.5" />消す</button>
        <button type="button" onClick={toText} disabled={empty || busy} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Sparkles className="w-3.5 h-3.5" />{busy ? '認識中…' : 'テキスト化（AI）'}</button>
        <button type="button" onClick={doSave} disabled={empty || saving} className="ml-auto inline-flex items-center gap-1 text-[12px] px-3.5 py-1.5 rounded-lg text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40"><Save className="w-3.5 h-3.5" />{saving ? '保存中…' : 'このセクションに保存'}</button>
      </div>
      {text && (isError
        ? <p className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">テキスト化に失敗：{text.replace('__ERROR__', '')}</p>
        : <p className="mt-2 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 whitespace-pre-wrap">認識結果：{text}</p>)}
    </div>
  )
}

// セクション別の保存済みメモ一覧（画像＋テキスト）。署名付きURLで画像表示。
function SavedMemos({ memos, onDelete, readOnly }: { memos: MeetingMemoRow[]; onDelete: (m: MeetingMemoRow) => void; readOnly?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const supabase = createClient()
    const missing = memos.filter(m => m.image_path && !urls[m.id])
    if (missing.length === 0) return
    ;(async () => {
      const next: Record<string, string> = {}
      for (const m of missing) { const { data } = await supabase.storage.from(m.image_bucket || BUCKET).createSignedUrl(m.image_path!, 3600); if (data?.signedUrl) next[m.id] = data.signedUrl }
      if (Object.keys(next).length) setUrls(prev => ({ ...prev, ...next }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos])
  if (memos.length === 0) return null
  return (
    <div className="mt-2 space-y-2">
      {memos.map(m => (
        <div key={m.id} className="flex items-start gap-3 border border-gray-200 rounded-lg p-2 bg-white">
          {m.image_path && urls[m.id]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={urls[m.id]} alt="手書きメモ" className="h-16 rounded border border-gray-200 flex-none bg-white" />
            : <div className="h-16 w-24 rounded border border-gray-200 flex-none bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">画像</div>}
          <div className="flex-1 min-w-0">
            {m.ocr_text ? <p className="text-[12.5px] text-gray-800 whitespace-pre-wrap break-words">{m.ocr_text}</p> : <p className="text-[11.5px] text-gray-400">テキスト未変換（画像のみ）</p>}
          </div>
          {!readOnly && <button type="button" onClick={() => onDelete(m)} className="flex-none p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
        </div>
      ))}
    </div>
  )
}

// ③オーダーシートへ引き継ぐ、面談シートの手書きメモ（読み取り専用・セクション別）。
const SEC_LABEL: Record<string, string> = { client: '依頼者情報', order: '受注内容', deceased: '相続人調査', assets: '財産調査', referral: '他事業者紹介' }
export function MemoCarryOver({ memos }: { memos: MeetingMemoRow[] }) {
  if (memos.length === 0) return null
  const groups = [...new Set(memos.map(m => m.section || 'other'))]
  return (
    <div className="rounded-xl border border-[#D5E4FB] bg-[#F4F8FF] p-3.5 mb-3.5">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-[#378ADD]" strokeWidth={2} />
        <span className="text-[12.5px] font-semibold text-[#185FA5]">面談シートの手書きメモ（引き継ぎ）</span>
        <span className="text-[10px] text-[#7FA8D9] bg-[#E6F1FB] px-1.5 py-0.5 rounded">{memos.length}件</span>
      </div>
      <div className="space-y-2.5">
        {groups.map(g => (
          <div key={g}>
            <div className="text-[11px] font-semibold text-[#185FA5] mb-1">{SEC_LABEL[g] ?? 'メモ'}</div>
            <SavedMemos memos={memos.filter(m => (m.section || 'other') === g)} onDelete={() => {}} readOnly />
          </div>
        ))}
      </div>
    </div>
  )
}

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  currentMemberId: string | null
  memos: MeetingMemoRow[]
  setMemos: React.Dispatch<React.SetStateAction<MeetingMemoRow[]>>
}

type SecKey = 'client' | 'order' | 'deceased' | 'assets' | 'referral'

export default function MeetingSheetTab({ caseData, patchCase, patchClient, currentMemberId, memos, setMemos }: Props) {
  const [openMemo, setOpenMemo] = useState<Set<SecKey>>(new Set())
  const [saving, setSaving] = useState(false)
  const cl = caseData.clients

  const toggleMemo = (k: SecKey) => setOpenMemo(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const addMemo = async (section: SecKey, dataUrl: string, text: string) => {
    setSaving(true)
    const supabase = createClient()
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const path = `${caseData.id}/${uid()}.png`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: row, error } = await supabase.from('meeting_memos').insert({
        case_id: caseData.id, section, image_path: path, image_bucket: BUCKET, ocr_text: text || null,
        sort_order: memos.length, created_by: currentMemberId,
      }).select('*').single()
      if (error || !row) throw new Error(error?.message ?? '保存に失敗しました')
      setMemos(prev => [...prev, row as MeetingMemoRow])
      showToast('メモを保存しました', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error') } finally { setSaving(false) }
  }
  const delMemo = async (m: MeetingMemoRow) => {
    if (!confirm('このメモを削除しますか？')) return
    const supabase = createClient()
    if (m.image_path) await supabase.storage.from(m.image_bucket || BUCKET).remove([m.image_path])
    const { error } = await supabase.from('meeting_memos').delete().eq('id', m.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setMemos(prev => prev.filter(x => x.id !== m.id))
  }

  // セクションカード（青ヘッダー＋「＋メモ」＋項目）
  const SecCard = ({ sec, title, children }: { sec: SecKey; title: string; children: React.ReactNode }) => {
    const secMemos = memos.filter(m => m.section === sec)
    const open = openMemo.has(sec)
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1E3A8A]">
          <span className="text-[14px] font-bold text-white flex-1">{title}</span>
          {secMemos.length > 0 && <span className="text-[10px] text-white bg-white/25 rounded-full px-1.5 py-0.5">メモ{secMemos.length}</span>}
          <button type="button" onClick={() => toggleMemo(sec)} className={`inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1 rounded-md ${open ? 'bg-white text-[#1E4F9E]' : 'bg-white/20 text-white border border-white/40 hover:bg-white/30'}`}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />メモ
          </button>
        </div>
        {open && (
          <div className="px-4 pt-3 pb-1 bg-[#FBFCFE] border-b border-gray-100">
            <HandwriteCanvas onSave={(d, t) => addMemo(sec, d, t)} saving={saving} />
            <SavedMemos memos={secMemos} onDelete={delMemo} />
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-gray-500">面談中の要点を記録します。各項目は案件に保存され、②面談結果登録・③オーダーシートへ引き継がれます。各セクションの「＋メモ」で手書きメモを残せます（縦に広げられます）。</p>

      {/* 依頼者情報 */}
      <SecCard sec="client" title="依頼者情報">
        <FieldGrid>
          <InlineEdit label="氏名" value={cl?.name ?? null} onSave={v => patchClient({ name: v || null })} />
          <InlineEdit label="ふりがな" value={cl?.furigana ?? null} onSave={v => patchClient({ furigana: v || null })} />
          <InlineSelect label="続柄" value={cl?.relationship_to_deceased ?? null} options={[...HEIR_RELATIONSHIPS]} onSave={v => patchClient({ relationship_to_deceased: v || null })} />
          <InlineEdit label="携帯電話" value={cl?.mobile_phone ?? null} onSave={v => patchClient({ mobile_phone: v || null })} />
          <InlineEdit label="住所" value={cl?.address ?? null} onSave={v => patchClient({ address: v || null })} fullWidth />
        </FieldGrid>
      </SecCard>

      {/* 受注内容（受注区分・実施業務・その他）＝OrderContentTabを再利用（案件に保存＝③へ引き継ぎ） */}
      <SecCard sec="order" title="受注内容">
        <OrderContentTab caseData={caseData} patchCase={patchCase} orderSheetMode />
      </SecCard>

      {/* 相続人調査（要点） */}
      <SecCard sec="deceased" title="相続人調査（要点）">
        <FieldGrid>
          <InlineEdit label="被相続人氏名" value={caseData.deceased_name} onSave={v => patchCase({ deceased_name: v || null })} />
          <InlineEdit label="被相続人ふりがな" value={caseData.deceased_furigana} onSave={v => patchCase({ deceased_furigana: v || null })} />
          <InlineDate label="相続開始日（死亡日）" value={caseData.date_of_death} onSave={v => patchCase({ date_of_death: v || null })} />
        </FieldGrid>
        <div className="mt-2">
          <WorkContentField caseData={caseData} gyomu="deceased" patchCase={patchCase} label="相続関係・相続人メモ（フリー）" />
        </div>
      </SecCard>

      {/* 財産調査（要点） */}
      <SecCard sec="assets" title="財産調査（要点）">
        <WorkContentField caseData={caseData} gyomu="assets" patchCase={patchCase} label="財産の要点（不動産の所在地・金融機関・ざっくり評価額 等）" />
      </SecCard>

      {/* 他事業者紹介（要点） */}
      <SecCard sec="referral" title="他事業者紹介（要点）">
        <WorkContentField caseData={caseData} gyomu="referral" patchCase={patchCase} label="紹介の要点（不動産査定・税理士 等）" />
      </SecCard>
    </div>
  )
}

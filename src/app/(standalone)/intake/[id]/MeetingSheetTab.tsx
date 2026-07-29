'use client'

// 統合入力アプリ ①面談シート。手書きメモを大きく取り、案件に紐づけて保存（画像=Storage / テキスト=DB）。
// 旧 /meeting-sheet 仮版(localStorage)を DB 化。デザインはオーダーシートに寄せた青カード。
import { useRef, useState, useEffect, useCallback, type PointerEvent as RPointerEvent } from 'react'
import { Eraser, Sparkles, Save, Trash2, PencilLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { MeetingMemoRow } from './IntakeCaseClient'

type Pt = { x: number; y: number }
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const BUCKET = 'meeting-memos'

// 大きな手書きキャンバス（ペン・筆圧対応）。保存でPNG化、テキスト化は /api/ocr（Claude vision）。
function HandwriteCanvas({ onSave, saving }: { onSave: (dataUrl: string, text: string) => void; saving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<Pt | null>(null)
  const readyRef = useRef(false)
  const [empty, setEmpty] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const HEIGHT = 340

  const setup = useCallback(() => {
    const c = canvasRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    if (rect.width < 1) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(HEIGHT * dpr)
    const ctx = c.getContext('2d')
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2937' }
    readyRef.current = true
  }, [])
  useEffect(() => {
    setup()
    const onResize = () => { if (empty) { readyRef.current = false; setup() } }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setup, empty])

  const pos = (e: RPointerEvent<HTMLCanvasElement>): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!readyRef.current) setup()
    drawing.current = true; last.current = pos(e)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !last.current) return
    const p = pos(e)
    ctx.lineWidth = 1 + (e.pressure ? e.pressure * 2.4 : 1.2)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; setEmpty(false)
  }
  const up = () => { drawing.current = false; last.current = null }
  const clear = () => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    if (ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore() }
    setEmpty(true); setText('')
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
  const doSave = () => {
    const c = canvasRef.current; if (!c || empty) return
    onSave(c.toDataURL('image/png'), text && !text.startsWith('__ERROR__') ? text : '')
    clear()
  }
  const isError = text.startsWith('__ERROR__')

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-[#1E3A8A] px-4 py-2.5 flex items-center gap-2">
        <PencilLine className="w-4 h-4 text-white" strokeWidth={2} />
        <span className="text-[14px] font-bold text-white">手書きメモ</span>
        <span className="text-[10px] text-white/80">ペン・指で書けます（筆圧対応）</span>
      </div>
      <div className="p-3.5">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: HEIGHT, touchAction: 'none' }}
          className="rounded-lg bg-white border border-dashed border-gray-300 cursor-crosshair block"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><Eraser className="w-3.5 h-3.5" />消す</button>
          <button type="button" onClick={toText} disabled={empty || busy} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Sparkles className="w-3.5 h-3.5" />{busy ? '認識中…' : 'テキスト化（AI）'}</button>
          <button type="button" onClick={doSave} disabled={empty || saving} className="ml-auto inline-flex items-center gap-1 text-[12px] px-3.5 py-1.5 rounded-lg text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40"><Save className="w-3.5 h-3.5" />{saving ? '保存中…' : '保存'}</button>
        </div>
        {text && (isError
          ? <p className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">テキスト化に失敗：{text.replace('__ERROR__', '')}</p>
          : <p className="mt-2 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 whitespace-pre-wrap">認識結果：{text}</p>)}
      </div>
    </div>
  )
}

type Props = { caseId: string; currentMemberId: string | null; initialMemos: MeetingMemoRow[] }

export default function MeetingSheetTab({ caseId, currentMemberId, initialMemos }: Props) {
  const [memos, setMemos] = useState<MeetingMemoRow[]>(initialMemos)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // 保存済みメモの画像に署名付きURLを付与（バケットは非公開）
  useEffect(() => {
    const supabase = createClient()
    const missing = memos.filter(m => m.image_path && !urls[m.id])
    if (missing.length === 0) return
    ;(async () => {
      const next: Record<string, string> = {}
      for (const m of missing) {
        const { data } = await supabase.storage.from(m.image_bucket || BUCKET).createSignedUrl(m.image_path!, 3600)
        if (data?.signedUrl) next[m.id] = data.signedUrl
      }
      if (Object.keys(next).length) setUrls(prev => ({ ...prev, ...next }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos])

  const handleSave = async (dataUrl: string, text: string) => {
    setSaving(true)
    const supabase = createClient()
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const path = `${caseId}/${uid()}.png`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: row, error } = await supabase.from('meeting_memos').insert({
        case_id: caseId, image_path: path, image_bucket: BUCKET, ocr_text: text || null,
        sort_order: memos.length, created_by: currentMemberId,
      }).select('*').single()
      if (error || !row) throw new Error(error?.message ?? '保存に失敗しました')
      setMemos(prev => [...prev, row as MeetingMemoRow])
      showToast('メモを保存しました', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error')
    } finally { setSaving(false) }
  }

  const handleDelete = async (m: MeetingMemoRow) => {
    if (!confirm('このメモを削除しますか？')) return
    const supabase = createClient()
    if (m.image_path) await supabase.storage.from(m.image_bucket || BUCKET).remove([m.image_path])
    const { error } = await supabase.from('meeting_memos').delete().eq('id', m.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setMemos(prev => prev.filter(x => x.id !== m.id))
  }

  return (
    <div className="space-y-3.5">
      <p className="text-[12px] text-gray-500">面談中の要点を手書きで記録します。「保存」で案件に紐づけて保存され、②面談結果登録・③オーダーシートへ引き継ぐ材料になります。</p>
      <HandwriteCanvas onSave={handleSave} saving={saving} />

      {memos.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <span className="inline-block w-1 h-4 bg-brand-600 rounded-full" />
            <h3 className="text-[14px] font-bold text-gray-900">保存済みメモ</h3>
            <span className="text-[12px] text-gray-400 font-mono">{memos.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {memos.map(m => (
              <div key={m.id} className="flex items-start gap-3 border border-gray-200 rounded-lg p-2.5">
                {m.image_path && urls[m.id]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={urls[m.id]} alt="手書きメモ" className="h-20 rounded border border-gray-200 flex-none bg-white" />
                  : <div className="h-20 w-28 rounded border border-gray-200 flex-none bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">画像</div>}
                <div className="flex-1 min-w-0">
                  {m.ocr_text ? <p className="text-[13px] text-gray-800 whitespace-pre-wrap break-words">{m.ocr_text}</p> : <p className="text-[12px] text-gray-400">テキスト未変換（画像のみ）</p>}
                  <p className="text-[10.5px] text-gray-400 mt-1 font-mono">{(m.created_at ?? '').slice(0, 16).replace('T', ' ')}</p>
                </div>
                <button type="button" onClick={() => handleDelete(m)} className="flex-none p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

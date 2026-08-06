'use client'

// 統合入力アプリ「白紙メモ」タブ。
// ・見出しだけを薄く印字した 1枚の長い白紙に自由に手書きする（項目欄は出さない）。
// ・見出しはシステムが描いているので帯（セクション）の境界Y座標が既知。
//   保存/テキスト化のときはその座標で画像を切り分けるため、「どのセクションの書き込みか」を
//   AIに推測させる必要がない（＝仕分けは機械的に確定する）。
// ・帯ごとに /api/ocr でテキスト化 → 各セクションのフリー欄(work_content)へ転記。
//   フリー欄はそのまま編集できるので、誤認識はここで直してから「AIで項目に反映」を押す。
// ・原本は1枚だけ meeting_memos に保存（section='whiteboard'）。帯境界は meta に持たせ、
//   ビューアでのセクションジャンプに使う。

import { useRef, useState, useEffect, useCallback, type PointerEvent as RPointerEvent } from 'react'
import { Pen, Highlighter, Eraser, Trash2, Sparkles, Save, Plus, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { createRunExtract, SEC_LABEL, WB_ORDER, isExtractable } from './MeetingSheetTab'
import type { CaseRow } from '@/types'
import type { MeetingMemoRow, MemoBand } from './IntakeCaseClient'

type Pt = { x: number; y: number }
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const BUCKET = 'meeting-memos'
const WB_SECTION = 'whiteboard'

const SECTIONS = WB_ORDER.map(k => ({ key: k as string, label: SEC_LABEL[k] }))

// 各帯の上部にうっすら出す「このセクションで書いてほしい項目」。
// 中身は「AIで項目に反映」で実際に拾える項目に合わせてあるので、このとおり書けばそのまま反映される。
// 見出しと同じくHTMLで重ねているだけなので、OCRに送る画像にも保存する原本にも写らない。
const SECTION_HINT: Record<string, string> = {
  clientInfo: '氏名／ふりがな／続柄／TEL／住所／振込名義人（カナ）',
  order: '契約形態／提案した手続き／概算報酬／依頼者の反応',
  deceased: '被相続人の 氏名／ふりがな／生年月日／死亡日／住所／本籍　　相続人（氏名・続柄）',
  assets_re: '物件種別／所在地／評価額',
  assets_deposit: '金融機関名／支店／残高',
  assets_securities: '証券会社名／銘柄・評価額',
  assets_trust: '信託銀行名',
  assets_insurance: '保険会社名／受取人／金額',
  referral: '紹介先／紹介内容／依頼者の反応',
}
const BAND_H = 380        // 帯1つの既定の高さ（≒スマホ1画面ぶん）
const BAND_STEP = 260     // 「広げる」1回で増える高さ

type Tool = 'pen' | 'marker' | 'eraser'
type Size = 'S' | 'M' | 'L'
// 太さ（CSSピクセル）。ペンは筆圧で ±する基準値。
const PEN_W: Record<Size, number> = { S: 1.4, M: 2.4, L: 4.2 }
const MARKER_W: Record<Size, number> = { S: 10, M: 16, L: 26 }
const ERASER_W: Record<Size, number> = { S: 14, M: 26, L: 44 }
const SIZE_LABEL: Record<Size, string> = { S: '小', M: '中', L: '大' }

/**
 * カーソル。消しゴム・蛍光ペンは「実際に効く範囲」をそのまま円で見せる（＝今どのモードで、
 * どのくらいの太さかが一目でわかる）。ペンは細いので精度優先で十字のまま。
 */
function cursorFor(tool: Tool, size: Size): string {
  if (tool === 'pen') return 'crosshair'
  const w = tool === 'eraser' ? ERASER_W[size] : MARKER_W[size]
  const d = Math.ceil(w) + 4
  const c = d / 2
  const fill = tool === 'eraser' ? 'rgba(255,255,255,0.8)' : 'rgba(250,204,21,0.3)'
  const stroke = tool === 'eraser' ? '#374151' : '#ca8a04'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${c}" cy="${c}" r="${w / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(c)} ${Math.round(c)}, auto`
}

/** 同時実行数を絞って順に処理（OCRを9本同時に投げないため） */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    while (q.length) { const it = q.shift(); if (it !== undefined) await fn(it) }
  }))
}

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  ensureCaseId?: () => Promise<string>
  currentMemberId: string | null
  memos: MeetingMemoRow[]
  setMemos: React.Dispatch<React.SetStateAction<MeetingMemoRow[]>>
  onRefresh?: () => void
  onOpenViewer?: () => void
}

export default function WhiteboardTab({
  caseData, patchCase, patchClient, ensureCaseId, currentMemberId, memos, setMemos, onRefresh, onOpenViewer,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<Pt | null>(null)
  const dprRef = useRef(1)
  const cssWRef = useRef(0)

  const [heights, setHeights] = useState<number[]>(() => SECTIONS.map(() => BAND_H))
  const [mode, setMode] = useState<Tool>('pen')
  const modeRef = useRef(mode); modeRef.current = mode
  const [size, setSize] = useState<Size>('M')
  const sizeRef = useRef(size); sizeRef.current = size
  const [busy, setBusy] = useState<'' | 'ocr' | 'save' | 'extract'>('')
  const [dirty, setDirty] = useState(false)   // 一度でも書いたか
  const dirtyRef = useRef(false)

  // フリー欄（work_content）。テキスト化の結果はここに入り、ここで直せる。
  const wc = (caseData.work_content ?? {}) as Record<string, string>
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}; for (const s of SECTIONS) o[s.key] = wc[s.key] ?? ''; return o
  })
  const [aiDone, setAiDone] = useState<Set<string>>(new Set())

  const tops = heights.reduce<number[]>((acc, h, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + heights[i - 1]); return acc }, [])
  const totalH = heights.reduce((a, b) => a + b, 0)

  // ── セクションジャンプ ──────────────────────────────
  // 白紙は縦に長いので、面談の話題が飛んだときに目的のセクションへ即移動できるようにする。
  // 帯のY座標は既知なので、キャンバス上端 + tops[i] へスクロールするだけでよい。
  const STICKY_OFFSET = 76      // 上部の固定ツールバーぶん
  const topsRef = useRef<number[]>([])
  topsRef.current = tops
  const [activeBand, setActiveBand] = useState(0)

  const jumpTo = (i: number) => {
    const wrap = wrapRef.current; if (!wrap) return
    const y = wrap.getBoundingClientRect().top + window.scrollY + tops[i] - STICKY_OFFSET
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }

  // スクロール位置から現在地セクションを判定（ナビのハイライト用）
  useEffect(() => {
    const onScroll = () => {
      const wrap = wrapRef.current; if (!wrap) return
      const rel = STICKY_OFFSET + 24 - wrap.getBoundingClientRect().top
      const t = topsRef.current
      let idx = 0
      for (let i = 0; i < t.length; i++) if (rel >= t[i]) idx = i
      setActiveBand(idx)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── キャンバス初期化（幅・総高さの変化に追従。既存の描画は等倍で貼り戻す） ──
  const setup = useCallback(() => {
    const c = canvasRef.current, wrap = wrapRef.current; if (!c || !wrap) return
    const rect = wrap.getBoundingClientRect(); if (rect.width < 1) return
    const prev = dirtyRef.current ? c.toDataURL('image/png') : null
    const prevW = c.width, prevH = c.height
    // 端末のDPRを使いつつ、極端に縦長でも破綻しないよう内部解像度に上限を設ける
    const raw = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    const dpr = Math.max(1, Math.min(raw, 2, 8000 / Math.max(1, totalH)))
    dprRef.current = dpr; cssWRef.current = rect.width
    c.width = Math.round(rect.width * dpr); c.height = Math.round(totalH * dpr)
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (prev) {
      const img = new Image()
      img.onload = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(img, 0, 0, prevW, prevH); ctx.restore() }
      img.src = prev
    }
  }, [totalH])
  useEffect(() => { setup() }, [setup])
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return
    const ro = new ResizeObserver(() => setup()); ro.observe(wrap); return () => ro.disconnect()
  }, [setup])

  // ── 描画 ──
  const setDrawingActive = (active: boolean) => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('is-handwriting-active', active)
  }
  const pos = (e: RPointerEvent<HTMLCanvasElement>): Pt => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => { drawing.current = true; setDrawingActive(true); last.current = pos(e); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ } }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !last.current) return
    const p = pos(e); const m = modeRef.current
    const sz = sizeRef.current
    if (m === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = ERASER_W[sz] }
    else if (m === 'marker') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(250,204,21,0.4)'; ctx.lineWidth = MARKER_W[sz] }
    else {
      // ペンは選んだ太さを基準に筆圧で増減（筆圧なしのマウス等は基準値そのまま）
      const b = PEN_W[sz]
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = e.pressure ? b * (0.5 + e.pressure) : b
    }
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    last.current = p
    if (!dirtyRef.current && m !== 'eraser') { dirtyRef.current = true; setDirty(true) }
  }
  const up = () => { drawing.current = false; setDrawingActive(false); last.current = null }
  const clearAll = () => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore()
    dirtyRef.current = false; setDirty(false)
  }

  // ── 帯の切り出し ──
  /** 帯iに書き込みがあるか（アルファ値を間引いて走査） */
  const bandEmpty = (i: number): boolean => {
    const c = canvasRef.current; if (!c) return true
    const ctx = c.getContext('2d'); if (!ctx) return true
    const dpr = dprRef.current
    const y0 = Math.round(tops[i] * dpr), h = Math.round(heights[i] * dpr)
    if (h <= 0 || y0 + h > c.height) return true
    try {
      const d = ctx.getImageData(0, y0, c.width, h).data
      for (let p = 3; p < d.length; p += 4 * 8) if (d[p] > 8) return false
      return true
    } catch { return false }
  }
  /** 帯iを白背景のPNG(dataURL)として切り出す */
  const bandDataUrl = (i: number): string | null => {
    const c = canvasRef.current; if (!c) return null
    const dpr = dprRef.current
    const y0 = Math.round(tops[i] * dpr), h = Math.round(heights[i] * dpr)
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = h
    const tctx = tmp.getContext('2d'); if (!tctx) return null
    tctx.fillStyle = '#ffffff'; tctx.fillRect(0, 0, tmp.width, tmp.height)
    tctx.drawImage(c, 0, y0, c.width, h, 0, 0, c.width, h)
    return tmp.toDataURL('image/png')
  }

  // ── ① テキスト化（帯ごとにOCR → 各セクションのフリー欄へ） ──
  const runOcr = async () => {
    const targets = SECTIONS.map((s, i) => ({ s, i })).filter(({ i }) => !bandEmpty(i))
    if (targets.length === 0) { showToast('白紙に書き込みがありません', 'error'); return }
    setBusy('ocr')
    const got: Record<string, string> = {}
    try {
      await pool(targets, 3, async ({ s, i }) => {
        const image = bandDataUrl(i); if (!image) return
        try {
          const res = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) })
          const j = (await res.json()) as { text?: string; error?: string }
          if (res.ok && j.text) got[s.key] = j.text.trim()
        } catch { /* 個別失敗は握りつぶし、最後に件数で知らせる */ }
      })
      const keys = Object.keys(got)
      if (keys.length === 0) { showToast('文字を認識できませんでした', 'error'); return }
      // フリー欄へ追記（既存の内容は消さない）。work_content は1回にまとめてパッチする。
      const next = { ...texts }
      for (const k of keys) next[k] = next[k] ? `${next[k]}\n${got[k]}` : got[k]
      setTexts(next)
      const merged: Record<string, string | null> = { ...wc }
      for (const k of keys) merged[k] = next[k] || null
      await patchCase({ work_content: merged } as unknown as Partial<CaseRow>)
      showToast(`${keys.length}セクションをテキスト化しました。内容を確認・修正してからAI反映してください。`, 'success')
    } finally { setBusy('') }
  }

  // ── ② AIで項目に反映 ──
  const runExtract = createRunExtract({
    patchCase, patchClient, caseId: caseData.id, ensureCaseId, onRefresh, silent: true,
  })
  const extractOne = async (sec: string) => {
    const text = texts[sec]?.trim(); if (!text) { showToast('このセクションのメモが空です', 'error'); return }
    setBusy('extract')
    try {
      const r = await runExtract(sec)({ text })
      if (r.filled === 0 && r.added === 0) { showToast('反映できる項目が読み取れませんでした', 'error'); return }
      setAiDone(prev => new Set([...prev, sec]))
      showToast(`${SEC_LABEL[sec]}：${[r.filled ? `${r.filled}項目を反映` : '', r.added ? `${r.added}件を追加` : ''].filter(Boolean).join('・')}しました`, 'success')
    } finally { setBusy('') }
  }
  const extractAll = async () => {
    const secs = SECTIONS.filter(s => isExtractable(s.key) && texts[s.key]?.trim())
    if (secs.length === 0) { showToast('反映できるメモがありません', 'error'); return }
    setBusy('extract')
    let filled = 0, added = 0
    const done: string[] = []
    try {
      for (const s of secs) {
        const r = await runExtract(s.key)({ text: texts[s.key].trim() })
        filled += r.filled; added += r.added
        if (r.filled || r.added) done.push(s.key)
      }
      if (filled === 0 && added === 0) { showToast('反映できる項目が読み取れませんでした', 'error'); return }
      setAiDone(prev => new Set([...prev, ...done]))
      showToast(`${[filled ? `${filled}項目を反映` : '', added ? `${added}件を追加` : ''].filter(Boolean).join('・')}しました。青文字の項目はAIが入力しています。中身を見直してください。`, 'success')
    } finally { setBusy('') }
  }

  // ── ③ 原本を1枚だけ保存（見出し・区切り線を焼き込む） ──
  const composite = (): string | null => {
    const c = canvasRef.current; if (!c) return null
    const out = document.createElement('canvas'); out.width = c.width; out.height = c.height
    const ctx = out.getContext('2d'); if (!ctx) return null
    const dpr = dprRef.current, cssW = cssWRef.current
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textBaseline = 'top'
    SECTIONS.forEach((s, i) => {
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, tops[i] + 0.5); ctx.lineTo(cssW, tops[i] + 0.5); ctx.stroke()
      ctx.fillStyle = '#9ca3af'; ctx.fillText(s.label, 10, tops[i] + 7)
    })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(c, 0, 0)
    return out.toDataURL('image/png')
  }
  const saveImage = async () => {
    const dataUrl = composite(); if (!dataUrl) return
    setBusy('save')
    const supabase = createClient()
    try {
      const cid = ensureCaseId ? await ensureCaseId() : caseData.id
      const blob = await (await fetch(dataUrl)).blob()
      const path = `${cid}/${uid()}.png`
      const { error: up } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false })
      if (up) throw new Error(up.message)
      const bands: MemoBand[] = SECTIONS.map((s, i) => ({ key: s.key, label: s.label, y0: tops[i], y1: tops[i] + heights[i] }))
      const meta = { w: cssWRef.current, h: totalH, bands }
      // 白紙メモは面談回数ぶん増える想定なので上書きしない（並びは sort_order）。
      const sort = memos.filter(m => m.section === WB_SECTION).length
      const { data: row, error } = await supabase.from('meeting_memos')
        .insert({ case_id: cid, section: WB_SECTION, image_path: path, image_bucket: BUCKET, sort_order: sort, created_by: currentMemberId, meta })
        .select('*').single()
      if (error || !row) throw new Error(error?.message ?? '保存に失敗')
      setMemos(prev => [...prev, row as MeetingMemoRow])
      showToast('白紙メモの原本を保存しました', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : '保存に失敗', 'error') } finally { setBusy('') }
  }

  const saveText = (sec: string, v: string) => {
    setTexts(prev => ({ ...prev, [sec]: v }))
  }
  const commitText = (sec: string, v: string) => patchCase({ work_content: { ...wc, [sec]: v || null } } as unknown as Partial<CaseRow>)

  const wbCount = memos.filter(m => m.section === WB_SECTION).length

  return (
    <div className="space-y-3">
      {/* 道具 */}
      <div className="flex flex-wrap items-center gap-2 sticky top-0 z-20 bg-white/95 backdrop-blur py-2 -mx-1 px-1 border-b border-gray-100">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {([['pen', 'ペン', Pen], ['marker', '蛍光', Highlighter], ['eraser', '消しゴム', Eraser]] as const).map(([k, label, Icon], i) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={`inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] ${i > 0 ? 'border-l border-gray-200' : ''} ${mode === k ? (k === 'marker' ? 'bg-amber-100 text-amber-800' : 'bg-brand-600 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
        {/* 太さ（選択中の道具に効く）。丸の大きさで実際の太さがわかるようにする。 */}
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {(['S', 'M', 'L'] as const).map((sz, i) => {
            const dot = mode === 'pen' ? Math.max(3, PEN_W[sz] * 1.8) : (mode === 'marker' ? MARKER_W[sz] : ERASER_W[sz]) * 0.42
            return (
              <button key={sz} type="button" onClick={() => setSize(sz)} title={`太さ：${SIZE_LABEL[sz]}`}
                className={`inline-flex items-center gap-1.5 text-[13px] px-2.5 py-2 min-h-[40px] ${i > 0 ? 'border-l border-gray-200' : ''} ${size === sz ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <span className="rounded-full bg-current inline-block" style={{ width: dot, height: dot }} />
                {SIZE_LABEL[sz]}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><Trash2 className="w-4 h-4" />全消去</button>
        <button type="button" onClick={runOcr} disabled={!dirty || !!busy}
          className="inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold">1</span>
          <Sparkles className="w-4 h-4" />{busy === 'ocr' ? '認識中…' : 'テキスト化'}
        </button>
        {wbCount > 0 && onOpenViewer && (
          <button type="button" onClick={onOpenViewer}
            className="ml-auto inline-flex items-center gap-1 text-[13px] px-3 py-2 min-h-[40px] rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
            <FileText className="w-4 h-4" />保存済みの原本（{wbCount}）
          </button>
        )}
        <button type="button" onClick={saveImage} disabled={!dirty || !!busy}
          className={`inline-flex items-center gap-1 text-[13px] px-3.5 py-2 min-h-[40px] rounded-lg text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 ${wbCount > 0 && onOpenViewer ? '' : 'ml-auto'}`}>
          <Save className="w-4 h-4" />{busy === 'save' ? '保存中…' : '原本を保存'}
        </button>
      </div>

      {/* スマホ/タブレット：セクションチップ（横スクロール）。PCでは左のナビを使う。 */}
      <div className="lg:hidden sticky top-[58px] z-10 bg-white/95 backdrop-blur -mx-1 px-1 py-1.5 border-b border-gray-100 overflow-x-auto">
        <div className="flex gap-1.5 w-max">
          {SECTIONS.map((s, i) => (
            <button key={s.key} type="button" onClick={() => jumpTo(i)}
              className={`text-[11.5px] px-2.5 py-1.5 rounded-full border whitespace-nowrap transition-colors ${activeBand === i ? 'bg-brand-600 text-white border-brand-600 font-bold' : 'bg-white text-gray-600 border-gray-200'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:flex lg:gap-4 lg:items-start">
        {/* PC左ナビ：追従・クリックでジャンプ・現在地ハイライト（オーダーシートPCの左ガイドと同じ考え方） */}
        <nav className="hidden lg:block lg:w-36 lg:flex-shrink-0 lg:sticky lg:top-[76px] self-start">
          <div className="text-[11px] text-gray-400 px-2.5 mb-1.5">セクション</div>
          <div className="flex flex-col gap-0.5">
            {SECTIONS.map((s, i) => (
              <button key={s.key} type="button" onClick={() => jumpTo(i)}
                className={`text-left text-[12px] leading-snug px-2.5 py-2 rounded-lg transition-colors ${activeBand === i ? 'bg-brand-50 text-brand-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* 白紙（1枚の長いキャンバス／見出しはHTMLで重ねる＝OCRに見出し文字が混ざらない） */}
        <div className="flex-1 min-w-0">
          <div ref={wrapRef} className="relative rounded-lg border border-gray-200 bg-white overflow-hidden" style={{ height: totalH }}>
            <canvas ref={canvasRef}
              style={{ width: '100%', height: totalH, touchAction: 'none', display: 'block', cursor: cursorFor(mode, size) }}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
            {SECTIONS.map((s, i) => (
              <div key={s.key} className="absolute left-0 right-0 pointer-events-none" style={{ top: tops[i], height: heights[i] }}>
                <div className="border-t border-gray-200" />
                <div className="flex items-center justify-between px-2.5 pt-1">
                  <span className="text-[11px] tracking-wide text-gray-400 select-none">{s.label}</span>
                  <button type="button" onClick={() => setHeights(prev => prev.map((h, k) => k === i ? h + BAND_STEP : h))}
                    className="pointer-events-auto inline-flex items-center gap-0.5 text-[10.5px] text-gray-300 hover:text-brand-600 px-1.5 py-0.5 rounded">
                    <Plus className="w-3 h-3" />広げる
                  </button>
                </div>
                {/* 書いてほしい項目（極薄）。上から手書きしても読み取りの邪魔にならない濃さにする。 */}
                {SECTION_HINT[s.key] && (
                  <div className="px-2.5 pt-0.5 text-[10.5px] leading-snug text-gray-200 select-none">{SECTION_HINT[s.key]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* テキスト化の結果＝各セクションのフリー欄（ここで直してからAI反映） */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1E3A8A]">
          <span className="text-[14px] font-bold text-white flex-1">テキスト化の結果（フリー欄）</span>
          <button type="button" onClick={extractAll} disabled={!!busy}
            className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 disabled:opacity-40">
            <Sparkles className="w-3.5 h-3.5" />{busy === 'extract' ? '反映中…' : 'まとめて項目に反映'}
          </button>
        </div>
        <div className="p-3 space-y-2.5">
          {SECTIONS.map(s => (
            <div key={s.key}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px] font-semibold text-gray-700">{s.label}</span>
                {aiDone.has(s.key) && <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5">反映済</span>}
                {!isExtractable(s.key) && <span className="text-[10px] text-gray-400">メモのみ</span>}
                {isExtractable(s.key) && (
                  <button type="button" onClick={() => extractOne(s.key)} disabled={!texts[s.key]?.trim() || !!busy}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                    <Sparkles className="w-3 h-3" />このセクションを反映
                  </button>
                )}
              </div>
              <textarea
                value={texts[s.key] ?? ''}
                onChange={e => saveText(s.key, e.target.value)}
                onBlur={e => commitText(s.key, e.target.value)}
                rows={2}
                placeholder="（このセクションのメモ）"
                className="w-full text-[13px] rounded-lg border border-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

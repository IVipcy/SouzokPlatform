'use client'

// 面談シート（仮版）。面談時にタブレット/PC＋ペンで入力する想定の試作。
// ・DB連携なし。手書きメモの画像はブラウザの localStorage に保持（リロードしても残る／その端末内のみ）。
// ・3タブ：面談シート / オーダーシート / メモ。
//   - 面談シート＝オーダーシート構成のまま、相続人一覧・受注内容・財産情報だけ開き他は閉じる。各セクションに埋め込みメモ(A)。
//   - オーダーシート＝全開。面談シートから「切り替え」で一方向遷移（戻れない）。
//   - メモ＝各セクション名だけの白紙キャンバス(B)。
// ・手書き→テキスト化は Handwriting Recognition API（Chromeのオンデバイス手書き認識・日本語）。未対応環境ではその旨を表示。

import { useRef, useState, useEffect, useCallback, type PointerEvent as RPointerEvent } from 'react'
import {
  ClipboardList, FileSpreadsheet, PencilLine, ChevronDown, Plus, ArrowRight,
  Lock, Eraser, Save, Type, Users, Check, X,
} from 'lucide-react'

type Field = { label: string; wide?: boolean }
type Section = { key: string; title: string; openInSheet: boolean; pills?: string[]; fields: Field[] }
type MemoItem = { id: string; image: string; text: string }
type Pt = { x: number; y: number; t: number }

const STORE_KEY = 'meeting-sheet-memos-v1'
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))

// オーダーシートのセクション構成を踏襲（仮の項目）。openInSheet=面談シートで初期展開。
const SECTIONS: Section[] = [
  { key: 'client', title: '依頼者情報', openInSheet: false, fields: [
    { label: '氏名' }, { label: 'ふりがな' }, { label: '続柄' }, { label: '生年月日' }, { label: '携帯' }, { label: '住所', wide: true },
  ] },
  { key: 'heirs', title: '相続人一覧', openInSheet: true, fields: [
    { label: '相続人（氏名）' }, { label: '続柄' }, { label: '生年月日' }, { label: '連絡先' }, { label: '備考', wide: true },
  ] },
  { key: 'order', title: '受注内容', openInSheet: true, pills: ['手続き一式', '遺産承継', '相続登記', '遺言', '解約'], fields: [
    { label: '提案金額' }, { label: '契約形態' }, { label: 'ヒアリング要点', wide: true },
  ] },
  { key: 'assets', title: '財産情報', openInSheet: true, fields: [
    { label: '不動産の所在地' }, { label: 'ざっくり評価額' }, { label: '金融機関名' }, { label: '口座の種類' }, { label: 'その他財産', wide: true },
  ] },
  { key: 'registration', title: '相続登記', openInSheet: false, fields: [
    { label: '対象物件' }, { label: '登記の種類' },
  ] },
  { key: 'division', title: '遺産分割・遺言', openInSheet: false, fields: [
    { label: '分割の方針' }, { label: '遺言の有無' },
  ] },
  { key: 'mailing', title: '郵送・書類設定', openInSheet: false, fields: [
    { label: '顧客郵送先' }, { label: '書類の受け取り方法' },
  ] },
]

// Handwriting Recognition API（Chrome オンデバイス）でストローク→テキスト。未対応なら null。
async function ocrStrokes(strokes: Pt[][]): Promise<string | null> {
  const nav = navigator as unknown as {
    createHandwritingRecognizer?: (c: unknown) => Promise<{
      startDrawing: (h: unknown) => { addStroke: (s: unknown) => void; getPrediction: () => Promise<Array<{ text: string }>> }
      finish?: () => void
    }>
  }
  if (typeof nav.createHandwritingRecognizer !== 'function') return null
  try {
    const recognizer = await nav.createHandwritingRecognizer({ languages: ['ja'] })
    const drawing = recognizer.startDrawing({ recognitionType: 'text' })
    for (const s of strokes) if (s.length) drawing.addStroke({ points: s })
    const preds = await drawing.getPrediction()
    try { recognizer.finish?.() } catch { /* noop */ }
    return preds?.[0]?.text ?? ''
  } catch {
    return null
  }
}

// 手書きキャンバス。ペン（pointer・筆圧対応）で描画→ストローク記録。保存で画像化、テキスト化でOCR。
function HandwriteCanvas({ hwSupported, onSave, height = 160 }: { hwSupported: boolean | null; onSave: (image: string, text: string) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<Pt | null>(null)
  const strokes = useRef<Pt[][]>([])
  const [empty, setEmpty] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // 実寸×DPRでビットマップを確保し、以降はCSS座標で描画（setTransformでDPR分だけ拡大）。
  const readyRef = useRef(false)
  const setup = useCallback(() => {
    const c = canvasRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    if (rect.width < 1) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2937' }
    readyRef.current = true
  }, [height])
  useEffect(() => {
    setup()
    const onResize = () => { if (strokes.current.length === 0) { readyRef.current = false; setup() } }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setup])

  const pos = (e: RPointerEvent<HTMLCanvasElement>): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: Math.round(e.timeStamp) }
  }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!readyRef.current) setup()
    drawing.current = true
    const p = pos(e); last.current = p; strokes.current.push([p])
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !last.current) return
    const p = pos(e)
    ctx.lineWidth = 1 + (e.pressure ? e.pressure * 2.4 : 1.2)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; strokes.current[strokes.current.length - 1]?.push(p); setEmpty(false)
  }
  const up = () => { drawing.current = false; last.current = null }
  const clear = () => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    if (ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore() }
    strokes.current = []; setEmpty(true); setText('')
  }
  const toText = async () => {
    if (empty) return
    setBusy(true)
    const r = await ocrStrokes(strokes.current)
    setBusy(false)
    if (r === null) setText('__UNSUPPORTED__')
    else setText(r || '（認識できませんでした）')
  }
  const save = () => {
    const c = canvasRef.current; if (!c || empty) return
    onSave(c.toDataURL('image/png'), text && text !== '__UNSUPPORTED__' ? text : '')
    clear()
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, touchAction: 'none' }}
        className="rounded-md bg-white border border-dashed border-gray-300 cursor-crosshair block"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      />
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><Eraser className="w-3.5 h-3.5" />消す</button>
        <button type="button" onClick={toText} disabled={empty || busy} className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Type className="w-3.5 h-3.5" />{busy ? '認識中…' : 'テキスト化'}</button>
        <button type="button" onClick={save} disabled={empty} className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border border-brand-300 bg-white text-brand-700 hover:bg-brand-50 disabled:opacity-40"><Save className="w-3.5 h-3.5" />このセクションに保存</button>
        {hwSupported === false && <span className="text-[10.5px] text-gray-400">※この端末は手書き認識に未対応</span>}
      </div>
      {text === '__UNSUPPORTED__'
        ? <p className="mt-1.5 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">この端末/ブラウザは手書き認識(OCR)に未対応です。画像として保存はできます。</p>
        : text && <p className="mt-1.5 text-[12.5px] text-gray-800 bg-white border border-gray-200 rounded px-2 py-1.5">認識結果：{text}</p>}
    </div>
  )
}

// セクションの手書きメモ：キャンバス＋保存済みメモ（画像＋テキスト）の一覧。
function SectionMemo({ hwSupported, items, onAdd, onDelete }: {
  hwSupported: boolean | null; items: MemoItem[]; onAdd: (m: MemoItem) => void; onDelete: (id: string) => void
}) {
  return (
    <div>
      <HandwriteCanvas hwSupported={hwSupported} onSave={(image, text) => onAdd({ id: uid(), image, text })} />
      {items.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {items.map(m => (
            <div key={m.id} className="flex items-start gap-2 bg-white border border-gray-200 rounded-lg p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.image} alt="手書きメモ" className="h-16 rounded border border-gray-200 flex-none" />
              <div className="flex-1 min-w-0">
                {m.text
                  ? <p className="text-[12.5px] text-gray-800 break-words">{m.text}</p>
                  : <p className="text-[11.5px] text-gray-400">テキスト未変換（画像のみ）</p>}
              </div>
              <button type="button" onClick={() => onDelete(m.id)} className="flex-none p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldBox({ label, wide }: Field) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[11px] text-gray-500 mb-1">{label}</span>
      <input type="text" className="w-full h-10 px-3 text-[14px] bg-white border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
    </label>
  )
}

function Pill({ label }: { label: string }) {
  const [on, setOn] = useState(false)
  return (
    <button type="button" onClick={() => setOn(v => !v)}
      className={`text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
      {on && <Check className="inline w-3.5 h-3.5 mr-0.5 -mt-0.5" />}{label}
    </button>
  )
}

function SheetFields({ s }: { s: Section }) {
  return (
    <>
      {s.pills && <div className="flex flex-wrap gap-1.5 mb-3">{s.pills.map(p => <Pill key={p} label={p} />)}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{s.fields.map(f => <FieldBox key={f.label} {...f} />)}</div>
    </>
  )
}

export default function MeetingSheetClient() {
  const [tab, setTab] = useState<'sheet' | 'order' | 'memo'>('sheet')
  const [locked, setLocked] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set(SECTIONS.filter(s => s.openInSheet).map(s => s.key)))
  const [memoOpen, setMemoOpen] = useState<Set<string>>(new Set())
  const [memos, setMemos] = useState<Record<string, MemoItem[]>>({})
  const [hwSupported, setHwSupported] = useState<boolean | null>(null)

  // localStorage から復元＋手書き認識の対応判定
  useEffect(() => {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) setMemos(JSON.parse(raw)) } catch { /* noop */ }
    setHwSupported(typeof (navigator as unknown as { createHandwritingRecognizer?: unknown }).createHandwritingRecognizer === 'function')
  }, [])

  // 追加/削除は関数型setStateで最新を参照。localStorageはユーザー操作時のみ書込み（読込effectとの競合回避）。
  const addMemo = useCallback((key: string, m: MemoItem) => setMemos(prev => {
    const next = { ...prev, [key]: [...(prev[key] ?? []), m] }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* 容量超過等は無視（仮版） */ }
    return next
  }), [])
  const delMemo = useCallback((key: string, id: string) => setMemos(prev => {
    const next = { ...prev, [key]: (prev[key] ?? []).filter(x => x.id !== id) }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* noop */ }
    return next
  }), [])

  const toggleOpen = useCallback((k: string) => setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }), [])
  const toggleMemo = useCallback((k: string) => setMemoOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }), [])
  const switchToOrder = () => { setLocked(true); setTab('order') }

  const TabBtn = ({ id, icon: Icon, label, disabled }: { id: typeof tab; icon: typeof ClipboardList; label: string; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => !disabled && setTab(id)}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
        tab === id ? 'bg-white text-brand-700 border border-gray-200 shadow-sm'
        : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700'}`}>
      <Icon className="w-4 h-4" strokeWidth={2} />{label}{disabled && <Lock className="w-3 h-3" />}
    </button>
  )

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <ClipboardList className="w-4 h-4 flex-none" />
        面談シート（仮版）— 手書きメモはこの端末内（ブラウザ）に保存されます。項目入力は保存されません。
      </div>

      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1.5 mb-2">
        <TabBtn id="sheet" icon={ClipboardList} label="面談シート" disabled={locked} />
        <TabBtn id="order" icon={FileSpreadsheet} label="オーダーシート" />
        <TabBtn id="memo" icon={PencilLine} label="メモ" />
        {tab === 'sheet' && !locked && (
          <button type="button" onClick={switchToOrder}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50">
            オーダーシートに切り替え <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-4 px-1">
        {locked
          ? '⚠ オーダーシートに切り替えました。面談シートには戻れません。'
          : '面談シートは要点だけ表示（相続人一覧・受注内容・財産情報を展開、他は折りたたみ）。切り替えると戻れません。'}
      </p>

      {/* 面談シート */}
      {tab === 'sheet' && (
        <div className="space-y-3">
          {SECTIONS.map(s => {
            const isOpen = open.has(s.key)
            return (
              <section key={s.key} className="bg-[#FEF8EA] border border-[#EADFC7] rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-600">
                  <button type="button" onClick={() => toggleOpen(s.key)} className="flex items-center gap-2 text-white flex-1 text-left">
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    <span className="text-[14px] font-bold">{s.title}</span>
                    {(memos[s.key]?.length ?? 0) > 0 && <span className="text-[10px] bg-white/25 rounded-full px-1.5 py-0.5">メモ{memos[s.key]!.length}</span>}
                  </button>
                  <button type="button" onClick={() => toggleMemo(s.key)}
                    className={`inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border ${memoOpen.has(s.key) ? 'bg-white text-brand-700 border-white' : 'bg-brand-500/40 text-white border-white/50 hover:bg-brand-500/60'}`}>
                    <Plus className="w-3.5 h-3.5" />メモ
                  </button>
                </div>
                {isOpen && (
                  <div className="p-4 space-y-3">
                    {memoOpen.has(s.key) && <SectionMemo hwSupported={hwSupported} items={memos[s.key] ?? []} onAdd={m => addMemo(s.key, m)} onDelete={id => delMemo(s.key, id)} />}
                    <SheetFields s={s} />
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* オーダーシート */}
      {tab === 'order' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[12px] text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
            <FileSpreadsheet className="w-4 h-4 flex-none" />オーダーシート＝全項目を展開。貴社後に詳細を入力します。
          </div>
          {SECTIONS.map(s => (
            <section key={s.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-brand-600"><span className="text-[14px] font-bold text-white">{s.title}</span></div>
              <div className="p-4"><SheetFields s={s} /></div>
            </section>
          ))}
        </div>
      )}

      {/* メモ（白紙キャンバス） */}
      {tab === 'memo' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <PencilLine className="w-4 h-4 flex-none" />各セクションに自由に手書き → 「テキスト化」で文字化・「このセクションに保存」で画像として保持。
          </div>
          {SECTIONS.map(s => (
            <section key={s.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-[13.5px] font-bold text-gray-700">{s.title}</span>
                {(memos[s.key]?.length ?? 0) > 0 && <span className="text-[10px] text-gray-400">保存 {memos[s.key]!.length} 件</span>}
              </div>
              <div className="p-3"><SectionMemo hwSupported={hwSupported} items={memos[s.key] ?? []} onAdd={m => addMemo(s.key, m)} onDelete={id => delMemo(s.key, id)} /></div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

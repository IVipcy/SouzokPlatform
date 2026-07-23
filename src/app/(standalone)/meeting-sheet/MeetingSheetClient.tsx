'use client'

// 面談シート（仮版）。面談時にタブレット/PC＋ペンで入力する想定の試作。
// ・DB連携なし・保存はブラウザ内メモリのみ（見た目・操作感の確認用）。
// ・3タブ：面談シート / オーダーシート / メモ。
//   - 面談シート＝オーダーシートの構成のまま、相続人一覧・受注内容・財産情報だけ開き他は閉じる。
//     各セクションに埋め込みメモ(A)＝「＋メモ」で手書きキャンバスを展開しつつ項目入力も可能。
//   - オーダーシート＝全セクション展開。面談シートから「切り替え」で一方向遷移（戻れない）。
//   - メモ＝各セクション名だけの白紙キャンバス(B)に自由に手書き。
// ・手書きは画像として保持、テキスト化はダミー（後日OCR実装）。

import { useRef, useState, useCallback, type PointerEvent as RPointerEvent } from 'react'
import {
  ClipboardList, FileSpreadsheet, PencilLine, ChevronDown, Plus, ArrowRight,
  Lock, Eraser, Save, Type, Users, Check,
} from 'lucide-react'

type Field = { label: string; wide?: boolean }
type Section = { key: string; title: string; openInSheet: boolean; pills?: string[]; fields: Field[] }

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

// 手書きキャンバス。ペンタブ/タブレットのペン（pointer pressure対応）で描画→画像保持・テキスト化はダミー。
function HandwriteCanvas({ height = 150 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [empty, setEmpty] = useState(true)

  const ctxOf = () => {
    const c = canvasRef.current
    if (!c) return null
    // 初回に実寸へ合わせる（Retina対応）
    if (c.width === 0) {
      const dpr = window.devicePixelRatio || 1
      const rect = c.getBoundingClientRect()
      c.width = Math.max(1, rect.width) * dpr
      c.height = height * dpr
      const ctx = c.getContext('2d')
      if (ctx) { ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2937' }
    }
    return c.getContext('2d')
  }
  const pos = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    ctxOf(); drawing.current = true; last.current = pos(e)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = ctxOf(); if (!ctx || !last.current) return
    const p = pos(e)
    ctx.lineWidth = 1 + (e.pressure ? e.pressure * 2.4 : 1.2)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; setEmpty(false)
  }
  const up = () => { drawing.current = false; last.current = null }
  const clear = () => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height)
    setSaved(null); setText(''); setEmpty(true)
  }
  const save = () => { const c = canvasRef.current; if (c) setSaved(c.toDataURL('image/png')) }
  const toText = () => setText('（テキスト化はダミー）手書き内容をここに自動認識して表示します')

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
        <button type="button" onClick={save} disabled={empty} className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"><Save className="w-3.5 h-3.5" />画像で保存</button>
        <button type="button" onClick={toText} disabled={empty} className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><Type className="w-3.5 h-3.5" />テキスト化</button>
        {saved && <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><Check className="w-3.5 h-3.5 text-emerald-600" />画像を保存しました</span>}
      </div>
      {text && <p className="mt-1.5 text-[12px] text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5">{text}</p>}
      {saved && (
        <div className="mt-1.5">
          <img src={saved} alt="手書きメモ" className="max-h-24 rounded border border-gray-200" />
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

function SheetFields({ s }: { s: Section }) {
  return (
    <>
      {s.pills && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {s.pills.map(p => <Pill key={p} label={p} />)}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {s.fields.map(f => <FieldBox key={f.label} {...f} />)}
      </div>
    </>
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

export default function MeetingSheetClient() {
  const [tab, setTab] = useState<'sheet' | 'order' | 'memo'>('sheet')
  const [locked, setLocked] = useState(false) // オーダーシートに切り替え済み＝面談シートに戻れない
  const [open, setOpen] = useState<Set<string>>(() => new Set(SECTIONS.filter(s => s.openInSheet).map(s => s.key)))
  const [memoOpen, setMemoOpen] = useState<Set<string>>(new Set())

  const toggleOpen = useCallback((k: string) => setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }), [])
  const toggleMemo = useCallback((k: string) => setMemoOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }), [])
  const switchToOrder = () => { setLocked(true); setTab('order') }

  const TabBtn = ({ id, icon: Icon, label, disabled }: { id: typeof tab; icon: typeof ClipboardList; label: string; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => !disabled && setTab(id)}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
        tab === id ? 'bg-white text-brand-700 border border-gray-200 shadow-sm'
        : disabled ? 'text-gray-300 cursor-not-allowed'
        : 'text-gray-500 hover:text-gray-700'}`}>
      <Icon className="w-4 h-4" strokeWidth={2} />{label}{disabled && <Lock className="w-3 h-3" />}
    </button>
  )

  return (
    <div>
      {/* 仮版バナー */}
      <div className="mb-3 flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <ClipboardList className="w-4 h-4 flex-none" />
        面談シート（仮版）— 見た目・操作感の確認用です。入力内容は保存されません（DB未連携）。
      </div>

      {/* タブ＋切り替え */}
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
                  </button>
                  <button type="button" onClick={() => toggleMemo(s.key)}
                    className={`inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded border ${memoOpen.has(s.key) ? 'bg-white text-brand-700 border-white' : 'bg-brand-500/40 text-white border-white/50 hover:bg-brand-500/60'}`}>
                    <Plus className="w-3.5 h-3.5" />メモ
                  </button>
                </div>
                {isOpen && (
                  <div className="p-4 space-y-3">
                    {memoOpen.has(s.key) && <HandwriteCanvas />}
                    <SheetFields s={s} />
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* オーダーシート（全開・一方向） */}
      {tab === 'order' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[12px] text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
            <FileSpreadsheet className="w-4 h-4 flex-none" />
            オーダーシート＝全項目を展開。貴社後に詳細を入力します。
          </div>
          {SECTIONS.map(s => (
            <section key={s.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-brand-600"><span className="text-[14px] font-bold text-white">{s.title}</span></div>
              <div className="p-4"><SheetFields s={s} /></div>
            </section>
          ))}
        </div>
      )}

      {/* メモ（白紙キャンバス・セクション名だけ） */}
      {tab === 'memo' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <PencilLine className="w-4 h-4 flex-none" />
            各セクションの白紙キャンバスに自由に手書き → 画像で保存・テキスト化（ダミー）。
          </div>
          {SECTIONS.map(s => (
            <section key={s.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-[13.5px] font-bold text-gray-700">{s.title}</span>
              </div>
              <div className="p-3"><HandwriteCanvas height={180} /></div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

// 画像への書き込みエディタ（戸籍のスキャンにマーカー・メモを付ける）。
//
// 元画像は書き換えず、書いた内容（座標・色・文字）だけを保存する。
// 座標は画像に対する 0〜1 の割合なので、拡大しても位置がずれない。
//
// ・ペン（黒・赤）／蛍光ペン（緑・黄）… ドラッグで線を引く
// ・テキスト … クリックで箱を作り打ち込む。置いたあとは
//               ドラッグで移動 / 右下の■で箱幅 / A-・A+で文字サイズ / ○をドラッグで引き出し線
// ・消す … 線・箱を1つずつ選んで消す
// ・戻す … 直前の操作を取り消す
//
// 描画は canvas に集約（src/lib/imageAnnotations.ts）。編集中のテキストだけは
// 打ち込みやすさのため HTML の入力欄を重ねて出し、確定したら canvas 側で描く。

import { useState, useRef, useEffect, useCallback } from 'react'
import { Undo2, Trash2, Type, X, Move } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import {
  PEN_COLORS, MARKER_COLORS, PEN_WIDTH, MARKER_WIDTH, TEXT_BOX_W, TEXT_FONT,
  TEXT_FONT_STEPS, TEXT_BOX_MIN_W, fontOf,
  drawAnnotations, textBoxHeight, getMeasureCtx, newId,
  type Anno, type PenAnno, type TextAnno,
} from '@/lib/imageAnnotations'

type Tool = { kind: 'pen' | 'marker'; color: string } | { kind: 'text' } | { kind: 'erase' }

function ToolBtn({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold border transition ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
      {children}
    </button>
  )
}

function ColorDot({ css, on, onClick, label }: { css: string; on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`w-6 h-6 rounded-full border-2 transition ${on ? 'border-brand-600 scale-110' : 'border-gray-200'}`}
      style={{ background: css }} />
  )
}

export default function ImageAnnotator({ isOpen, onClose, imageUrl, initial, onSave, title }: {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  initial: Anno[]
  onSave: (annos: Anno[]) => Promise<void> | void
  title?: string
}) {
  const [annos, setAnnos] = useState<Anno[]>(initial)
  const [history, setHistory] = useState<Anno[][]>([])
  const [tool, setTool] = useState<Tool>({ kind: 'marker', color: MARKER_COLORS[1].css })
  const [editingId, setEditingId] = useState<string | null>(null)
  // 選択中のメモ（掴んだ／編集した箱）。選択中だけ操作用のつまみとミニ道具を出す。
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const drawingRef = useRef<PenAnno | null>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize' | 'leader'; dx: number; dy: number } | null>(null)
  // ドラッグ開始時の状態。ドラッグを終えた時点で1回だけ「戻す」履歴に積む。
  const dragSnapRef = useRef<Anno[] | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // 画像を読み込み、表示サイズ（横幅いっぱい）に合わせて canvas を用意する
  useEffect(() => {
    if (!isOpen || !imageUrl) return
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!alive) return
      imgRef.current = img
      const maxW = wrapRef.current?.clientWidth ?? 800
      const w = Math.min(maxW, img.naturalWidth)
      setSize({ w, h: Math.round((img.naturalHeight / img.naturalWidth) * w) })
    }
    img.src = imageUrl
    return () => { alive = false }
  }, [isOpen, imageUrl])

  const redraw = useCallback(() => {
    const cv = canvasRef.current
    const img = imgRef.current
    if (!cv || !img || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    cv.width = size.w * dpr
    cv.height = size.h * dpr
    cv.style.width = `${size.w}px`
    cv.style.height = `${size.h}px`
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.drawImage(img, 0, 0, size.w, size.h)
    const live = drawingRef.current ? [...annos, drawingRef.current] : annos
    // 編集中のテキストは HTML 側で出すので canvas では描かない
    drawAnnotations(ctx, live, size.w, size.h, { skipTextIds: editingId ? new Set([editingId]) : undefined })
  }, [annos, size, editingId])

  useEffect(() => { redraw() }, [redraw])

  const push = (next: Anno[]) => { setHistory(h => [...h.slice(-29), annos]); setAnnos(next) }
  const undo = () => { setHistory(h => { if (h.length === 0) return h; setAnnos(h[h.length - 1]); return h.slice(0, -1) }) }

  const rel = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  // 当たり判定：テキスト箱 → 線 の順で近いものを拾う
  const hitTest = (p: { x: number; y: number }): Anno | null => {
    const ctx = getMeasureCtx()
    for (let i = annos.length - 1; i >= 0; i--) {
      const a = annos[i]
      if (a.type === 'text' && ctx) {
        const hh = textBoxHeight(ctx, a, size.w, size.h)
        if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + hh) return a
      }
      if (a.type === 'pen' || a.type === 'marker') {
        for (let k = 0; k < a.points.length; k += 2) {
          if (Math.hypot(a.points[k] - p.x, (a.points[k + 1] - p.y) * (size.h / size.w)) < Math.max(a.width, 0.012)) return a
        }
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (saving) return
    const p = rel(e)
    if (tool.kind === 'erase') {
      const hit = hitTest(p)
      if (hit) push(annos.filter(a => a.id !== hit.id))
      return
    }
    if (tool.kind === 'text') {
      const t: TextAnno = { id: newId(), type: 'text', color: PEN_COLORS[1].css, x: Math.min(p.x, 1 - TEXT_BOX_W), y: p.y, w: TEXT_BOX_W, font: TEXT_FONT, text: '', leader: null }
      push([...annos, t])
      setEditingId(t.id)
      setSelectedId(t.id)
      return
    }
    // 何もない所を押したら選択を外す（つまみを消して線が書けるようにする）
    setSelectedId(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drawingRef.current = {
      id: newId(), type: tool.kind, color: tool.color,
      width: tool.kind === 'marker' ? MARKER_WIDTH : PEN_WIDTH,
      points: [p.x, p.y],
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) return   // メモの移動・サイズ変更はつまみ側で処理する
    if (!drawingRef.current) return
    const p = rel(e)
    drawingRef.current.points.push(p.x, p.y)
    redraw()
  }
  const onPointerUp = () => {
    if (dragRef.current) return
    const d = drawingRef.current
    drawingRef.current = null
    if (d && d.points.length >= 4) push([...annos, d])
    else redraw()
  }

  // テキスト箱の表示高さ（px）。計測専用canvasを使い、描画用refはレンダー中に触らない。
  const boxPx = (a: TextAnno) => {
    const ctx = getMeasureCtx()
    return ctx && size.w > 0 ? textBoxHeight(ctx, a, size.w, size.h) * size.h : 40
  }
  const updateText = (v: string) => setAnnos(prev => prev.map(a => (a.id === editingId && a.type === 'text' ? { ...a, text: v } : a)))
  /** 1つのメモだけ書き換える（移動・サイズ・文字サイズ・色で共通） */
  const patchText = (id: string, patch: Partial<TextAnno>) =>
    setAnnos(prev => prev.map(a => (a.id === id && a.type === 'text' ? { ...a, ...patch } : a)))
  /** 「戻す」履歴に1回だけ積んでから書き換える（ボタン操作用） */
  const editText = (id: string, patch: Partial<TextAnno>) => {
    setHistory(h => [...h.slice(-29), annos])
    patchText(id, patch)
  }
  const bumpFont = (a: TextAnno, dir: 1 | -1) => {
    const cur = fontOf(a)
    // いま一番近い段を探して1段ずらす
    let i = 0
    TEXT_FONT_STEPS.forEach((v, k) => { if (Math.abs(v - cur) < Math.abs(TEXT_FONT_STEPS[i] - cur)) i = k })
    const next = TEXT_FONT_STEPS[Math.max(0, Math.min(TEXT_FONT_STEPS.length - 1, i + dir))]
    editText(a.id, { font: next })
  }

  // 画像に対する割合座標（つまみのドラッグはcanvasの外にも出るのでclient座標から引き直す）
  const relCanvas = (clientX: number, clientY: number) => {
    const cv = canvasRef.current
    if (!cv) return { x: 0, y: 0 }
    const r = cv.getBoundingClientRect()
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height }
  }
  // つまみのドラッグ：押した要素にポインタを固定するので、画像の外に出ても追従する。
  const startDrag = (e: React.PointerEvent, a: TextAnno, mode: 'move' | 'resize' | 'leader') => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = relCanvas(e.clientX, e.clientY)
    dragSnapRef.current = annos
    dragRef.current = { id: a.id, mode, dx: p.x - a.x, dy: p.y - a.y }
    setSelectedId(a.id)
  }
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    e.stopPropagation()
    const p = relCanvas(e.clientX, e.clientY)
    setAnnos(prev => prev.map(a => {
      if (a.id !== d.id || a.type !== 'text') return a
      if (d.mode === 'move') return { ...a, x: Math.max(0, Math.min(1 - a.w, p.x - d.dx)), y: Math.max(0, Math.min(1, p.y - d.dy)) }
      if (d.mode === 'resize') return { ...a, w: Math.max(TEXT_BOX_MIN_W, Math.min(1 - a.x, p.x - a.x)) }
      return { ...a, leader: { x: p.x, y: p.y } }
    }))
  }
  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.stopPropagation()
    const snap = dragSnapRef.current
    dragRef.current = null
    dragSnapRef.current = null
    if (snap) setHistory(h => [...h.slice(-29), snap])
  }

  const save = async () => {
    setSaving(true)
    // 中身が空のテキスト箱は捨てる（誤クリックで箱だけ残るのを防ぐ）
    const cleaned = annos.filter(a => a.type !== 'text' || (a.text ?? '').trim() !== '')
    await onSave(cleaned)
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? '画像に書き込む'} maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>閉じる</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </>
      }>
      <div className="space-y-2.5">
        {/* 道具 */}
        <div className="flex items-center gap-2 flex-wrap border-b border-gray-100 pb-2.5">
          <span className="text-[12px] text-gray-500">ペン</span>
          {PEN_COLORS.map(c => (
            <ColorDot key={c.key} css={c.css} label={`ペン ${c.label}`}
              on={tool.kind === 'pen' && tool.color === c.css}
              onClick={() => setTool({ kind: 'pen', color: c.css })} />
          ))}
          <span className="w-px h-5 bg-gray-200" />
          <span className="text-[12px] text-gray-500">蛍光ペン</span>
          {MARKER_COLORS.map(c => (
            <ColorDot key={c.key} css={c.css} label={`蛍光ペン ${c.label}`}
              on={tool.kind === 'marker' && tool.color === c.css}
              onClick={() => setTool({ kind: 'marker', color: c.css })} />
          ))}
          <span className="w-px h-5 bg-gray-200" />
          <ToolBtn on={tool.kind === 'text'} onClick={() => setTool({ kind: 'text' })} label="テキスト"><Type className="w-3.5 h-3.5" />テキスト</ToolBtn>
          <ToolBtn on={tool.kind === 'erase'} onClick={() => setTool({ kind: 'erase' })} label="消す"><Trash2 className="w-3.5 h-3.5" />消す</ToolBtn>
          <button type="button" onClick={undo} disabled={history.length === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold border border-gray-200 bg-white text-gray-600 hover:border-brand-300 disabled:opacity-40">
            <Undo2 className="w-3.5 h-3.5" />戻す
          </button>
          <span className="ml-auto text-[11px] text-gray-400">
            {tool.kind === 'text' ? 'クリックでメモを置く。置いたあとは ドラッグで移動／■で幅／A±で文字サイズ／○で引き出し線'
              : tool.kind === 'erase' ? '消したい線・メモをクリック'
              : 'ドラッグで書く'}
          </span>
        </div>

        {/* 画像＋書き込み */}
        <div ref={wrapRef} className="relative bg-gray-50 border border-gray-200 rounded-lg overflow-auto" style={{ maxHeight: '62vh' }}>
          <div className="relative mx-auto" style={{ width: size.w, height: size.h }}>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="block touch-none"
              style={{ cursor: tool.kind === 'erase' ? 'pointer' : tool.kind === 'text' ? 'text' : 'crosshair' }}
            />
            {/* テキスト箱：編集中は入力欄、確定後は掴んで動かすための透明な当たり */}
            {annos.filter((a): a is TextAnno => a.type === 'text').map(a => {
              const left = a.x * size.w, top = a.y * size.h, w = a.w * size.w
              const isEditing = a.id === editingId
              const isSelected = a.id === selectedId
              const h = boxPx(a)
              const fontPx = Math.max(11, fontOf(a) * size.w)
              return (
                <div key={a.id} className="absolute" style={{ left, top, width: w }}>
                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={a.text}
                      onChange={e => updateText(e.target.value)}
                      onBlur={() => setEditingId(null)}
                      placeholder="メモを入力"
                      className="w-full px-1.5 py-1 rounded border-2 bg-white/95 outline-none resize-none block"
                      style={{ borderColor: a.color, color: a.color, fontSize: fontPx, lineHeight: 1.45, height: Math.max(h, fontPx * 2.4) }}
                    />
                  ) : (
                    <div
                      className={`absolute inset-0 ${tool.kind === 'erase' ? 'cursor-pointer' : 'cursor-move'} ${isSelected ? 'ring-2 ring-brand-500/70 rounded' : ''}`}
                      style={{ height: h, touchAction: 'none' }}
                      onDoubleClick={() => { setSelectedId(a.id); setEditingId(a.id) }}
                      onPointerDown={e => { if (tool.kind === 'erase') return; startDrag(e, a, 'move') }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      title="ドラッグで移動 / ダブルクリックで文字を編集"
                    />
                  )}

                  {/* 選択中だけ出す道具：文字サイズ・色・削除。押しても編集は途切れないようにする。 */}
                  {(isSelected || isEditing) && (
                    <div
                      className="absolute flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm px-1 py-0.5"
                      style={{ left: 0, top: -30, zIndex: 5 }}
                      onMouseDown={e => e.preventDefault()}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <Move className="w-3 h-3 text-gray-300" />
                      <button type="button" title="文字を小さく" onClick={() => bumpFont(a, -1)}
                        className="px-1.5 text-[11px] font-bold text-gray-600 hover:text-brand-700">A-</button>
                      <button type="button" title="文字を大きく" onClick={() => bumpFont(a, 1)}
                        className="px-1.5 text-[14px] font-bold text-gray-600 hover:text-brand-700">A+</button>
                      <span className="w-px h-3.5 bg-gray-200 mx-0.5" />
                      {PEN_COLORS.map(c => (
                        <button key={c.key} type="button" title={`文字と枠を${c.label}に`} aria-label={`${c.label}にする`}
                          onClick={() => editText(a.id, { color: c.css })}
                          className={`w-3.5 h-3.5 rounded-full border ${a.color === c.css ? 'border-brand-600 scale-110' : 'border-gray-200'}`}
                          style={{ background: c.css }} />
                      ))}
                      <span className="w-px h-3.5 bg-gray-200 mx-0.5" />
                      <button type="button" title="このメモを削除"
                        onClick={() => { push(annos.filter(x => x.id !== a.id)); setEditingId(null); setSelectedId(null) }}
                        className="px-1 text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  )}

                  {/* 箱幅を変えるつまみ（右下） */}
                  {(isSelected || isEditing) && (
                    <div
                      className="absolute w-3 h-3 bg-white border-2 rounded-sm cursor-ew-resize"
                      style={{ borderColor: a.color, left: w - 6, top: h - 6, touchAction: 'none', zIndex: 5 }}
                      title="ドラッグで箱の幅を変える"
                      onPointerDown={e => startDrag(e, a, 'resize')}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  )}

                  {/* 引き出し線のつまみ。まだ線が無ければ箱の右上に置く */}
                  <button
                    type="button"
                    className="absolute w-4 h-4 rounded-full border-2 border-white shadow"
                    style={{
                      background: a.color,
                      left: a.leader ? (a.leader.x - a.x) * size.w - 8 : w - 8,
                      top: a.leader ? (a.leader.y - a.y) * size.h - 8 : -8,
                      touchAction: 'none',
                      zIndex: 5,
                    }}
                    title="ドラッグして指したい場所へ"
                    onPointerDown={e => startDrag(e, a, 'leader')}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}

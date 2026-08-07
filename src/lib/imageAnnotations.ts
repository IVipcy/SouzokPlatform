// 画像への書き込み（マーカー・メモ）の共通処理。
// 戸籍のスキャン画像に蛍光ペンやメモを付ける機能で使う。
//
// 座標は画像の幅・高さに対する 0〜1 の割合で持つ。
// こうしておくと、サムネイル・拡大表示・書き出しのどれでも同じ絵になる。
// 元画像は一切書き換えず、ここで持つデータを毎回上に描き直す。

export type PenAnno = {
  id: string
  type: 'pen' | 'marker'
  color: string
  /** 線の太さ。画像の幅に対する割合 */
  width: number
  /** [x0,y0,x1,y1,...] の割合座標 */
  points: number[]
}

export type TextAnno = {
  id: string
  type: 'text'
  color: string
  /** 箱の左上（割合） */
  x: number
  y: number
  /** 箱の幅（割合）。高さは文字量で決まる */
  w: number
  /** 文字の大きさ（画像幅に対する割合）。未指定は TEXT_FONT */
  font?: number
  text: string
  /** 引き出し線の先端（割合）。無ければ線を引かない */
  leader?: { x: number; y: number } | null
}

export type Anno = PenAnno | TextAnno

/** 蛍光ペンの色（下の文字が読める濃さで塗る） */
export const MARKER_COLORS = [
  { key: 'green', label: '緑', css: '#97C459' },
  { key: 'yellow', label: '黄', css: '#FAC775' },
] as const
/** ペンの色 */
export const PEN_COLORS = [
  { key: 'black', label: '黒', css: '#1F2937' },
  { key: 'red', label: '赤', css: '#DC2626' },
] as const

export const MARKER_ALPHA = 0.42
/** 既定の線幅（画像幅に対する割合） */
export const PEN_WIDTH = 0.004
export const MARKER_WIDTH = 0.022
/** テキスト箱の既定幅・文字サイズ（画像幅に対する割合） */
export const TEXT_BOX_W = 0.26
export const TEXT_FONT = 0.026
/** 文字サイズの段階（小さい順）。A-／A+ で1段ずつ動かす */
export const TEXT_FONT_STEPS = [0.014, 0.018, 0.022, 0.026, 0.032, 0.040, 0.050] as const
/** 箱幅の下限（割合） */
export const TEXT_BOX_MIN_W = 0.06

/** その箱の文字サイズ（未指定なら既定） */
export const fontOf = (a: TextAnno) => a.font ?? TEXT_FONT

export const newId = () => Math.random().toString(36).slice(2, 10)

/** テキストを箱幅に合わせて折り返す */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of (text ?? '').split('\n')) {
    let line = ''
    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > maxWidth && line) { out.push(line); line = ch }
      else line += ch
    }
    out.push(line)
  }
  return out
}

/**
 * 画像＋書き込みを canvas に描く。表示・サムネイル・書き出しで共通に使う。
 * テキストは編集中だけ HTML の箱で扱い、描画はここに集約する。
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annos: Anno[],
  w: number,
  h: number,
  opts?: { skipTextIds?: Set<string> },
) {
  for (const a of annos) {
    if (a.type === 'pen' || a.type === 'marker') {
      if (a.points.length < 4) continue
      ctx.save()
      ctx.strokeStyle = a.color
      ctx.lineWidth = Math.max(1, a.width * w)
      ctx.lineCap = a.type === 'marker' ? 'butt' : 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = a.type === 'marker' ? MARKER_ALPHA : 1
      ctx.beginPath()
      ctx.moveTo(a.points[0] * w, a.points[1] * h)
      for (let i = 2; i < a.points.length; i += 2) ctx.lineTo(a.points[i] * w, a.points[i + 1] * h)
      ctx.stroke()
      ctx.restore()
      continue
    }
    if (a.type !== 'text') continue
    if (opts?.skipTextIds?.has(a.id)) continue
    drawTextAnno(ctx, a, w, h)
  }
}

/** テキストの箱＋引き出し線を描く */
export function drawTextAnno(ctx: CanvasRenderingContext2D, a: TextAnno, w: number, h: number) {
  const fontPx = Math.max(9, fontOf(a) * w)
  const padding = fontPx * 0.45
  const boxW = a.w * w
  ctx.save()
  ctx.font = `${fontPx}px sans-serif`
  const lines = wrapText(ctx, a.text || '', boxW - padding * 2)
  const lineH = fontPx * 1.45
  const boxH = lines.length * lineH + padding * 2
  const x = a.x * w
  const y = a.y * h

  // 引き出し線は箱の縁から出す（箱の中心へ向かう線を縁で切る）
  if (a.leader) {
    const lx = a.leader.x * w, ly = a.leader.y * h
    const cx = x + boxW / 2, cy = y + boxH / 2
    const dx = lx - cx, dy = ly - cy
    const t = Math.min(
      Math.abs(dx) > 0.001 ? (boxW / 2) / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.001 ? (boxH / 2) / Math.abs(dy) : Infinity,
    )
    const sx = cx + dx * (isFinite(t) ? t : 0)
    const sy = cy + dy * (isFinite(t) ? t : 0)
    ctx.strokeStyle = a.color
    ctx.lineWidth = Math.max(1, w * 0.0022)
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly); ctx.stroke()
    ctx.fillStyle = a.color
    ctx.beginPath(); ctx.arc(lx, ly, Math.max(2, w * 0.005), 0, Math.PI * 2); ctx.fill()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = a.color
  ctx.lineWidth = Math.max(1, w * 0.0018)
  ctx.beginPath(); ctx.roundRect(x, y, boxW, boxH, fontPx * 0.3); ctx.fill(); ctx.stroke()
  ctx.fillStyle = a.color
  ctx.textBaseline = 'top'
  lines.forEach((ln, i) => ctx.fillText(ln, x + padding, y + padding + i * lineH))
  ctx.restore()
}

// 文字幅の計測だけに使う画面外のcanvas。描画用のcanvasを参照すると
// レンダー中にrefを触ることになるため、計測専用に1つ持つ。
let measureCtx: CanvasRenderingContext2D | null = null
export function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== 'undefined') {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  return measureCtx
}

/** テキスト箱の高さ（割合）。当たり判定・ドラッグ範囲に使う */
export function textBoxHeight(ctx: CanvasRenderingContext2D, a: TextAnno, w: number, h: number): number {
  const fontPx = Math.max(9, fontOf(a) * w)
  const padding = fontPx * 0.45
  ctx.save()
  ctx.font = `${fontPx}px sans-serif`
  const lines = wrapText(ctx, a.text || '', a.w * w - padding * 2)
  ctx.restore()
  return (lines.length * fontPx * 1.45 + padding * 2) / h
}

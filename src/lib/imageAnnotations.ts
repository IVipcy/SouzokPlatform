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

/** 枠。種類は2つ＝「次の請求先」（赤。転籍先の本籍・従前戸籍など）と「現在住所」（青。住民票・附票で分かった今の住所）。
 *  枠の上に種類の文言を出すので、見る人が色を覚えていなくても分かる。kind 未指定は古いデータ＝次の請求先 */
export type RectKind = 'next' | 'address'
export type RectAnno = {
  id: string
  type: 'rect'
  color: string
  kind?: RectKind
  /** 左上（割合）と大きさ（割合） */
  x: number
  y: number
  w: number
  h: number
}

export type Anno = PenAnno | TextAnno | RectAnno

export const RECT_COLOR = '#DC2626'
export const RECT_KINDS: Array<{ key: RectKind; label: string; color: string; use: string }> = [
  { key: 'next', label: '次の請求先', color: '#DC2626', use: '次に請求する箇所（転籍先の本籍・従前戸籍など）' },
  { key: 'address', label: '現在住所', color: '#2563EB', use: '住民票・附票で分かった今の住所' },
]
export const rectKindOf = (a: RectAnno): RectKind => a.kind ?? 'next'
export const rectDef = (a: RectAnno) => RECT_KINDS.find(k => k.key === rectKindOf(a)) ?? RECT_KINDS[0]
/** 枠の最小の大きさ（割合）。これより小さいドラッグは誤操作とみなして置かない */
export const RECT_MIN = 0.015
/** 枠の線の太さ（画像幅に対する割合） */
export const RECT_LINE = 0.0045
/** 枠の上に出す文言の文字サイズ（画像幅に対する割合） */
export const RECT_LABEL_FONT = 0.016
export const RECT_USE = RECT_KINDS[0].use

// ── 回転 ──
/** 回した後の大きさ（90/270 は縦横が入れ替わる） */
export function rotatedSize(nw: number, nh: number, rotation: number): { w: number; h: number } {
  return ((rotation % 180) + 180) % 180 === 90 ? { w: nh, h: nw } : { w: nw, h: nh }
}
/** 画像を rotation（時計回り）で回して、表示枠 w×h（回した後の大きさ）いっぱいに描く */
export function drawImageRotated(ctx: CanvasRenderingContext2D, img: CanvasImageSource, rotation: number, w: number, h: number) {
  const r = ((rotation % 360) + 360) % 360
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate((r * Math.PI) / 180)
  if (r === 90 || r === 270) ctx.drawImage(img, -h / 2, -w / 2, h, w)
  else ctx.drawImage(img, -w / 2, -h / 2, w, h)
  ctx.restore()
}
/**
 * 書き込みを画像と一緒に回す。座標は「表示の向き」の割合で持っているので、回す前後で座標を付け替える。
 *   dir=90（右に90°）：(x,y) → (1-y, x)   dir=-90（左に90°）：(x,y) → (y, 1-x)   dir=180：(1-x, 1-y)
 *   aspect＝回す前の 幅÷高さ。幅に対する割合（テキスト箱の幅・文字サイズ・線の太さ）は 90°回すと幅の基準が変わるので掛け直す
 */
export function rotateAnnos(annos: Anno[], dir: 90 | -90 | 180, aspect: number): Anno[] {
  const pt = (x: number, y: number): [number, number] => dir === 90 ? [1 - y, x] : dir === -90 ? [y, 1 - x] : [1 - x, 1 - y]
  const k = dir === 180 ? 1 : aspect
  return annos.map(a => {
    if (a.type === 'rect') {
      if (dir === 90) return { ...a, x: 1 - (a.y + a.h), y: a.x, w: a.h, h: a.w }
      if (dir === -90) return { ...a, x: a.y, y: 1 - (a.x + a.w), w: a.h, h: a.w }
      return { ...a, x: 1 - (a.x + a.w), y: 1 - (a.y + a.h) }
    }
    if (a.type !== 'text') {
      const pts: number[] = []
      for (let i = 0; i + 1 < a.points.length; i += 2) { const [x, y] = pt(a.points[i], a.points[i + 1]); pts.push(x, y) }
      return { ...a, points: pts, width: a.width * k }
    }
    // テキスト箱は横書きのまま。左上の点だけ回して、はみ出さないように寄せる
    const w = Math.min(1, a.w * k)
    const [x, y] = pt(a.x, a.y)
    const leader = a.leader ? (() => { const [lx, ly] = pt(a.leader.x, a.leader.y); return { x: lx, y: ly } })() : a.leader
    return { ...a, x: Math.max(0, Math.min(1 - w, x)), y: Math.max(0, Math.min(1, y)), w, font: a.font != null ? a.font * k : a.font, leader }
  })
}

/**
 * 蛍光ペンの色（下の文字が読める濃さで塗る）。
 * 色そのものに意味を持たせているので、画面にもこの use をそのまま出す。
 * 人によって塗り分けが変わると、あとから見た人が読めなくなるため。
 */
export const MARKER_COLORS = [
  { key: 'yellow', label: '黄', css: '#FAC775', use: '被相続人' },
  { key: 'green', label: '緑', css: '#97C459', use: '相続人' },
  { key: 'blue', label: '水色', css: '#7FC4E8', use: '亡くなっている相続人' },
] as const
/** 水色の補足（被代襲者・数次相続の被相続人 など） */
export const MARKER_BLUE_NOTE = '被代襲者・数次相続の被相続人 など'

/** ペンの色。ペン機能は廃止したが、過去に引いた線を描くために色定義は残す */
export const PEN_COLORS = [
  { key: 'black', label: '黒', css: '#1F2937' },
  { key: 'red', label: '赤', css: '#DC2626' },
] as const
/** テキスト枠の色（固定）。色を選ばせると書き方が揃わないので1色にする */
export const TEXT_COLOR = '#DC2626'

export const MARKER_ALPHA = 0.42
/** 既定の線幅（画像幅に対する割合） */
export const PEN_WIDTH = 0.004
export const MARKER_WIDTH = 0.022
/** テキスト箱の既定幅・文字サイズ（画像幅に対する割合） */
export const TEXT_BOX_W = 0.58
export const TEXT_FONT = 0.019
/** 箱幅の下限（割合） */
export const TEXT_BOX_MIN_W = 0.12
/** 文字サイズの上下限（割合）。箱幅に連動して動く */
export const TEXT_FONT_MIN = 0.008
export const TEXT_FONT_MAX = 0.06

// テキスト枠の定型。戸籍に書き添える内容は毎回この2行なので、最初から入れておく。
// 自由に何でも書けると人によって書き方が変わり、あとから読む人が困る。
// 空白は1文字ずつ（以前は全角空白が並んでいて、毎回消す手間が大きかった）
export const TEXT_PERIOD_LINE = '証明期間： 年 月 日 ～ 年 月 日'
export const TEXT_TARGET_LINE = '対象者（　）： 年 月 日 ～ 年 月 日'
export const TEXT_DEFAULT = `${TEXT_PERIOD_LINE}\n${TEXT_TARGET_LINE}`

/** テキスト枠の種類。書くものは3つに決まっている（住民票・附票／現在戸籍／一連戸籍） */
export type TextPreset = 'juu' | 'fu' | 'gen' | 'series'
export const TEXT_PRESETS: Array<{ key: TextPreset; label: string; use: string }> = [
  { key: 'juu', label: '住民票（住）', use: '住民票・除票に「対象者・住」' },
  { key: 'fu', label: '附票（附）', use: '戸籍の附票に「対象者・附」' },
  { key: 'gen', label: '現在戸籍（現）', use: '現在戸籍に「対象者・現」' },
  { key: 'series', label: '一連戸籍', use: '証明期間と対象者の掲載期間の2行' },
]
/** 種類と対象者名から枠の中身を作る。対象者が無ければ「対象者」 */
export function textForPreset(preset: TextPreset, targetPerson: string | null | undefined): string {
  const name = (targetPerson ?? '').trim() || '対象者'
  if (preset === 'juu') return `${name}・住`
  if (preset === 'fu') return `${name}・附`
  if (preset === 'gen') return `${name}・現`
  return `${TEXT_PERIOD_LINE}\n対象者（${name}）： 年 月 日 ～ 年 月 日`
}
/** 種類ごとの枠の幅（画像幅に対する割合）。短い1行は狭く */
export const textBoxWidthForPreset = (preset: TextPreset) => (preset === 'series' ? TEXT_BOX_W : TEXT_BOX_W * 0.42)

/** その箱の文字サイズ（未指定なら既定） */
export const fontOf = (a: TextAnno) => a.font ?? TEXT_FONT

/**
 * 箱幅を変えたときの文字サイズ。幅と同じ比率で動かす。
 * 「枠を広げれば字も大きくなる」ので、文字サイズを別に指定させなくてよい。
 */
export const fontForWidth = (a: TextAnno, nextW: number) => {
  const ratio = a.w > 0 ? nextW / a.w : 1
  return Math.max(TEXT_FONT_MIN, Math.min(TEXT_FONT_MAX, fontOf(a) * ratio))
}

export const newId = () => Math.random().toString(36).slice(2, 10)

/**
 * テキスト箱の行組み。折り返しはしない。
 *
 * 中身は「証明期間：　年　月　日 ～ …」のような決まった1行で、途中で折り返すと
 * 「日」だけが次の行に落ちて読めなくなる。そこで、いちばん長い行が枠に収まるまで
 * 文字を小さくして、1行は必ず1行のまま出す（枠を広げれば字は大きくなる）。
 */
export function layoutText(ctx: CanvasRenderingContext2D, a: TextAnno, w: number): {
  lines: string[]; fontPx: number; padding: number; lineH: number; boxH: number
} {
  const lines = (a.text ?? '').split('\n')
  const basePx = Math.max(9, fontOf(a) * w)
  const padding = basePx * 0.45
  const inner = Math.max(1, a.w * w - padding * 2)
  ctx.save()
  ctx.font = `${basePx}px sans-serif`
  let longest = 0
  for (const ln of lines) longest = Math.max(longest, ctx.measureText(ln).width)
  ctx.restore()
  // 収まらないぶんだけ縮める。拡大はしない（枠より字が大きく見えるのを防ぐ）。
  const fontPx = longest > inner ? Math.max(6, basePx * (inner / longest)) : basePx
  const lineH = fontPx * 1.45
  return { lines, fontPx, padding, lineH, boxH: lines.length * lineH + padding * 2 }
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
    if (a.type === 'rect') {
      const def = rectDef(a)
      ctx.save()
      ctx.strokeStyle = def.color
      ctx.lineWidth = Math.max(1.5, RECT_LINE * w)
      ctx.lineJoin = 'miter'
      ctx.strokeRect(a.x * w, a.y * h, a.w * w, a.h * h)
      // 枠の上に種類の文言（白地の帯に色文字）。上に余白が無ければ枠の中の上端に出す
      const fpx = Math.max(9, RECT_LABEL_FONT * w)
      ctx.font = `bold ${fpx}px sans-serif`
      const tw = ctx.measureText(def.label).width
      const padX = fpx * 0.35, bh = fpx * 1.35
      const bx = a.x * w
      const above = a.y * h - bh - fpx * 0.15
      const by = above >= 0 ? above : a.y * h + fpx * 0.15
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillRect(bx, by, tw + padX * 2, bh)
      ctx.fillStyle = def.color
      ctx.textBaseline = 'middle'
      ctx.fillText(def.label, bx + padX, by + bh / 2)
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
  const { lines, fontPx, padding, lineH, boxH } = layoutText(ctx, a, w)
  const boxW = a.w * w
  ctx.save()
  ctx.font = `${fontPx}px sans-serif`
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
  return layoutText(ctx, a, w).boxH / h
}

/** 編集中の入力欄で使う実文字サイズ（枠に収めるため縮めたあとの値） */
export function textFontPx(ctx: CanvasRenderingContext2D, a: TextAnno, w: number): number {
  return layoutText(ctx, a, w).fontPx
}

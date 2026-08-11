// マニュアルの操作ステップ（manual_steps・migration 236）の型と共通処理。
//
// 1ステップ＝1ページ。画面キャプチャ（shots）を縦に並べ、その上に赤枠（marks）を置く。
// 赤枠の番号と、右に並ぶ操作方法（items）の番号は同じものを指す。
//
// 番号は「画像の順 → その画像の中で置いた順」で 1 から通しで振り直す。
// PowerPoint で一番手が止まるのが番号の振り直しなので、ここは必ず自動で合わせる。

export type MarkBox = {
  /** 枠を識別するID（番号は並びから決まるので持たない） */
  id: string
  /** 画像に対する割合（0〜1） */
  x: number
  y: number
  w: number
  h: number
}

export type Shot = {
  id: string
  /** storage のパス（バケットは manual-images 固定） */
  path: string
  /**
   * この画面が誰向けの手順か。空＝全員。
   * 同じ章の中に受注担当と管理担当の手順が混ざるので、ページ単位ではなく画面単位で持つ。
   */
  roles?: string[]
  marks: MarkBox[]
}

export type StepItem = {
  /** 赤枠の番号と対応。並びから決まる */
  id: string
  body: string
  /** 業務ルール（任意）。必要な手順にだけ付ける */
  rule?: string | null
}

export type ManualStepRow = {
  id: string
  chapter: string
  title: string
  roles: string[]
  shots: Shot[]
  items: StepItem[]
  sort_order: number
  updated_at: string
}

export const MANUAL_BUCKET = 'manual-images'

/** 章。migration 237 で manual_chapters テーブルに持たせた（画面から足せる）。ここは初期値の控え。 */
export const DEFAULT_MANUAL_CHAPTERS = [
  '面談', '受注', '相続人調査', '財産調査', '遺産分割', '相続登記', '解約手続', '請求・入金', '納品', 'その他',
] as const

export type ManualChapterRow = { id: string; name: string; sort_order: number }

/** 誰向けの手順か */
export const MANUAL_ROLES = ['受注担当', '管理担当', '事務管理担当', '経理', '相続登記チーム'] as const

export const newId = () => Math.random().toString(36).slice(2, 10)

/** 枠を「画像の順 → 置いた順」に並べたもの。i+1 がその枠の番号になる */
export function flatMarks(shots: Shot[]): Array<{ shotId: string; mark: MarkBox }> {
  const out: Array<{ shotId: string; mark: MarkBox }> = []
  for (const s of shots) for (const m of s.marks) out.push({ shotId: s.id, mark: m })
  return out
}

/** その枠が何番か（1始まり）。見つからなければ 0 */
export function numberOf(shots: Shot[], markId: string): number {
  return flatMarks(shots).findIndex(x => x.mark.id === markId) + 1
}

/** 枠の数。操作方法の行数はこれに合わせる */
export const markCount = (shots: Shot[]) => flatMarks(shots).length

/**
 * その画像に対応する操作方法の範囲。
 * 画像と説明を同じ高さで横に並べるために使う（2枚目の画像の説明が1枚目の隣に来ると、
 * どの画像の話なのか読めなくなるため）。
 */
/** ページ全体の担当＝載っている画面の担当をまとめたもの（表示・絞り込み用に自動で決める） */
export function rolesOfShots(shots: Shot[]): string[] {
  const out: string[] = []
  for (const s of shots) for (const r of s.roles ?? []) if (!out.includes(r)) out.push(r)
  return out
}

export function itemRangeOf(shots: Shot[], shotIndex: number): { start: number; count: number } {
  let start = 0
  for (let i = 0; i < shotIndex; i++) start += shots[i].marks.length
  return { start, count: shots[shotIndex]?.marks.length ?? 0 }
}

/**
 * 枠の数に合わせて操作方法の行を足し引きする。
 * 枠を足したら空の行が増え、枠を消したらその番号の行が消える（以降が繰り上がる）。
 */
export function syncItems(shots: Shot[], items: StepItem[], removedIndex?: number): StepItem[] {
  const n = markCount(shots)
  let next = [...items]
  if (removedIndex != null && removedIndex >= 0 && removedIndex < next.length) {
    next.splice(removedIndex, 1)
  }
  while (next.length < n) next.push({ id: newId(), body: '', rule: null })
  if (next.length > n) next = next.slice(0, n)
  return next
}

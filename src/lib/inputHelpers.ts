// 数値入力用のユーティリティ。
// type="number" だと上下矢印が邪魔なので、type="text" + これらの関数で
// 全角→半角変換やカンマ除去を吸収する。

// 全角数字・全角小数点・全角カンマを半角に変換
export function normalizeNumberInput(s: string): string {
  return s
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[．。]/g, '.')
    .replace(/[，、]/g, ',')
    .replace(/[‐－―−ー]/g, '-')
    .trim()
}

// 入力文字列を整数として解釈する。
//   - 全角→半角変換
//   - カンマ除去
//   - 失敗時は 0
export function parseIntInput(s: string): number {
  const cleaned = normalizeNumberInput(s).replace(/,/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : 0
}

// 入力文字列を小数として解釈する。
export function parseFloatInput(s: string): number {
  const cleaned = normalizeNumberInput(s).replace(/,/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

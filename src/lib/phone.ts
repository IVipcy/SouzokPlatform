// 電話番号の正規化。保存はハイフンなし・半角数字だけ。
//   全角（０９０－…）や、勝手に入れたハイフン・空白・括弧は落とす。「+81」は 0 に戻す。
//   数字以外しか無ければ空（null で保存する側に任せる）。
export function normalizePhone(v: string | null | undefined): string {
  let s = (v ?? '').normalize('NFKC').trim()
  if (!s) return ''
  s = s.replace(/^\+81[-\s]?/, '0')
  return s.replace(/[^0-9]/g, '')
}

/** 表示用：090-1234-5678 / 03-1234-5678 のようにハイフンを入れる（保存値は触らない） */
export function formatPhone(v: string | null | undefined): string {
  const d = normalizePhone(v)
  if (!d) return ''
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return d.startsWith('03') || d.startsWith('06') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return d
}

// 西暦(YYYY-MM-DD)を和暦表記に変換する。役所申請では和暦が必要なため、生年月日等の表示に使う。
// 例: 1976-03-15 → 「昭和51年3月15日」、2019-05-01 → 「令和元年5月1日」

const ERAS: { name: string; start: string }[] = [
  { name: '令和', start: '2019-05-01' },
  { name: '平成', start: '1989-01-08' },
  { name: '昭和', start: '1926-12-25' },
  { name: '大正', start: '1912-07-30' },
  { name: '明治', start: '1868-01-25' },
]

/** YYYY-MM-DD を和暦に変換。範囲外・不正値は空文字を返す。 */
export function toWareki(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const [, y, mo, d] = m
  // ERAS は開始日の新しい順。dateStr 以前に始まった最初の元号がその日付の元号。
  const era = ERAS.find(e => dateStr >= e.start)
  if (!era) return ''
  const eraYear = Number(y) - Number(era.start.slice(0, 4)) + 1
  const yLabel = eraYear === 1 ? '元' : String(eraYear)
  return `${era.name}${yLabel}年${Number(mo)}月${Number(d)}日`
}

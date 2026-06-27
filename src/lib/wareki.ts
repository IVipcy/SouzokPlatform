// 西暦(YYYY-MM-DD)を和暦表記に変換する。役所申請では和暦が必要なため、生年月日等の表示に使う。
// 例: 1976-03-15 → 「昭和51年3月15日」、2019-05-01 → 「令和元年5月1日」

const ERAS: { name: string; start: string }[] = [
  { name: '令和', start: '2019-05-01' },
  { name: '平成', start: '1989-01-08' },
  { name: '昭和', start: '1926-12-25' },
  { name: '大正', start: '1912-07-30' },
  { name: '明治', start: '1868-01-25' },
]

// 和暦入力用の元号リスト（新しい順）。
export const ERA_NAMES = ERAS.map(e => e.name)

// ISO(YYYY-MM-DD) を 和暦パーツ（元号・和暦年・月・日）に分解。範囲外・不正は null。
export function toWarekiParts(dateStr: string | null | undefined): { era: string; year: number; month: number; day: number } | null {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  const era = ERAS.find(e => dateStr >= e.start)
  if (!era) return null
  return {
    era: era.name,
    year: Number(y) - Number(era.start.slice(0, 4)) + 1,
    month: Number(mo),
    day: Number(d),
  }
}

// 和暦パーツ → ISO(YYYY-MM-DD)。揃っていなければ空文字。
export function fromWarekiParts(era: string, year: number, month: number, day: number): string {
  const def = ERAS.find(e => e.name === era)
  if (!def || !year || !month || !day) return ''
  const gregorian = Number(def.start.slice(0, 4)) + year - 1
  return `${String(gregorian).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

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

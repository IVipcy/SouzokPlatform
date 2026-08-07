// 日本の祝日判定。営業日＝日曜と祝日を除く日（土曜は営業日）という運用に合わせて使う。
//
// 内閣府のCSVを取りに行くとネットワークに依存するので、法律どおりの計算で出す。
//   ・固定日の祝日
//   ・ハッピーマンデー（成人の日・海の日・敬老の日・スポーツの日）
//   ・春分の日／秋分の日（1980〜2099年で正しい近似式）
//   ・振替休日（祝日が日曜なら、その後の最初の平日）
//   ・国民の休日（祝日に挟まれた平日。例：敬老の日と秋分の日が1日空くとき）
// 祝日法の改正があったときはここだけ直せばよい。

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** その月の第n月曜（ハッピーマンデー） */
function nthMonday(year: number, month: number, nth: number): number {
  const first = new Date(year, month - 1, 1).getDay() // 0=日
  const firstMonday = 1 + ((8 - first) % 7)
  return firstMonday + (nth - 1) * 7
}

/** 春分の日（3月）／秋分の日（9月）。1980〜2099年で一致する近似式。 */
function equinoxDay(year: number, month: 3 | 9): number {
  const base = month === 3 ? 20.8431 : 23.2488
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

/** その年の祝日（振替休日・国民の休日を含む）を 'YYYY-MM-DD' の集合で返す */
function holidaysOfYear(year: number): Set<string> {
  const base: string[] = [
    ymd(year, 1, 1),                          // 元日
    ymd(year, 1, nthMonday(year, 1, 2)),      // 成人の日
    ymd(year, 2, 11),                         // 建国記念の日
    ymd(year, 2, 23),                         // 天皇誕生日
    ymd(year, 3, equinoxDay(year, 3)),        // 春分の日
    ymd(year, 4, 29),                         // 昭和の日
    ymd(year, 5, 3),                          // 憲法記念日
    ymd(year, 5, 4),                          // みどりの日
    ymd(year, 5, 5),                          // こどもの日
    ymd(year, 7, nthMonday(year, 7, 3)),      // 海の日
    ymd(year, 8, 11),                         // 山の日
    ymd(year, 9, nthMonday(year, 9, 3)),      // 敬老の日
    ymd(year, 9, equinoxDay(year, 9)),        // 秋分の日
    ymd(year, 10, nthMonday(year, 10, 2)),    // スポーツの日
    ymd(year, 11, 3),                         // 文化の日
    ymd(year, 11, 23),                        // 勤労感謝の日
  ]
  const set = new Set(base)

  // 振替休日：祝日が日曜なら、その後の最初の「祝日でない日」が休みになる
  for (const h of base) {
    const d = new Date(h + 'T00:00:00')
    if (d.getDay() !== 0) continue
    do { d.setDate(d.getDate() + 1) } while (set.has(ymd(d.getFullYear(), d.getMonth() + 1, d.getDate())))
    set.add(ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()))
  }

  // 国民の休日：祝日と祝日に挟まれた平日（日曜・振替でない日）
  for (const h of base) {
    const d = new Date(h + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    const mid = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate())
    if (set.has(mid) || d.getDay() === 0) continue
    d.setDate(d.getDate() + 1)
    if (set.has(ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()))) set.add(mid)
  }
  return set
}

const cache = new Map<number, Set<string>>()

/** 'YYYY-MM-DD' が祝日か */
export function isHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4))
  if (!Number.isFinite(year)) return false
  let set = cache.get(year)
  if (!set) { set = holidaysOfYear(year); cache.set(year, set) }
  return set.has(dateStr)
}

/** Date が休業日（日曜または祝日）か。土曜は営業日。 */
export function isNonBusinessDay(d: Date): boolean {
  if (d.getDay() === 0) return true
  return isHoliday(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
}

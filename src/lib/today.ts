// 「今日」の求め方をひとつにする。
//   new Date().toISOString().slice(0, 10) は UTC の日付になり、日本の朝9時前は前日になる。
//   画面・API とも必ずこの関数を使う（日本時間の YYYY-MM-DD）。
//   時刻のある値（created_at など）と比べるときは jstDayRange で UTC の範囲にしてから比べる。

export function todayJstYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** 日本時間の当月 'YYYY-MM' */
export function thisMonthJst(now: Date = new Date()): string {
  return todayJstYmd(now).slice(0, 7)
}

/** 'YYYY-MM-DD'（日本時間の1日）を UTC の ISO 範囲 [start, end) にする。timestamptz と比べるときに使う */
export function jstDayRange(ymd: string): { start: string; end: string } {
  const start = new Date(`${ymd}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** timestamptz の文字列を日本時間の 'YYYY-MM-DD' にする */
export function toJstYmd(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return todayJstYmd(d)
}

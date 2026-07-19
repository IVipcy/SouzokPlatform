// 住所文字列から市区町村（役所名）を切り出す。戸籍請求の「対象者→請求先」自動入力に使う。
// 完全な住所正規化ではなく、日本の一般的な住所を対象にした軽量パース（外れたら手で直す前提）。

// 本籍・住所の文字列から市区町村名を取り出す。
//   東京都墨田区石原1-2-3        → 墨田区
//   愛知県名古屋市中区栄3-1-1     → 名古屋市中区（政令市は市＋区）
//   長野県北佐久郡軽井沢町長倉…   → 軽井沢町（郡は役所名に含めない）
//   長野県長野市鶴賀…            → 長野市
export function municipalityFromAddress(address: string | null | undefined): string | null {
  const a = (address ?? '').trim()
  if (!a) return null
  // 都道府県を除去
  let rest = a.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
  // 郡を除去（郡は役所・役場の名称に含めない）
  rest = rest.replace(/^.+?郡/, '')
  // 政令市（市＋区）は「市＋区」まで、それ以外は最初の市/区/町/村まで
  const m = rest.match(/^(.+?市.+?区|.+?[市区町村])/)
  return m ? m[1] : null
}

// 本籍の住所から戸籍請求先（◯◯役所／◯◯役場）を組み立てる。市・区は「役所」、町・村は「役場」。
export function kosekiOfficeFromAddress(address: string | null | undefined): string | null {
  const muni = municipalityFromAddress(address)
  if (!muni) return null
  const suffix = /[町村]$/.test(muni) ? '役場' : '役所'
  return `${muni}${suffix}`
}

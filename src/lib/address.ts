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

// ───────── 入力ルール（都道府県から書く・数字は半角） ─────────
/** 全角の英数字・記号を半角に。ハイフン類は半角ハイフンへ。前後の空白は削る。 */
export function normalizeAddress(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // 全角ハイフン類 → 半角ハイフン。カタカナの長音「ー」は建物名（メール棟 等）で使うので触らない。
    .replace(/[－―‐−]/g, '-')
    .replace(/　/g, ' ')             // 全角スペース → 半角
    .replace(/ {2,}/g, ' ')
    .trim()
}

export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
  '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const

/** 都道府県から始まっているか */
export const startsWithPrefecture = (v: string | null | undefined): boolean =>
  PREFECTURES.some(p => (v ?? '').trim().startsWith(p))

/** 都道府県から始まっていないときの注意文。問題なければ null。 */
export function addressHint(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  if (s.length < 4) return null            // 空・入力途中は言わない
  if (startsWithPrefecture(s)) return null
  return '都道府県から入力してください（例：埼玉県さいたま市大宮区1-4-1）'
}

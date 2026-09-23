// 金融機関名の突き合わせ用の正規化。
// 来店予約のシートに打った名前（三菱ＵＦＪ銀行・みずほ銀行 など）と、調査先に登録した名前を同じものとして扱うため。
// 全角半角・空白・「株式会社」を落とし、末尾の「銀行／信用金庫」の有無も無視して比べる。
export function normalizeBankName(v: string | null | undefined): string {
  return (v ?? '').normalize('NFKC').replace(/[\s　]/g, '').replace(/株式会社|\(株\)|㈱/g, '').toLowerCase()
}
/** 業態の言葉（横浜銀行 と 横浜信用金庫 は別の機関。名前の残りが同じでも業態が違えば別と見る） */
const BANK_KINDS: Array<[RegExp, string]> = [
  [/信用金庫|信金/, '信用金庫'], [/信用組合|信組/, '信用組合'], [/労働金庫|ろうきん/, '労働金庫'],
  [/農業協同組合|農協|ja/, '農協'], [/信託銀行/, '信託銀行'], [/銀行/, '銀行'], [/証券/, '証券'], [/ゆうちょ|郵便局/, 'ゆうちょ'],
]
function kindsOf(s: string): Set<string> {
  const out = new Set<string>()
  for (const [re, k] of BANK_KINDS) if (re.test(s)) out.add(k)
  // 信託銀行は「銀行」にも当たるので、信託銀行があるときは銀行を外して1つにする
  if (out.has('信託銀行')) out.delete('銀行')
  return out
}
/** 同じ金融機関とみなすか（正規化して一致、または片方がもう片方を含む）。業態が両方に書いてあって違えば不一致 */
export function sameBank(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeBankName(a), y = normalizeBankName(b)
  if (!x || !y) return false
  if (x === y) return true
  const kx = kindsOf(x), ky = kindsOf(y)
  if (kx.size > 0 && ky.size > 0 && ![...kx].some(k => ky.has(k))) return false
  const strip = (s: string) => s.replace(/(信託銀行|銀行|信用金庫|信用組合|信金|信組|労働金庫|証券|支店.*)$/g, '')
  const sx = strip(x), sy = strip(y)
  return !!sx && !!sy && (sx === sy || x.includes(y) || y.includes(x))
}

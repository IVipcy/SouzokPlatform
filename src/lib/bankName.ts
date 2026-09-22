// 金融機関名の突き合わせ用の正規化。
// 来店予約のシートに打った名前（三菱ＵＦＪ銀行・みずほ銀行 など）と、調査先に登録した名前を同じものとして扱うため。
// 全角半角・空白・「株式会社」を落とし、末尾の「銀行／信用金庫」の有無も無視して比べる。
export function normalizeBankName(v: string | null | undefined): string {
  return (v ?? '').normalize('NFKC').replace(/[\s　]/g, '').replace(/株式会社|\(株\)|㈱/g, '').toLowerCase()
}
/** 同じ金融機関とみなすか（正規化して一致、または片方がもう片方を含む） */
export function sameBank(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeBankName(a), y = normalizeBankName(b)
  if (!x || !y) return false
  if (x === y) return true
  const strip = (s: string) => s.replace(/(銀行|信用金庫|信用組合|信金|支店.*)$/g, '')
  const sx = strip(x), sy = strip(y)
  return !!sx && !!sy && (sx === sy || x.includes(y) || y.includes(x))
}

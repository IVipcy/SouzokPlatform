// 氏名の入力ルール。
//
// 姓と名のあいだは全角スペース1つに揃える。書類（戸籍請求書・委任状・封筒の宛名）は
// 氏名を1行で印字するので、項目は分けずに1つの文字列で持ち、区切りだけ揃える方針。
// 揃っていないと、氏名での検索・入金の突合・重複チェックが「スペースの入れ方」でブレる。
//
// スペースが無いときは注意文を出すが、保存は止めない。
// 受遺者の法人名や外国籍の方の氏名など、姓名に割れないものが実際に入るため。

/** 半角スペース・連続スペースを全角スペース1つに揃え、前後は削る。 */
export function normalizePersonName(v: string | null | undefined): string {
  return (v ?? '').replace(/[\s　]+/g, '　').trim()
}

// 法人・団体っぽい名前（姓名に割れないので注意文を出さない）
const ENTITY_WORDS = ['会社', '法人', '銀行', '信用金庫', '信用組合', '組合', '財団', '社団', '協会', '基金', '学園', '寺', '神社', '教会', 'ホールディングス']

/** 姓と名の区切りが無いときの注意文。問題なければ null。 */
export function personNameHint(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  if (s.length < 2) return null                       // 空・1文字は判定しない
  if (s.includes('　') || s.includes(' ')) return null // 区切りがある
  if (ENTITY_WORDS.some(w => s.includes(w))) return null
  return '姓と名のあいだに全角スペースを入れてください（例：福島　太郎）'
}

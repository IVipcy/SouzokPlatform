// 登記情報（txt）の読み取り。
// リーガル（登記情報提供サービス）の「最新の記載事項」txt は次の型で来る（Shift-JIS・全角数字）。
//   ［表題部］ 項目名　値（不動産番号／所在／地番／地目／地積、建物は 家屋番号／種類／構造／床面積）
//   ［所有者］ 住所　氏名　持分
//   ［甲区］   所有権の履歴（使わない。現在の所有者は［所有者］にある）
//   ［乙区］   抵当権など（最新事項なので抹消済みは載らない）
//   ［管轄登記所］ 法務局名
// 現在事項なので OCR も AI も要らない。文字の切り出しだけで読む。
// 建物の型はまだ実物を見ていないので、家屋番号・種類・構造・床面積の見出しで拾う（違えば見出しを足す）。

export type ToukiOwner = { address: string; name: string; num: number; den: number }
export type ParsedTouki = {
  fileName: string
  kind: '土地' | '建物'
  propertyNumber: string
  address: string           // 所在
  lotNumber: string         // 地番（土地）
  kaokuBango: string        // 家屋番号（建物）
  landCategory: string
  landArea: number | null
  buildingKind: string
  structure: string
  floorArea: string         // 「95.20」または「1階 50.00 2階 40.00」
  owners: ToukiOwner[]
  mortgages: string[]       // 乙区の各事項（1行目）
  registryOffice: string
  isCondo: boolean          // 敷地権の記載あり（区分所有）
  raw: string
  /** 読めなかった・怪しい点 */
  warnings: string[]
}

/** Shift-JIS で読み、だめなら UTF-8。全角英数・記号は半角に寄せる（名前の漢字は変わらない） */
export function decodeToukiTxt(buf: ArrayBuffer): string {
  const tryDec = (enc: string) => { try { return new TextDecoder(enc, { fatal: false }).decode(buf) } catch { return '' } }
  const bad = (s: string) => (s.match(/�/g) ?? []).length
  const sjis = tryDec('shift_jis'), utf8 = tryDec('utf-8')
  // UTF-8 で読めて（置換文字が無く）日本語が入っていればそちら。そうでなければ Shift-JIS
  const text = utf8 && bad(utf8) === 0 && /[぀-鿿]/.test(utf8) ? utf8 : sjis || utf8
  return text.normalize('NFKC').replace(/\r\n?/g, '\n')
}

const KEYS: Array<[keyof ParsedTouki | 'floorAreaRaw' | 'landAreaRaw' | 'sitiken', string]> = [
  ['propertyNumber', '不動産番号'], ['address', '所在'], ['lotNumber', '地番'], ['landCategory', '地目'], ['landAreaRaw', '地積'],
  ['kaokuBango', '家屋番号'], ['buildingKind', '種類'], ['structure', '構造'], ['floorAreaRaw', '床面積'],
  ['sitiken', '敷地権の種類'], ['sitiken', '敷地権の割合'], ['sitiken', '敷地権の目的である土地の表示'],
]
const keyRe = (label: string) => new RegExp(`^\\s*${[...label].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')}\\s+(.+)$`)

const fraction = (s: string): { num: number; den: number } | null => {
  const m = s.match(/(\d+)\s*分の\s*(\d+)/)
  return m ? { den: Number(m[1]), num: Number(m[2]) } : null
}
const numBefore = (s: string, unit: string): number | null => {
  const m = s.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${unit}`))
  return m ? Number(m[1].replace(/,/g, '')) : null
}

export function parseToukiTxt(text: string, fileName: string): ParsedTouki {
  const lines = text.split('\n')
  const sections: Record<string, string[]> = {}
  let cur = ''
  for (const ln of lines) {
    const h = ln.trim().match(/^\[(.+?)\]$/)
    if (h) { cur = h[1].replace(/\s/g, ''); sections[cur] = sections[cur] ?? []; continue }
    if (cur) sections[cur].push(ln)
  }
  const warnings: string[] = []
  const out: ParsedTouki = {
    fileName, kind: '土地', propertyNumber: '', address: '', lotNumber: '', kaokuBango: '', landCategory: '', landArea: null,
    buildingKind: '', structure: '', floorArea: '', owners: [], mortgages: [], registryOffice: '', isCondo: false, raw: text, warnings,
  }
  // 表題部：見出し＋値。見出しに当たらない行は前の値の続き（床面積の2階以降など）
  const title = sections['表題部'] ?? []
  const vals: Record<string, string> = {}
  let lastKey = ''
  for (const ln of title) {
    if (!ln.trim()) continue
    let hit = false
    for (const [k, label] of KEYS) {
      const m = ln.match(keyRe(label))
      if (m) { vals[k] = ((vals[k] ?? '') + ' ' + m[1].trim()).trim(); lastKey = k; hit = true; break }
    }
    if (!hit && lastKey) vals[lastKey] = `${vals[lastKey]} ${ln.trim()}`.trim()
  }
  out.propertyNumber = (vals.propertyNumber ?? '').replace(/\s/g, '')
  out.address = (vals.address ?? '').trim()
  out.lotNumber = (vals.lotNumber ?? '').replace(/\s/g, '')
  out.kaokuBango = (vals.kaokuBango ?? '').replace(/\s/g, '')
  out.landCategory = (vals.landCategory ?? '').trim()
  out.buildingKind = (vals.buildingKind ?? '').trim()
  out.structure = (vals.structure ?? '').trim()
  out.landArea = vals.landAreaRaw ? numBefore(vals.landAreaRaw, '平方メートル') ?? numBefore(vals.landAreaRaw, '㎡') : null
  if (vals.floorAreaRaw) {
    const t = vals.floorAreaRaw.replace(/平方メートル/g, '').replace(/㎡/g, '').replace(/\s+/g, ' ').trim()
    out.floorArea = t
  }
  out.isCondo = !!vals.sitiken
  out.kind = out.kaokuBango || out.buildingKind || out.structure || out.floorArea ? '建物' : '土地'
  if (!out.address) warnings.push('所在が読めませんでした')
  if (out.kind === '土地' && !out.lotNumber) warnings.push('地番が読めませんでした')
  if (out.kind === '建物' && !out.kaokuBango) warnings.push('家屋番号が読めませんでした')
  if (out.isCondo) warnings.push('敷地権の記載があります（区分所有）。土地の持分は手で確認してください')

  // 所有者：住所　氏名　持分（持分が無ければ単独＝1/1）
  for (const ln of sections['所有者'] ?? []) {
    const t = ln.trim()
    if (!t) continue
    const toks = t.split(/\s+/)
    if (toks.length < 2) continue
    // 持分は末尾とは限らない（「住所　持分2分の1　山田太郎」の並びもある）。分数に読める語を行のどこからでも1つ抜く
    let fr: ReturnType<typeof fraction> = null
    let frIdx = -1
    for (let i = 1; i < toks.length; i++) { const f = fraction(toks[i]); if (f) { fr = f; frIdx = i; break } }
    const nameToks = toks.slice(1).filter((_, i) => i + 1 !== frIdx)
    const name = nameToks.join('').trim()
    if (!name) continue
    out.owners.push({ address: toks[0], name, num: fr?.num ?? 1, den: fr?.den ?? 1 })
  }
  if (out.owners.length === 0) warnings.push('［所有者］が読めませんでした（甲区を目で確認してください）')

  // 乙区：順位番号で始まる行が1つの事項。1行目（目的＋受付）だけ残す
  for (const ln of sections['乙区'] ?? []) {
    const m = ln.trim().match(/^\d+\s+(.+)$/)
    if (m) out.mortgages.push(m[1].trim())
  }
  out.registryOffice = (sections['管轄登記所'] ?? []).map(l => l.trim()).find(Boolean) ?? ''
  return out
}

/** 突き合わせ・照合用（空白・全角半角を無視、「番地」→「番」） */
export const normKey = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s/g, '').replace(/番地/g, '番').replace(/の/g, '-')
export const normName = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s/g, '')

/** 所在から市区町村（RealEstateTable と同じ切り方） */
export function municipalityFromAddress(address: string): string {
  const x = address.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return x ? `${x[1] ?? ''}${x[2]}` : ''
}

/** 被相続人の持分（名前が一致する所有者の合計）。誰も一致しなければ null */
export function deceasedShare(owners: ToukiOwner[], deceasedName: string | null | undefined): { num: number; den: number } | null {
  const dn = normName(deceasedName)
  if (!dn) return null
  const mine = owners.filter(o => normName(o.name) === dn)
  if (mine.length === 0) return null
  const den = mine.reduce((l, o) => lcm(l, o.den), 1)
  const num = mine.reduce((s, o) => s + o.num * (den / o.den), 0)
  const g = gcd(num, den)
  return { num: num / g, den: den / g }
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const lcm = (a: number, b: number) => (a * b) / gcd(a, b)

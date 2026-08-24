/**
 * ExcelJS が書き出した xlsx を、Excel が開ける形に直す。
 *
 * ExcelJS には <sheetPr> の子要素を規格と違う順序で書き出すバグがある。
 *   規格（CT_SheetPr）… tabColor → outlinePr → pageSetUpPr
 *   ExcelJS の出力    … tabColor → pageSetUpPr → outlinePr
 *
 * 順序が違うと Excel はシート全体を「読み取れないパーツ」として捨てるため、
 *   「'○○.xlsx' の修復 … 置き換えられたパーツ: /xl/worksheets/sheet1.xml」
 * と出たうえで中身が白紙になる。ひな型に tabColor と outlinePr と pageSetUpPr が
 * 揃っているものだけで起きるので、書類によって出たり出なかったりしていた。
 *
 * ExcelJS 側は直せないので、書き出したあとに zip を開いて順序だけ入れ替える。
 */
import PizZip from 'pizzip'

/** <sheetPr> の中で pageSetUpPr が outlinePr より前にあれば入れ替える */
function fixSheetPr(xml: string): string {
  return xml.replace(/<sheetPr>([\s\S]*?)<\/sheetPr>/g, (whole, inner: string) => {
    const page = inner.match(/<pageSetUpPr[^>]*\/>/)
    const outline = inner.match(/<outlinePr[^>]*\/>/)
    if (!page || !outline) return whole
    // 既に規格どおり（outlinePr が先）なら触らない
    if (inner.indexOf(outline[0]) < inner.indexOf(page[0])) return whole
    const rest = inner.replace(page[0], '').replace(outline[0], '')
    return `<sheetPr>${rest}${outline[0]}${page[0]}</sheetPr>`
  })
}

/**
 * ExcelJS の writeBuffer() の結果を受け取り、Excel が開ける形に直して返す。
 * 直す必要がなければ中身はそのまま（ zip を組み直すだけ）。
 */
export function repairXlsx(buffer: Buffer): Buffer {
  try {
    const zip = new PizZip(buffer)
    let changed = false
    for (const name of Object.keys(zip.files)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
      const xml = zip.file(name)?.asText()
      if (!xml) continue
      const fixed = fixSheetPr(xml)
      if (fixed !== xml) { zip.file(name, fixed); changed = true }
    }
    if (!changed) return buffer
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch {
    // 直せなくても元のファイルは返す（生成そのものは止めない）
    return buffer
  }
}

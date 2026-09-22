// 郵便番号 ⇄ 住所。
//   lookupPostalAddress … 郵便番号 → 住所（zipcloud。CORS対応。番地・建物名は利用者が追記）
//   lookupZipFromAddress … 住所 → 郵便番号（自前のAPI経由。町名まで入っていれば引ける）

export async function lookupPostalAddress(zip: string | null | undefined): Promise<string | null> {
  const z = (zip ?? '').replace(/[^0-9]/g, '')
  if (z.length !== 7) return null
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${z}`)
    if (!res.ok) return null
    const data = await res.json() as { results?: Array<{ address1: string; address2: string; address3: string }> | null }
    const r = data?.results?.[0]
    if (!r) return null
    return `${r.address1}${r.address2}${r.address3}`
  } catch {
    return null
  }
}

/** 住所（都道府県〜町名・番地）から郵便番号7桁を引く。見つからなければ null */
export async function lookupZipFromAddress(address: string | null | undefined): Promise<string | null> {
  const a = (address ?? '').trim()
  if (a.length < 4) return null
  try {
    const res = await fetch(`/api/postal/reverse?address=${encodeURIComponent(a)}`)
    if (!res.ok) return null
    const data = await res.json() as { zip?: string | null }
    return data.zip ?? null
  } catch {
    return null
  }
}

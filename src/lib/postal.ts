// 郵便番号 → 住所（都道府県＋市区町村＋町域）の自動補完。
// 無料の zipcloud API（CORS対応）を使う。番地・建物名は利用者が追記する前提。

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

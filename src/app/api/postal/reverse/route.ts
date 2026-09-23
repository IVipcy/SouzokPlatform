/**
 * 住所 → 郵便番号。
 * ExcelAPI（https://api.excelapi.org/post/zipcode?address=…）に問い合わせる。無料・キー不要。
 * ブラウザから直接だと CORS で止まることがあるのでサーバー経由にする。
 * 見つからなければ zip=null（400 にはしない。画面側で「見つからない」と出す）。
 * 外部が応答しないときは 5 秒で打ち切って 504（住所欄が固まったままにならないように）。
 */
import { NextRequest, NextResponse } from 'next/server'

const TIMEOUT_MS = 5000

export async function GET(request: NextRequest) {
  const address = (request.nextUrl.searchParams.get('address') ?? '').trim()
  if (address.length < 4) return NextResponse.json({ zip: null })
  try {
    const res = await fetch(`https://api.excelapi.org/post/zipcode?address=${encodeURIComponent(address)}`, {
      headers: { Accept: 'text/plain' }, cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return NextResponse.json({ zip: null })
    const text = (await res.text()).trim()
    const digits = text.replace(/[^0-9]/g, '')
    return NextResponse.json({ zip: digits.length === 7 ? digits : null })
  } catch (e) {
    // AbortSignal.timeout は TimeoutError（環境により AbortError）で落ちる。外部の都合なので 504
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      return NextResponse.json({ zip: null, error: '郵便番号の検索がタイムアウトしました。手で入力してください' }, { status: 504 })
    }
    return NextResponse.json({ zip: null })
  }
}

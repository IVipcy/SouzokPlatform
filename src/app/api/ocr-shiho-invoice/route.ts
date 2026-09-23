import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, rateLimitMessage } from '@/lib/rateLimit'

// 司法書士（相続の力）の請求書画像 → 明細（種別/報酬額/登録免許税又は印紙税）＋郵送料・システム利用料 を構造化抽出。
// 請求タブの「司法書士請求書 読込・反映」から呼ばれ、司法の報酬内訳・立替実費へ反映する。
// 受け取り: { image: dataURL(png/jpeg) }
// 返し: { items: [{ type, reward, tax }], expense }  ／ または { error }
export const runtime = 'nodejs'

type ImgMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export async function POST(req: NextRequest) {
  // ミドルウェアだけに頼らず、AI を呼ぶ前にここでもログインを確かめる（課金が発生するため）
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  const rl = rateLimit(`ocr-shiho-invoice:${user.memberId ?? user.id}`, { limit: 20 })
  if (!rl.ok) return NextResponse.json({ error: rateLimitMessage(rl) }, { status: 429 })

  try {
    const { image } = (await req.json()) as { image?: string }
    if (!image) return NextResponse.json({ error: '画像が必要です' }, { status: 400 })
    const m = image.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
    if (!m) return NextResponse.json({ error: '画像形式が不正です（PNG/JPEGの画像をアップしてください。PDFは画像化してください）' }, { status: 400 })
    const mediaType = m[1] as ImgMediaType
    const data = m[2]

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[ocr-shiho-invoice] ANTHROPIC_API_KEY が未設定')
      return NextResponse.json({ error: 'AI機能の設定が完了していません。管理者に連絡してください' }, { status: 500 })
    }

    const prompt = [
      'これは司法書士法人が発行した相続手続きの請求書の画像です。次を読み取り、JSONのみで返してください。',
      '',
      '【明細（表の各行）】"items"：配列。表の「区分/種別」ごとに1要素。各要素：',
      '  ・"type"（種別＝行の名称。例: 持分全部移転（相続）／完了後登記簿謄本 など、原文のまま）',
      '  ・"reward"（報酬額＝「報酬額」列の数値。カンマ・円を除く。空欄や0は 0）',
      '  ・"tax"（登録免許税又は印紙税＝「登録免許税又は印紙税」列の数値。カンマ・円を除く。空欄は 0）',
      '',
      '【その他費用】"expense"（数値）：「郵送料・システム利用料」などの立替実費の合計（消費税を含む税込金額。表の その他費用 小計）。無ければ 0。',
      '',
      'ルール：',
      '- 返すのは JSON のみ（前置き・説明・コードフェンスなし）。',
      '- 形式: { "items": [ { "type": "…", "reward": 50000, "tax": 21500 }, … ], "expense": 3300 }',
      '- 「小計」「合計」「消費税」「源泉徴収」「差引請求額」「前受金」などの集計行は items に含めない（明細行だけ）。',
      '- 数値は半角の整数。読めない項目は 0 か 空文字。',
    ].join('\n')

    const anthropic = new Anthropic({ apiKey })
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: prompt },
        ],
      }],
    })
    const raw = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let parsed: { items?: Array<{ type?: string; reward?: number | string; tax?: number | string }>; expense?: number | string }
    try { parsed = JSON.parse(jsonStr) } catch { return NextResponse.json({ error: '読み取り結果を解釈できませんでした。もう一度お試しください。' }, { status: 502 }) }

    const num = (v: unknown): number => {
      if (typeof v === 'number') return Math.round(v)
      const s = String(v ?? '').replace(/[^\d.-]/g, '')
      const n = Number(s)
      return Number.isFinite(n) ? Math.round(n) : 0
    }
    const items = (parsed.items ?? []).map(it => ({ type: String(it.type ?? '').trim(), reward: num(it.reward), tax: num(it.tax) }))
      .filter(it => it.type || it.reward || it.tax)
    return NextResponse.json({ items, expense: num(parsed.expense) })
  } catch (e) {
    // 例外の生文言（APIキーやURLが混ざることがある）は利用者に返さず、ログにだけ残す
    console.error('[ocr-shiho-invoice] error:', e)
    return NextResponse.json({ error: '読み取りに失敗しました。時間をおいてもう一度お試しください' }, { status: 500 })
  }
}

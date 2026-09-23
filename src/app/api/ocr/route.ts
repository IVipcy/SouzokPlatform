import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, rateLimitMessage } from '@/lib/rateLimit'

// 手書きメモ画像 → テキスト（Claudeのvisionで文字起こし）。面談シート(仮)のメモから呼ばれる。
// 受け取り: { image: "data:image/png;base64,...." } / 返し: { text } または { error }
export const runtime = 'nodejs'

type ImgMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export async function POST(req: NextRequest) {
  // ミドルウェアだけに頼らず、AI を呼ぶ前にここでもログインを確かめる（課金が発生するため）
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  const rl = rateLimit(`ocr:${user.memberId ?? user.id}`, { limit: 20 })
  if (!rl.ok) return NextResponse.json({ error: rateLimitMessage(rl) }, { status: 429 })

  try {
    const { image } = (await req.json()) as { image?: string }
    if (!image) return NextResponse.json({ error: '画像がありません' }, { status: 400 })

    const m = image.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
    if (!m) return NextResponse.json({ error: '画像形式が不正です' }, { status: 400 })
    const mediaType = m[1] as ImgMediaType
    const data = m[2]

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[ocr] ANTHROPIC_API_KEY が未設定')
      return NextResponse.json({ error: 'AI機能の設定が完了していません。管理者に連絡してください' }, { status: 500 })
    }

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            {
              type: 'text',
              text: 'これは面談メモの手書き画像です。書かれている日本語の文字をそのまま文字起こししてください。前置き・説明・注釈は一切付けず、認識したテキストだけを返してください。改行はそのまま反映して構いません。ほとんど判読できない場合のみ「（判読不可）」と返してください。',
            },
          ],
        },
      ],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    return NextResponse.json({ text })
  } catch (e) {
    // 例外の生文言（APIキーやURLが混ざることがある）は利用者に返さず、ログにだけ残す
    console.error('[ocr] error:', e)
    return NextResponse.json({ error: '文字起こしに失敗しました。時間をおいてもう一度お試しください' }, { status: 500 })
  }
}

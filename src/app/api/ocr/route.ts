import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// 手書きメモ画像 → テキスト（Claudeのvisionで文字起こし）。面談シート(仮)のメモから呼ばれる。
// 受け取り: { image: "data:image/png;base64,...." } / 返し: { text } または { error }
export const runtime = 'nodejs'

type ImgMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export async function POST(req: NextRequest) {
  try {
    const { image } = (await req.json()) as { image?: string }
    if (!image) return NextResponse.json({ error: '画像がありません' }, { status: 400 })

    const m = image.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
    if (!m) return NextResponse.json({ error: '画像形式が不正です' }, { status: 400 })
    const mediaType = m[1] as ImgMediaType
    const data = m[2]

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEYが未設定です' }, { status: 500 })

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
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

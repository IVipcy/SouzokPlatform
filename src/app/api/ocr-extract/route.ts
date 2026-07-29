import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// 手書きメモ画像 or テキスト ＋ 項目リスト → 各項目の値を構造化抽出（Claude）。
// 面談シートの「AIで項目に反映」から呼ばれ、返った値を各フィールドに自動入力する。
// 受け取り: { image?, text?, fields:[{key,label,enum?,type?}] } / 返し: { values:{key:value} } または { error }
export const runtime = 'nodejs'

type Field = { key: string; label: string; enum?: string[]; type?: 'text' | 'date' }
type ImgMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export async function POST(req: NextRequest) {
  try {
    const { image, text, fields } = (await req.json()) as { image?: string; text?: string; fields?: Field[] }
    if (!image && !(text && text.trim())) return NextResponse.json({ error: '画像またはテキストが必要です' }, { status: 400 })
    if (!fields || fields.length === 0) return NextResponse.json({ error: '項目がありません' }, { status: 400 })

    let mediaType: ImgMediaType | null = null
    let data: string | null = null
    if (image) {
      const m = image.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
      if (!m) return NextResponse.json({ error: '画像形式が不正です' }, { status: 400 })
      mediaType = m[1] as ImgMediaType
      data = m[2]
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEYが未設定です' }, { status: 500 })

    const fieldLines = fields.map(f => {
      const parts = [`- "${f.key}"（${f.label}）`]
      if (f.type === 'date') parts.push('：日付は YYYY-MM-DD 形式')
      if (f.enum && f.enum.length) parts.push(`：次のいずれか [${f.enum.join(' / ')}]`)
      return parts.join('')
    }).join('\n')

    const isImage = !!image
    const promptLines = [
      isImage
        ? 'これは面談メモの手書き画像です。書かれている内容から、次の項目の値を読み取ってJSONで返してください。'
        : 'これは面談中に入力されたメモテキストです。書かれている内容から、次の項目の値を読み取ってJSONで返してください。',
      '項目（キー＝意味）:',
      fieldLines,
      '',
      'ルール：',
      '- 返すのは {"key": "値", ...} 形式のJSONのみ（前置き・説明・コードフェンスなし）。',
      isImage
        ? '- 画像から読み取れない項目はキーごと省略する（推測で埋めない）。'
        : '- テキストに書かれていない項目はキーごと省略する（推測で埋めない）。',
      '- 日付指定の項目は YYYY-MM-DD。和暦（令和/平成/昭和）で書かれていれば西暦に直す。',
      '- 選択肢（[...]）指定の項目は、その中で最も近いものを選ぶ。当てはまらなければ省略。',
      '- 氏名・ふりがな・住所などはできるだけ原文どおり。',
    ]
    if (!isImage) promptLines.push('', 'メモ本文:', '"""', String(text ?? ''), '"""')
    const prompt = promptLines.join('\n')

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: isImage && data && mediaType
          ? [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: prompt },
            ]
          : [ { type: 'text', text: prompt } ] },
      ],
    })

    const raw = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim()
    // 説明文が前後に付いても JSON 本体（最初の { 〜 最後の }）を取り出す。コードフェンスも除去。
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const braceMatch = stripped.match(/\{[\s\S]*\}/)
    const jsonText = braceMatch ? braceMatch[0] : stripped
    let values: Record<string, string> = {}
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const allowed = new Set(fields.map(f => f.key))
      for (const [k, v] of Object.entries(parsed)) {
        if (allowed.has(k) && (typeof v === 'string' || typeof v === 'number') && String(v).trim()) values[k] = String(v).trim()
      }
    } catch {
      values = {}
    }
    return NextResponse.json({ values })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

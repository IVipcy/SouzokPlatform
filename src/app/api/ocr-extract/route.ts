import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// 手書きメモ画像 or テキスト ＋ 項目リスト → 各項目の値を構造化抽出（Claude）。
// 面談シートの「AIで項目に反映」から呼ばれ、返った値を各フィールドに自動入力する。
// 受け取り: { image?, text?, fields:[{key,label,enum?,type?}], rowGroups?: [{key,label,fields:[...]}] }
// 返し: { values:{key:value}, rows: {groupKey: [row,...]} } または { error }
export const runtime = 'nodejs'

type Field = { key: string; label: string; enum?: string[]; type?: 'text' | 'date' | 'number' }
type RowGroup = { key: string; label: string; fields: Field[] }
type ImgMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export async function POST(req: NextRequest) {
  try {
    const { image, text, fields, rowGroups } = (await req.json()) as { image?: string; text?: string; fields?: Field[]; rowGroups?: RowGroup[] }
    if (!image && !(text && text.trim())) return NextResponse.json({ error: '画像またはテキストが必要です' }, { status: 400 })
    const hasSingles = fields && fields.length > 0
    const hasRows = rowGroups && rowGroups.length > 0
    if (!hasSingles && !hasRows) return NextResponse.json({ error: '項目がありません' }, { status: 400 })

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

    const describeField = (f: Field): string => {
      const parts = [`"${f.key}"（${f.label}）`]
      if (f.type === 'date') parts.push('：日付は YYYY-MM-DD 形式')
      if (f.type === 'number') parts.push('：数値のみ（カンマや円は取り除く）')
      if (f.enum && f.enum.length) parts.push(`：次のいずれか [${f.enum.join(' / ')}]`)
      return parts.join('')
    }
    const fieldLines = (fields ?? []).map(f => `- ${describeField(f)}`).join('\n')

    // 行データ（rowGroups）：AI応答は { "<groupKey>": [ {field:value,...}, ... ] } 形式で返す。
    const rowGroupLines = (rowGroups ?? []).map(g => {
      const inner = g.fields.map(f => `    ・${describeField(f)}`).join('\n')
      return `- "${g.key}"（${g.label}）：配列。各要素の項目：\n${inner}`
    }).join('\n')

    const isImage = !!image
    const promptLines = [
      isImage
        ? 'これは面談メモの手書き画像です。書かれている内容から、次の項目の値を読み取ってJSONで返してください。'
        : 'これは面談中に入力されたメモテキストです。書かれている内容から、次の項目の値を読み取ってJSONで返してください。',
    ]
    if (hasSingles) {
      promptLines.push('【単一項目】', fieldLines)
    }
    if (hasRows) {
      promptLines.push('', '【行データ（配列で複数返す）】', rowGroupLines)
    }
    promptLines.push(
      '',
      'ルール：',
      '- 返すのは JSON のみ（前置き・説明・コードフェンスなし）。',
      hasSingles && hasRows
        ? '- 形式: { "<単一項目key>": "値", ..., "<行データgroupKey>": [ {...}, ... ] }。単一項目と行データを1つのJSONに混ぜて返す。'
        : hasRows
          ? '- 形式: { "<行データgroupKey>": [ {...}, {...}, ... ] }。'
          : '- 形式: { "<key>": "値", ... }。',
      isImage
        ? '- 画像から読み取れない項目はキー（または要素）ごと省略する（推測で埋めない）。'
        : '- テキストに書かれていない項目はキー（または要素）ごと省略する（推測で埋めない）。',
      // 面談メモには家系図が手描きされることが多い。文字を並べただけでは
      // 「誰が誰の子か」が失われるため、画像のときは図の構造も手掛かりにさせる。
      ...(isImage ? [
        '- 手描きの家系図（人物を線でつないだ図）が描かれている場合は、線のつながりと配置も読み取る。',
        '  横の二重線＝婚姻、線上の×＝離婚（前妻・前夫）、縦線でぶら下がる人物＝その夫婦の子。',
        '  上の世代ほど上に、同じ世代は横に並ぶ。図中に「長男」「二女」等の記載があればそのまま続柄に使う。',
        '  記載が無くても、並び順（左が年長）から 長男・二男・長女・二女 を推定してよい。',
        '  被相続人（本人）は二重枠や「被」などで示されることが多く、相続人一覧には入れない。',
      ] : []),
      '- 行データは、メモに書かれている件数分だけ返す（無ければ空配列）。同じ物件・口座・人が2度出てくる場合は1件にまとめる。',
      // 面談メモは和暦で書かれることが多く、手書きでは略記（S30.5.1 / H2.11.3 など）も頻出する。
      '- 日付指定の項目は必ず YYYY-MM-DD（西暦）で返す。和暦は西暦に直す。',
      '  和暦は 令和/平成/昭和/大正/明治 のほか、R・H・S・T・M の略記もある（例：S30.5.1→1955-05-01、H2年11月3日→1990-11-03、R元年5月1日→2019-05-01）。',
      '  「元年」は1年として扱う。年だけ・月までしか書かれていない場合は、その項目を省略する（日を勝手に補わない）。',
      '- 数値指定の項目は数値のみ（例：1500万円→15000000）。',
      '- 選択肢（[...]）指定の項目は、その中で最も近いものを選ぶ。当てはまらなければ省略。',
      '- 氏名・ふりがな・住所などはできるだけ原文どおり。',
    )
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
    let values: Record<string, string | number> = {}
    let rows: Record<string, Array<Record<string, string | number>>> = {}
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const allowedSingle = new Set((fields ?? []).map(f => f.key))
      const rowGroupMap = new Map((rowGroups ?? []).map(g => [g.key, new Map(g.fields.map(f => [f.key, f]))]))
      for (const [k, v] of Object.entries(parsed)) {
        // 単一項目: 文字列/数値
        if (allowedSingle.has(k) && (typeof v === 'string' || typeof v === 'number') && String(v).trim()) {
          const field = (fields ?? []).find(f => f.key === k)
          values[k] = field?.type === 'number' ? Number(String(v).replace(/[^0-9.\-]/g, '')) : String(v).trim()
          continue
        }
        // 行データ: 配列
        const groupFields = rowGroupMap.get(k)
        if (groupFields && Array.isArray(v)) {
          const list: Array<Record<string, string | number>> = []
          for (const item of v) {
            if (!item || typeof item !== 'object') continue
            const row: Record<string, string | number> = {}
            for (const [ik, iv] of Object.entries(item as Record<string, unknown>)) {
              const gf = groupFields.get(ik)
              if (!gf) continue
              if (typeof iv !== 'string' && typeof iv !== 'number') continue
              if (!String(iv).trim()) continue
              row[ik] = gf.type === 'number' ? Number(String(iv).replace(/[^0-9.\-]/g, '')) : String(iv).trim()
            }
            if (Object.keys(row).length > 0) list.push(row)
          }
          if (list.length > 0) rows[k] = list
        }
      }
    } catch {
      values = {}
      rows = {}
    }
    return NextResponse.json({ values, rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

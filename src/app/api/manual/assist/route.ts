/**
 * マニュアルの文章をAIに整えてもらう。
 *
 *   POST /api/manual/assist
 *   { mode: 'polish' | 'structure' | 'shorten' | 'expand' | 'custom', text, instruction?, context? }
 *
 * 返すのは案だけ。採用するかどうかは画面側で選ぶ（勝手に上書きしない）。
 * 文体がバラつくと読み物として使えなくなるので、社内の言葉づかいを指示に固定する。
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'

export const maxDuration = 60

const MODE_INSTRUCTION: Record<string, string> = {
  polish:    '誤字・重複・回りくどい言い回しを直してください。内容は足しても引いてもいけません。長さはほぼ同じに保ちます。',
  structure: '内容を整理し、読みやすい順に組み直してください。並列に並ぶものは「・」で始まる箇条書きにします。事実を足してはいけません。',
  shorten:   '意味を変えずに半分程度の長さにしてください。削るのは修飾語と重複です。',
  expand:    '要点だけが書かれた下書きです。読み手が動けるように具体化してください。ただし事実を創作してはいけません。分からない箇所は「（要確認）」と書きます。',
}

const STYLE = `あなたは相続手続きを扱う会社の社内マニュアルの編集者です。次の決まりで書き直してください。

- です・ます調。一文は短く。
- 社内の言葉をそのまま使う：受注担当／管理担当／事務管理担当／経理／案件／面談シート／面談結果登録／オーダーシート／作業進行中／業務完了／要確認／要注意。
- 言い換えや英語表記への置き換えはしない。
- 見出しを付けない。渡された文の範囲だけを書き直す。
- 前置き・あいさつ・「以下のように直しました」などの説明を書かない。書き直した本文だけを返す。`

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const isAdmin = user?.primaryRole === 'system_manager' || (user?.roles ?? []).includes('system_manager')
  if (!isAdmin) {
    return NextResponse.json({ error: 'マニュアルの編集はシステム管理者のみです' }, { status: 403 })
  }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'AIの設定がされていません' }, { status: 503 })

  let payload: { mode?: string; text?: string; instruction?: string; context?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const text = (payload.text ?? '').trim()
  if (!text) return NextResponse.json({ error: '文章が空です' }, { status: 400 })
  if (text.length > 8000) return NextResponse.json({ error: '文章が長すぎます（8000文字まで）' }, { status: 400 })

  const mode = payload.mode ?? 'polish'
  const how = mode === 'custom'
    ? `次の指示に従って書き直してください：${(payload.instruction ?? '').slice(0, 500)}`
    : MODE_INSTRUCTION[mode] ?? MODE_INSTRUCTION.polish

  const context = (payload.context ?? '').slice(0, 2000)

  try {
    const client = new Anthropic({ apiKey: key })
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: STYLE,
      messages: [{
        role: 'user',
        content: [
          how,
          context ? `\n【この文が置かれているページ】\n${context}` : '',
          `\n【書き直す文】\n${text}`,
        ].join('\n'),
      }],
    })
    const out = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim()
    if (!out) return NextResponse.json({ error: 'AIから返答がありませんでした' }, { status: 502 })
    return NextResponse.json({ result: out })
  } catch (e) {
    console.error('[manual-assist] failed', e)
    return NextResponse.json({ error: 'AIの呼び出しに失敗しました' }, { status: 502 })
  }
}

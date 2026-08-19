/**
 * マニュアルの文章をAIに手伝ってもらう。
 *
 *   POST /api/manual/assist
 *   { mode: 'polish' | 'structure' | 'shorten' | 'expand' | 'custom', text, instruction?, context? }
 *   { mode: 'draft', instruction }   … 題材から記事の下書き（ブロック一式）をつくる
 *
 * 返すのは案だけ。採用するかどうかは画面側で選ぶ（勝手に上書きしない）。
 * 文体がバラつくと読み物として使えなくなるので、社内の言葉づかいを指示に固定する。
 *
 * draft のときは「システムの事実」（lib/manualFacts）を必ず添える。
 * AIは渡されたものしか知らないので、これが無いと白紙から書けない。
 * 事実に無いことは書かせず、分からない箇所は（要確認）と書かせる。
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { systemFacts } from '@/lib/manualFacts'
import type { ArticleBlock, ArticleBlockKind } from '@/lib/manualArticle'

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

// 白紙から記事を書くとき。整える系とは求めるものが違うので指示を分ける。
const DRAFT_STYLE = `あなたは相続手続きを扱う会社の社内マニュアルの編集者です。
渡された「システムの事実」だけを根拠に、業務運用ルールの記事の下書きを書きます。

- です・ます調。一文は短く。読み手は社内の担当者です。
- 事実に書かれていないことは絶対に書かない。推測で補わない。
  どうしても必要で分からない箇所は、その文の末尾に「（要確認）」と書く。
- 社内の言葉をそのまま使う：受注担当／管理担当／事務管理担当／経理／案件／面談シート／面談結果登録／
  オーダーシート／作業進行中／業務完了／要確認／要注意／営業日。
- 「なぜそうするか」を書く。画面の操作手順は書かない（それは別の「操作方法」に載せる）。
- 全体で5〜10ブロック程度。長くしすぎない。

出力は次の形だけを返す。前置きも説明も書かない。コードブロックの記号も付けない。
1行目に種別を [] で書き、次の行から本文を書く。次の [ ] が来るまでが1ブロック。

[heading]
深刻度は4段階
[text]
アラートが出る場所は、種類ではなく深刻度で決まります。
紫と赤は要注意バナー、黄は要確認バナーに入ります。
[list]
紫はクレーム
赤は要注意
黄は要確認
[warn]
情報共有はアラートに出ません。放置しても誰も追いかけません。

種別は heading / text / list / warn の4つだけ。
  heading … 章の見出し。短く。1行
  text    … 本文。2〜4文
  list    … 並列に並ぶもの。1行に1つ（行頭に記号は付けない）
  warn    … 守らないと事故になること。多用しない`

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

  const mode = payload.mode ?? 'polish'
  const text = (payload.text ?? '').trim()

  // ── 記事まるごとの下書き ──
  if (mode === 'draft') {
    const theme = (payload.instruction ?? '').trim()
    if (!theme) return NextResponse.json({ error: '何について書くかを入れてください' }, { status: 400 })
    return draftArticle(key, theme, (payload.context ?? '').slice(0, 500))
  }

  if (!text) return NextResponse.json({ error: '文章が空です' }, { status: 400 })
  if (text.length > 8000) return NextResponse.json({ error: '文章が長すぎます（8000文字まで）' }, { status: 400 })

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
          context ? `【この文が置かれているページ】${context}` : '',
          '【書き直す文】',
          text,
        ].filter(Boolean).join('\n'),
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

/** 題材から記事の下書き（ブロック一式）をつくる。既にある記事の題名も渡して重複を避ける。 */
async function draftArticle(key: string, theme: string, context: string) {
  // 既存の記事・操作ステップの題名（同じ話を二重に書かせないため）
  let existing = ''
  try {
    const supabase = await createClient()
    const [{ data: arts }, { data: steps }] = await Promise.all([
      supabase.from('manual_articles').select('title').limit(50),
      supabase.from('manual_steps').select('title').limit(50),
    ])
    const a = ((arts ?? []) as { title: string }[]).map(x => x.title).filter(Boolean)
    const s = ((steps ?? []) as { title: string }[]).map(x => x.title).filter(Boolean)
    existing = [
      a.length ? `既にある業務運用ルール：${a.join('、')}` : '',
      s.length ? `既にある操作方法：${s.join('、')}` : '',
    ].filter(Boolean).join('\n')
  } catch {
    // 取れなくても下書きは作れる
  }

  try {
    const client = new Anthropic({ apiKey: key })
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      system: DRAFT_STYLE,
      messages: [{
        role: 'user',
        content: [
          systemFacts(),
          existing,
          context ? `【この記事が置かれる場所】${context}` : '',
          '【書いてほしいこと】',
          theme,
        ].filter(Boolean).join('\n\n'),
      }],
    })
    const raw = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text).join('').trim()

    const blocks = parseBlocks(raw)
    if (blocks.length === 0) {
      console.error('[manual-assist] 下書きを読み取れなかった返答:', raw.slice(0, 800))
      return NextResponse.json({ error: 'AIの返答を読み取れませんでした' }, { status: 502 })
    }
    return NextResponse.json({ blocks })
  } catch (e) {
    console.error('[manual-assist] draft failed', e)
    return NextResponse.json({ error: 'AIの呼び出しに失敗しました' }, { status: 502 })
  }
}

const DRAFT_KINDS: ArticleBlockKind[] = ['heading', 'text', 'list', 'warn']

/**
 * AIの返答からブロックを取り出す。
 *
 * 書式は [heading] などの行で区切るだけの素朴なもの。
 * JSONにしていたときは、箇条書きの改行がそのまま文字列に入って壊れていた。
 * 前後に余計な文が付いても、種別の行から拾えるので落ちない。
 */
function parseBlocks(raw: string): Omit<ArticleBlock, 'id'>[] {
  const out: Omit<ArticleBlock, 'id'>[] = []
  let kind: ArticleBlockKind | null = null
  let buf: string[] = []

  const flush = () => {
    const body = buf.join('\n').trim()
    if (kind && body) out.push({ kind, body, path: null, caption: null })
    buf = []
  }

  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^\[(heading|text|list|warn)\]$/i)
    if (m) {
      flush()
      kind = m[1].toLowerCase() as ArticleBlockKind
      continue
    }
    if (kind) buf.push(line)
  }
  flush()

  return out.filter(b => DRAFT_KINDS.includes(b.kind)).slice(0, 30)
}

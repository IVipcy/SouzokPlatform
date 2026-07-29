import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// 案件進捗ボードの要約をClaude(Sonnet 5)で生成。管理担当が開いたときにオンデマンドで1回だけ呼ぶ。
// 入力: { items: [{kotei, name, status, note?}], dealName? }
// 返し: { overall, byKotei }  overall=全体1〜2文 / byKotei=工程名→その工程の要約1文
// 全工程を1回のリクエストで渡すため、工程別と全体で矛盾しない要約になる（材料＝作業内容フリー欄＋タスク実施結果＋状態）。
export const runtime = 'nodejs'

type Item = { kotei?: string; name: string; status: string; note?: string }

const SYSTEM = [
  'あなたは相続手続き案件の進捗を、管理担当が受注担当へ週次報告するために要約するアシスタント。',
  '入力は工程（相続人調査・財産調査・遺産分割 等）ごとにまとまった業務の一覧で、各業務に状態（完了/進行中/未着手）とメモが付く。',
  '出力は必ず次の形式のJSONのみ（前置き・コードフェンス・見出し・絵文字なし）:',
  '{"overall":"全体を1〜2文","byKotei":{"<工程名>":"その工程を1文",...}}',
  'overall: 案件全体の現在地・並行して動いている業務・次の山を1〜2文で。進行中を優先し、未着手はまとめて軽く。',
  'byKotei: 各工程について「今どこまで進み、次に何をするか」を1文で。完了済みの工程は完了した旨を簡潔に。',
  'byKotei のキーは入力に出てきた工程名を厳密にそのまま使う。入力に無い工程は作らない。',
  '事実（状態・メモ）に無いことは書かない。憶測で日付や固有名詞を足さない。',
].join('\n')

export async function POST(req: NextRequest) {
  try {
    const { items, dealName } = (await req.json()) as { items?: Item[]; dealName?: string }
    if (!items || items.length === 0) return NextResponse.json({ error: '進捗データがありません' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEYが未設定です' }, { status: 500 })

    // 工程ごとにまとめて提示（工程の無いものは「その他」に寄せる）
    const byKoteiInput = new Map<string, Item[]>()
    for (const it of items) {
      const k = it.kotei || 'その他'
      if (!byKoteiInput.has(k)) byKoteiInput.set(k, [])
      byKoteiInput.get(k)!.push(it)
    }
    const block = [...byKoteiInput.entries()].map(([kotei, list]) => {
      const lines = list.map(i => `  - ${i.name}：${i.status}${i.note ? `（${i.note}）` : ''}`).join('\n')
      return `【${kotei}】\n${lines}`
    }).join('\n')

    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `案件「${dealName ?? ''}」の工程別進捗:\n${block}\n\n上記を要約し、指定のJSON形式のみで返してください。` }],
    })
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    // JSONを取り出す（コードフェンスが付いても剥がす）
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let overall = ''
    let byKotei: Record<string, string> = {}
    try {
      const parsed = JSON.parse(jsonText) as { overall?: string; byKotei?: Record<string, string> }
      overall = typeof parsed.overall === 'string' ? parsed.overall.trim() : ''
      if (parsed.byKotei && typeof parsed.byKotei === 'object') {
        for (const [k, v] of Object.entries(parsed.byKotei)) {
          if (typeof v === 'string' && v.trim()) byKotei[k] = v.trim()
        }
      }
    } catch {
      // パース失敗時は全体だけ本文をそのまま返す（工程別は空）
      overall = raw
      byKotei = {}
    }
    return NextResponse.json({ overall, byKotei })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

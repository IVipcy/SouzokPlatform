import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// 案件進捗ボードの「全体サマリー」をClaude(Sonnet 5)で生成。管理担当が開いたときにオンデマンド生成する。
// 入力: { items: [{name, status, note?}], dealName? } / 返し: { summary }
export const runtime = 'nodejs'

type Item = { name: string; status: string; note?: string }

const SYSTEM = [
  '相続手続きの案件進捗を、管理担当が受注担当へ週次報告するための簡潔な要約に整える。',
  '完了・進行中・未着手を踏まえ、日本語の文章で1〜2文にまとめる。',
  '進行中の要点（何を待っているか等）を優先的に触れ、未着手はまとめて軽く触れる。',
  '前置き・箇条書き・見出し・絵文字は使わず、要約の本文のみを返す。',
].join('\n')

export async function POST(req: NextRequest) {
  try {
    const { items, dealName } = (await req.json()) as { items?: Item[]; dealName?: string }
    if (!items || items.length === 0) return NextResponse.json({ error: '進捗データがありません' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEYが未設定です' }, { status: 500 })

    const lines = items.map(i => `- ${i.name}：${i.status}${i.note ? `（${i.note}）` : ''}`).join('\n')
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: `案件「${dealName ?? ''}」の業務進捗:\n${lines}\n\nこの進捗を1〜2文で要約してください。` }],
    })
    const summary = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
    return NextResponse.json({ summary })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

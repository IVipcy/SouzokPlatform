import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const DOCUMENT_TEMPLATES: Record<string, { title: string; systemPrompt: string }> = {
  'division-agreement': {
    title: '遺産分割協議書',
    systemPrompt: `あなたは相続手続きの専門家です。以下の案件情報をもとに、遺産分割協議書の草案を日本語で作成してください。
法的に正確な表現を使い、一般的な遺産分割協議書のフォーマットに従ってください。
不明な部分は【要確認】と記載してください。`,
  },
  'heir-survey': {
    title: '相続人調査報告書',
    systemPrompt: `あなたは相続手続きの専門家です。以下の案件情報をもとに、相続人調査報告書の草案を日本語で作成してください。
戸籍謄本等に基づく法定相続人の確定結果を記載するフォーマットに従ってください。`,
  },
  'property-list': {
    title: '財産目録',
    systemPrompt: `あなたは相続手続きの専門家です。以下の案件情報をもとに、遺産の財産目録の草案を日本語で作成してください。
不動産、金融資産、その他の財産をカテゴリ別に整理してください。
不明な部分は【要確認】と記載してください。`,
  },
  'cover-letter': {
    title: '送付状',
    systemPrompt: `あなたは相続手続きの事務担当者です。以下の案件情報をもとに、書類送付状を日本語で作成してください。
ビジネス文書として適切な敬語と書式を使用してください。`,
  },
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません。.env.local に追加してください。' }, { status: 500 })
    }

    const body = await request.json()
    const { caseId, templateKey, additionalInstructions, taskId } = body

    if (!caseId || !templateKey) {
      return NextResponse.json({ error: 'caseId と templateKey は必須です' }, { status: 400 })
    }

    const template = DOCUMENT_TEMPLATES[templateKey]
    if (!template) {
      return NextResponse.json({ error: `不明なテンプレート: ${templateKey}` }, { status: 400 })
    }

    // Fetch case data
    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', caseId)
      .single()

    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    // Build context
    const client = caseData.clients
    const context = `
【案件情報】
案件番号: ${caseData.case_number}
案件名: ${caseData.deal_name}
ステータス: ${caseData.status}
受注日: ${caseData.order_date || '未設定'}

【被相続人】
氏名: ${caseData.deceased_name || '未設定'}
死亡日: ${caseData.date_of_death || '未設定'}

【依頼者】
氏名: ${client?.name || '未設定'}
住所: ${client?.address || '未設定'}
電話: ${client?.phone || '未設定'}
続柄: ${client?.relationship_to_deceased || '未設定'}

【資産情報】
資産合計概算: ${caseData.total_asset_estimate ? '¥' + caseData.total_asset_estimate.toLocaleString() : '未設定'}
不動産ランク: ${caseData.property_rank || '未設定'}
相続税申告: ${caseData.tax_filing_required || '確認中'}
申告期限: ${caseData.tax_filing_deadline || '未設定'}

【手続内容】
手続区分: ${caseData.procedure_type?.join(', ') || '未設定'}
付帯サービス: ${caseData.additional_services?.join(', ') || 'なし'}
備考: ${caseData.notes || 'なし'}
${additionalInstructions ? `\n【追加指示】\n${additionalInstructions}` : ''}
`

    const anthropic = new Anthropic({ apiKey })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: template.systemPrompt,
      messages: [
        { role: 'user', content: `以下の案件情報をもとに「${template.title}」を作成してください。\n${context}` }
      ],
    })

    const content = message.content[0]
    const generatedText = content.type === 'text' ? content.text : ''

    // Save to documents table
    const { data: doc, error: docErr } = await supabase.from('documents').insert({
      case_id: caseId,
      task_id: taskId ?? null,
      name: `${template.title}_${caseData.case_number}`,
      file_type: 'Word',
      generated_by: 'AI',
      status: '下書き',
    }).select('id').single()

    if (docErr) {
      return NextResponse.json({ error: `ドキュメント保存に失敗: ${docErr.message}`, content: generatedText }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      title: template.title,
      content: generatedText,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

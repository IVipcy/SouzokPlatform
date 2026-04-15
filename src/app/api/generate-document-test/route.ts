/**
 * テスト用: Wordテンプレートに案件データを流し込んで.docxを生成し、Storageにアップ + documentsレコード作成。
 * 本番実装が固まったら削除予定。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

export async function POST(request: NextRequest) {
  try {
    const { caseId } = await request.json()
    if (!caseId) {
      return NextResponse.json({ error: 'caseId は必須です' }, { status: 400 })
    }

    // 案件+依頼者データを取得
    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', caseId)
      .single()

    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    const dealName = caseData.deal_name ?? ''
    const clientName = caseData.clients?.name ?? '未設定'

    // テンプレート読み込み
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'test-template.docx')
    const templateBuffer = await readFile(templatePath)

    // docxtemplaterでプレースホルダー置換
    const zip = new PizZip(templateBuffer)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })
    doc.render({
      deal_name: dealName,
      client_name: clientName,
    })

    const generatedBuffer = doc.getZip().generate({ type: 'nodebuffer' })

    // Supabase Storageにアップロード（英数字のみのパス）
    const filename = `${Date.now()}_${crypto.randomUUID()}.docx`
    const storagePath = `${caseId}/${filename}`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, generatedBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

    if (uploadErr) {
      return NextResponse.json({ error: `ファイルアップロード失敗: ${uploadErr.message}` }, { status: 500 })
    }

    // documentsレコード作成
    const docName = `テスト書類_${caseData.case_number ?? ''}_${new Date().toISOString().slice(0, 10)}`
    const { data: docRow, error: docErr } = await supabase.from('documents').insert({
      case_id: caseId,
      name: docName,
      file_path: storagePath,
      file_type: 'Word',
      status: '作成済',
      generated_by: 'manual',
    }).select('id').single()

    if (docErr) {
      return NextResponse.json({ error: `ドキュメント登録失敗: ${docErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, documentId: docRow.id, name: docName })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * 郵送書類確認票（Excel）生成API
 *
 * public/templates/mailing-confirmation/mailing_confirmation.xlsx の zip を直接開いて、
 * sheet1.xml の対象セルだけ inlineStr で上書きする方式。ExcelJS は介さない。
 *
 * 過去に ExcelJS で load → writeBuffer すると Excel 側で「内容に問題が見つかりました」
 * → 回復モード → 空表示になる事故が起きたため。テンプレが Excel で開ければ
 * 出力も必ず開ける、を保証する。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

type Body = {
  caseId: string
  returnDocs: string[]        // ご返送書類一覧（お客様が返送する書類。最大10）
  sendDocs?: string[]         // 送付書類一覧（こちらから送る書類。任意・最大10）
  shipDate?: string | null    // 発送日（YYYY-MM-DD）。未指定なら空欄（手書き）
  clientStaff?: string | null // お客様担当
  taskId?: string | null      // 紐づける作成タスク（タスク詳細から作成時）
}

// セル位置（mailing_confirmation.xlsx＝郵送書類確認票）
const RETURN_START_ROW = 9   // ご返送書類一覧 I9:I18（merged I:J）
const SEND_START_ROW = 9     // 送付書類一覧   D9:D18（merged D:E）
const MAX_ROWS = 10
const CELL = {
  shipDate: 'C22',   // 発送日（令和　年　月　日）
  clientStaff: 'J26',// お客様担当：
}

// 令和表記（令和元年=2019）
function reiwa(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear() - 2018
  return `令和　${y}　年　${d.getMonth() + 1}　月　${d.getDate()}　日`
}

// XML テキストエスケープ（属性ではなく要素内テキスト用）
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * sheet1.xml の指定セルを inlineStr で上書き（既存のスタイル s="" は温存）。
 * value=null/'' のときはセルから値を消す（スタイルは温存）。
 * セル要素が存在しない行/列は何もしない（テンプレ I9:I18・D9:D18 は事前に存在する前提）。
 */
function setCellInline(sheetXml: string, addr: string, value: string | null): string {
  // 自己終了形 <c r="ADDR" ... /> もしくは <c r="ADDR" ...>...</c> の両方にマッチ
  const re = new RegExp(`<c\\s+r="${addr}"([^/>]*)(?:/>|>[\\s\\S]*?</c>)`)
  return sheetXml.replace(re, (_full, attrsRaw: string) => {
    // 既存属性から t="..."（型）と s="..."（スタイル）を抽出し、t は外す（書き直す）
    const styleMatch = attrsRaw.match(/\bs="(\d+)"/)
    const sAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''
    if (value === null || value === '') {
      return `<c r="${addr}"${sAttr}/>`
    }
    return `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, returnDocs, sendDocs = [], shipDate, clientStaff } = body
    if (!caseId) return NextResponse.json({ error: 'caseId は必須です' }, { status: 400 })

    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('case_number, deal_name')
      .eq('id', caseId)
      .single()
    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'mailing-confirmation', 'mailing_confirmation.xlsx')
    const templateBuffer = await readFile(templatePath)

    const zip = await JSZip.loadAsync(templateBuffer)
    const sheetEntry = zip.file('xl/worksheets/sheet1.xml')
    if (!sheetEntry) {
      return NextResponse.json({ error: 'テンプレのシートが見つかりません' }, { status: 500 })
    }
    let sheetXml = await sheetEntry.async('string')

    // 一覧クリア → 流し込み
    for (let i = 0; i < MAX_ROWS; i++) {
      sheetXml = setCellInline(sheetXml, `I${RETURN_START_ROW + i}`, null)
      sheetXml = setCellInline(sheetXml, `D${SEND_START_ROW + i}`, null)
    }
    returnDocs.slice(0, MAX_ROWS).forEach((name, i) => {
      const v = (name ?? '').trim()
      if (v) sheetXml = setCellInline(sheetXml, `I${RETURN_START_ROW + i}`, v)
    })
    sendDocs.slice(0, MAX_ROWS).forEach((name, i) => {
      const v = (name ?? '').trim()
      if (v) sheetXml = setCellInline(sheetXml, `D${SEND_START_ROW + i}`, v)
    })

    // 発送日・お客様担当（任意）
    if (shipDate) sheetXml = setCellInline(sheetXml, CELL.shipDate, reiwa(shipDate))
    if (clientStaff) sheetXml = setCellInline(sheetXml, CELL.clientStaff, clientStaff)

    // 差し替え
    zip.file('xl/worksheets/sheet1.xml', sheetXml)
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    const downloadFilename = `郵送書類確認票_${caseData.case_number ?? caseId}.xlsx`

    // Storage 保存＋documents 登録（失敗してもDLは続行）
    const storagePath = `${caseId}/${Date.now()}_${crypto.randomUUID()}.xlsx`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, outBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    if (!uploadErr) {
      await supabase.from('documents').insert({
        case_id: caseId,
        task_id: body.taskId ?? null,
        name: `郵送書類確認票（${caseData.case_number ?? ''}）`,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'manual',
      })
    } else {
      console.error('[mailing-confirmation] storage upload failed:', uploadErr.message)
    }

    return new NextResponse(outBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '不明なエラー'
    console.error('[mailing-confirmation] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

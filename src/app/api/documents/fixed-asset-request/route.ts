/**
 * 固定資産証明等申請書（名寄帳・評価証明）Excel 生成API
 *
 * 3バリエーション（行政/司法/いきいきライフ）すべて同じセル位置で対応可能。
 * 物件ブロックは最大5件（土地+家屋ペア、6行刻み）を埋める。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { FIXED_ASSET_VARIANT_PRESETS, type FixedAssetVariant } from '@/lib/officeProfiles'

type PropertyRow = {
  landAddress: string          // 土地の所在（登記簿上の地番）
  buildingAddress: string      // 家屋の所在
  kaokuBango: string           // 家屋番号
  needNeighborPrice: boolean   // 近傍宅地価格 要/不要
}

type Body = {
  caseId: string
  variant: FixedAssetVariant
  requestDate: string
  municipality: string         // 提出先市区町村名
  nendo: string                // 年度（例: 令和7年度）
  copyCount: number            // 部数
  certKinds: string[]          // 証明書種類（名寄帳/評価証明/非課税証明書）※MVPでは表示のみ
  ownerName: string            // 所有者氏名（通常 cases.deceased_name）
  ownerAddress: string         // 所有者住所
  properties: PropertyRow[]    // 対象資産（最大5件）
  kogawaseAmount: number | null
  notes: string
}

/**
 * 3バリエーション共通のセルマップ
 */
const CELL_MAP = {
  municipality: 'A3',
  requestDate: ['F3', 'I1'],
  requesterAddress: 'F5',
  requesterName: 'F6',
  nendo: 'F14',
  copyCount: 'H14',
  ownerName: 'D17',
  ownerAddress: 'D19',
  purpose: 'C42',
  notesFreeInput: 'I45',
  kogawaseAmount: 'G52',
  // 物件ブロック: 5ブロック（土地+家屋ペア、開始行: 23,27,31,35,39）
  propertyBlocks: [
    { landAddress: 'D23', buildingAddress: 'D24', kaokuBango: 'G24', neighborNeed: 'H23' },
    { landAddress: 'D27', buildingAddress: 'D28', kaokuBango: 'G28', neighborNeed: 'H27' },
    { landAddress: 'D31', buildingAddress: 'D32', kaokuBango: 'G32', neighborNeed: 'H31' },
    { landAddress: 'D35', buildingAddress: 'D36', kaokuBango: 'G36', neighborNeed: 'H35' },
    { landAddress: 'D39', buildingAddress: 'D40', kaokuBango: 'G40', neighborNeed: 'H39' },
  ],
} as const

function setCell(ws: ExcelJS.Worksheet, addr: string, value: string | number | Date | null) {
  if (value === null || value === undefined || value === '') return
  const cell = ws.getCell(addr)
  cell.value = value
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, variant, requestDate, municipality, nendo, copyCount,
            ownerName, ownerAddress, properties, kogawaseAmount, notes } = body

    if (!caseId || !variant) {
      return NextResponse.json({ error: 'caseId, variant は必須です' }, { status: 400 })
    }

    const preset = FIXED_ASSET_VARIANT_PRESETS[variant]
    if (!preset) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
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

    // テンプレート読込
    const templateFile = `fixed_asset_${variant}.xlsx`
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'fixed-asset', templateFile)
    const templateBuffer = await readFile(templatePath)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(templateBuffer).buffer as ArrayBuffer)
    const ws = wb.getWorksheet('fixed_asset') ?? wb.worksheets[0]
    if (!ws) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    const client = caseData.clients as { name?: string; address?: string } | null
    const clientName = client?.name ?? ''
    const clientAddress = client?.address ?? ''
    const dateObj = requestDate ? new Date(requestDate) : new Date()

    // --- 流し込み ---
    setCell(ws, CELL_MAP.municipality, municipality)
    for (const addr of CELL_MAP.requestDate) setCell(ws, addr, dateObj)
    setCell(ws, CELL_MAP.requesterAddress, clientAddress)
    setCell(ws, CELL_MAP.requesterName, clientName)
    setCell(ws, CELL_MAP.nendo, nendo)
    setCell(ws, CELL_MAP.copyCount, `${copyCount}　通`)
    setCell(ws, CELL_MAP.ownerName, `故　${ownerName}`)
    setCell(ws, CELL_MAP.ownerAddress, ownerAddress)
    setCell(ws, CELL_MAP.purpose, preset.purpose)
    if (notes) setCell(ws, CELL_MAP.notesFreeInput, notes)
    if (kogawaseAmount !== null && kogawaseAmount !== undefined) {
      setCell(ws, CELL_MAP.kogawaseAmount, kogawaseAmount)
    }

    // 物件ブロック（最大5件）
    properties.slice(0, 5).forEach((p, i) => {
      const block = CELL_MAP.propertyBlocks[i]
      if (!block) return
      setCell(ws, block.landAddress, p.landAddress)
      setCell(ws, block.buildingAddress, p.buildingAddress)
      setCell(ws, block.kaokuBango, p.kaokuBango)
      setCell(ws, block.neighborNeed, p.needNeighborPrice ? '要' : '不要')
    })

    // --- 出力 ---
    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `固定資産申請書_${caseData.case_number ?? caseId}_${municipality || 'untitled'}_${requestDate}.xlsx`

    // Supabase Storage にアップロード
    const storageFilename = `${Date.now()}_${crypto.randomUUID()}.xlsx`
    const storagePath = `${caseId}/${storageFilename}`
    const uploadBuffer = Buffer.from(outBuffer as ArrayBuffer)
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, uploadBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    if (!uploadErr) {
      const docName = `固定資産申請書_${municipality || ''}_${requestDate}（${preset.label}）`
      await supabase.from('documents').insert({
        case_id: caseId,
        name: docName,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'manual',
      })
    } else {
      console.error('[fixed-asset-request] storage upload failed:', uploadErr.message)
    }

    return new NextResponse(uploadBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '不明なエラー'
    console.error('[fixed-asset-request] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

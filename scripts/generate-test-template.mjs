/**
 * テスト用Wordテンプレートを生成するスクリプト
 * 実行: node scripts/generate-test-template.mjs
 * 出力: public/templates/test-template.docx
 *
 * プレースホルダ: {deal_name}, {client_name}
 * docxtemplater の構文に準拠（{変数名}）
 */

import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '..', 'public', 'templates', 'test-template.docx')

const doc = new Document({
  creator: '相続プラットフォーム',
  title: 'テストテンプレート',
  sections: [
    {
      properties: {},
      children: [
        // タイトル
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({ text: '相続手続きに関するご案内', bold: true, size: 32 }),
          ],
        }),
        new Paragraph({ children: [new TextRun('')] }), // 空行

        // 依頼者宛名
        new Paragraph({
          children: [
            new TextRun({ text: '{client_name}', size: 28 }),
            new TextRun({ text: ' 様', size: 28 }),
          ],
        }),
        new Paragraph({ children: [new TextRun('')] }),

        // 本文
        new Paragraph({
          children: [
            new TextRun('平素より大変お世話になっております。'),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun('下記の案件につきまして、ご連絡いたします。'),
          ],
        }),
        new Paragraph({ children: [new TextRun('')] }),

        // 区切り線
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')],
        }),

        // 案件名
        new Paragraph({
          children: [
            new TextRun({ text: '案件名：', bold: true }),
            new TextRun('{deal_name}'),
          ],
        }),

        // 依頼者
        new Paragraph({
          children: [
            new TextRun({ text: 'ご依頼者：', bold: true }),
            new TextRun('{client_name}'),
          ],
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')],
        }),
        new Paragraph({ children: [new TextRun('')] }),

        // 締め
        new Paragraph({
          children: [new TextRun('引き続き、よろしくお願い申し上げます。')],
        }),
        new Paragraph({ children: [new TextRun('')] }),

        // 署名
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun('相続プラットフォーム')],
        }),
      ],
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, buffer)

console.log(`✅ テンプレート生成完了: ${OUT_PATH}`)
console.log(`   プレースホルダ: {deal_name}, {client_name}`)

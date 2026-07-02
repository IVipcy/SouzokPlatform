// ============================================================
// bulk_create_accounts.mjs
// Excel(アカウント発行対象) から Supabase アカウントを一括発行する。
//
// 1人につき:
//   ① Auth ユーザー作成（email＋パスワード、email_confirm:true で即ログイン可）
//   ② members 行を upsert（氏名/email/primary_role/team_id/department/job_type/joined_at/is_active）
//   ③ teams は Excel のチーム名から自動作成・紐付け
//
// ログインは「Auth ユーザーの email == members.email」で突合されるため、
// members に auth のIDを持たせる必要はない（email が鍵）。
//
// 【必要な環境変数】
//   SUPABASE_URL                 … 例 https://xxxx.supabase.co（NEXT_PUBLIC_SUPABASE_URL でも可）
//   SUPABASE_SERVICE_ROLE_KEY    … Supabase の service_role キー（絶対に公開しない）
// 【任意】
//   COMMON_PASSWORD=xxxxx        … 全員同じ初期パスワードにする場合。未指定なら1人ずつランダム生成
//   DRY_RUN=1                    … 書き込まず、対象一覧だけ確認
//
// 【実行】
//   node scripts/bulk_create_accounts.mjs "C:\\Users\\sugur\\Desktop\\アカウント発行対象_ミニマム開始.xlsx" Sheet2
//
// 出力: scripts/created_accounts.csv（氏名,email,区分,role,事業部,チーム,パスワード,結果）
//   → このCSVのパスワードをURLと一緒に各人へ配布する。
// ============================================================

import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const XLSX_PATH = process.argv[2] || 'C:\\Users\\sugur\\Desktop\\アカウント発行対象_ミニマム開始.xlsx'
const SHEET = process.argv[3] || 'Sheet2'
const DRY_RUN = process.env.DRY_RUN === '1'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// 区分 → primary_role
const ROLE_MAP = { '受注': 'sales', '管理': 'manager', '経理': 'accounting' }

// Excel シリアル値 → YYYY-MM-DD
function excelDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000) // 25569 = 1970-01-01 の Excel シリアル
    return new Date(ms).toISOString().slice(0, 10)
  }
  return null
}

function genPassword() {
  // 紛らわしい文字を除いた12桁
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const b = crypto.randomBytes(12)
  return Array.from(b, x => chars[x % chars.length]).join('')
}

function cellText(v) {
  if (v == null) return ''
  if (typeof v === 'object' && v.text) return String(v.text).trim() // rich text / hyperlink
  return String(v).trim()
}

async function main() {
  // ── 1. Excel 読み込み ──
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(XLSX_PATH)
  const ws = wb.getWorksheet(SHEET)
  if (!ws) { console.error(`❌ シート "${SHEET}" が見つかりません`); process.exit(1) }

  // exceljs の row.values は 1始まりの疎配列。Array.from で穴を '' に埋めて密化する。
  const vals = (row) => Array.from({ length: (row.values?.length ?? 0) }, (_, i) => cellText(row.values[i]))

  // ヘッダー行を特定（区分 と 社内E-Mail を含む行）
  let headerRow = null
  ws.eachRow((row, n) => {
    const texts = vals(row)
    if (!headerRow && texts.some(t => t.includes('区分')) && texts.some(t => t.includes('E-Mail'))) headerRow = n
  })
  if (!headerRow) { console.error('❌ ヘッダー行（区分/E-Mail）が見つかりません'); process.exit(1) }

  const header = vals(ws.getRow(headerRow))
  const col = (kw) => header.findIndex(h => h.includes(kw))
  const iName = col('氏'), iDept = col('所属事業部'), iTeam = col('所属チーム'),
        iKubun = col('区分'), iJob = col('職種'), iMail = col('E-Mail'), iJoin = col('入社')

  const people = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = vals(ws.getRow(r))
    const email = row[iMail]
    const name = row[iName]
    const kubun = row[iKubun]
    if (!email || !email.includes('@') || !name) continue
    const role = ROLE_MAP[kubun]
    if (!role) { console.warn(`⚠ スキップ（区分「${kubun}」が対象外）: ${name} ${email}`); continue }
    people.push({
      name, email: email.toLowerCase(), kubun, role,
      department: row[iDept] && row[iDept] !== '-' ? row[iDept] : null,
      team: row[iTeam] && row[iTeam] !== '-' ? row[iTeam] : null,
      job: row[iJob] && row[iJob] !== '-' ? row[iJob] : '総合職',
      joined_at: excelDate(ws.getRow(r).values[iJoin]),
    })
  }
  console.log(`対象 ${people.length} 名（${SHEET}）  役割内訳:`,
    people.reduce((a, p) => (a[p.role] = (a[p.role] || 0) + 1, a), {}))

  if (DRY_RUN) {
    console.log('— DRY_RUN: 書き込みは行いません —')
    people.forEach(p => console.log(`  ${p.name}\t${p.email}\t${p.kubun}→${p.role}\t${p.department ?? ''}\t${p.team ?? ''}\t${p.joined_at ?? ''}`))
    return
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数に設定してください。')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // ── 2. teams を用意（Excel のチーム名で作成・既存は再利用） ──
  const teamNames = [...new Set(people.map(p => p.team).filter(Boolean))]
  const { data: existTeams } = await supabase.from('teams').select('id,name')
  const teamMap = new Map((existTeams ?? []).map(t => [t.name, t.id]))
  for (const tn of teamNames) {
    if (teamMap.has(tn)) continue
    const { data, error } = await supabase.from('teams').insert({ name: tn, is_active: true }).select('id').single()
    if (error) { console.error(`❌ チーム作成失敗 ${tn}: ${error.message}`); continue }
    teamMap.set(tn, data.id)
    console.log(`＋ チーム作成: ${tn}`)
  }

  // ── 3. 1人ずつ Auth ユーザー＋members 作成 ──
  const results = []
  for (const p of people) {
    const password = process.env.COMMON_PASSWORD || genPassword()
    let authStatus = ''
    const { error: authErr } = await supabase.auth.admin.createUser({
      email: p.email, password, email_confirm: true,
      user_metadata: { name: p.name },
    })
    if (authErr) {
      if (/already|registered|exists/i.test(authErr.message)) authStatus = 'Auth既存(パスワード未変更)'
      else { console.error(`❌ Auth作成失敗 ${p.email}: ${authErr.message}`); results.push({ ...p, password: '', status: 'Auth失敗:' + authErr.message }); continue }
    } else {
      authStatus = 'Auth作成'
    }

    const { error: memErr } = await supabase.from('members').upsert({
      name: p.name, email: p.email, primary_role: p.role,
      team_id: p.team ? (teamMap.get(p.team) ?? null) : null,
      department: p.department, job_type: p.job, joined_at: p.joined_at, is_active: true,
    }, { onConflict: 'email' })
    if (memErr) { console.error(`❌ members失敗 ${p.email}: ${memErr.message}`); results.push({ ...p, password, status: authStatus + ' / members失敗:' + memErr.message }); continue }

    results.push({ ...p, password: authErr ? '（既存のため未発行）' : password, status: authStatus + ' / members OK' })
    console.log(`✓ ${p.name}  ${p.email}  ${p.role}  ${authStatus}`)
  }

  // ── 4. CSV 出力（配布用） ──
  const csv = ['氏名,email,区分,role,事業部,チーム,パスワード,結果']
    .concat(results.map(r => [r.name, r.email, r.kubun, r.role, r.department ?? '', r.team ?? '', r.password, r.status]
      .map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')))
    .join('\n')
  const outPath = path.join(process.cwd(), 'scripts', 'created_accounts.csv')
  fs.writeFileSync(outPath, '﻿' + csv, 'utf8')  // BOM付きでExcelでも文字化けしない
  console.log(`\n完了。${results.length} 名処理。配布用CSV: ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })

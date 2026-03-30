/**
 * デモデータセットアップスクリプト
 *
 * 使い方: node scripts/setup-demo.mjs
 *
 * やること:
 *  1. テーブルが存在するか確認
 *  2. なければスキーマ作成 → マスタデータ → デモデータ投入
 *  3. あればデモデータのみ投入
 *  4. 案件詳細ページのURLを表示
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// .env.local から読み込み
const envFile = readFileSync(resolve(root, '.env.local'), 'utf-8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です')
  process.exit(1)
}

// service_role キーで接続（RLSバイパス）
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function runSQL(sql) {
  // supabase-js v2 doesn't have a direct SQL exec method, use rpc or rest
  // We'll use the REST API directly
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  })
  // This won't work for raw SQL. Let's use the management API instead
}

// Use Supabase's pg endpoint for raw SQL
async function execSQL(sql) {
  // Split by semicolons and execute via supabase-js rpc won't work
  // Instead, use the Supabase HTTP endpoint for SQL
  const response = await fetch(`${supabaseUrl}/pg`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`SQL execution failed: ${response.status} ${text}`)
  }
  return response.json()
}

// ============================================================
// メイン処理
// ============================================================

async function main() {
  console.log('🔌 Supabase に接続中...')
  console.log(`   URL: ${supabaseUrl}`)
  console.log('')

  // Step 1: テーブルの存在確認
  console.log('📋 Step 1: テーブルの存在を確認中...')
  const { data: casesCheck, error: casesError } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })

  const tablesExist = !casesError || !casesError.message.includes('does not exist')

  if (!tablesExist) {
    console.log('   ⚠️  テーブルが存在しません。スキーマを作成します...')
    console.log('')
    console.log('   ─────────────────────────────────────────────')
    console.log('   ❗ Supabase SQL Editor で手動実行が必要です')
    console.log('   ─────────────────────────────────────────────')
    console.log('')
    console.log('   以下のURLをブラウザで開いてください:')
    console.log(`   ${supabaseUrl.replace('.supabase.co', '')}.supabase.com/project/ddkfjfhjnicoffaqrxmp/sql/new`)
    console.log('')
    console.log('   SQL Editorで以下の2ファイルを順番に実行:')
    console.log('   1. supabase/migrations/001_initial_schema.sql')
    console.log('   2. supabase/migrations/002_seed_master_data.sql')
    console.log('')
    console.log('   実行後、このスクリプトを再度実行してください。')
    process.exit(1)
  }

  console.log('   ✅ テーブルは存在しています')
  console.log('')

  // Step 2: マスタデータ確認
  console.log('📋 Step 2: マスタデータを確認中...')
  const { count: roleCount } = await supabase
    .from('roles')
    .select('*', { count: 'exact', head: true })

  const { count: templateCount } = await supabase
    .from('task_templates')
    .select('*', { count: 'exact', head: true })

  console.log(`   ロール: ${roleCount ?? 0}件, テンプレート: ${templateCount ?? 0}件`)

  if (!roleCount || roleCount === 0) {
    console.log('   ⚠️  マスタデータが空です。')
    console.log('   SQL Editorで以下を実行してください:')
    console.log('   → supabase/migrations/002_seed_master_data.sql')
    process.exit(1)
  }
  console.log('   ✅ マスタデータあり')
  console.log('')

  // Step 3: RLS無効化確認（service_roleなのでバイパスされる）
  console.log('📋 Step 3: デモデータを投入中...')

  // メンバー
  const members = [
    { id: 'a1000000-0000-0000-0000-000000000001', name: '田中 太郎', email: 'tanaka@example.com', avatar_color: '#2563EB' },
    { id: 'a1000000-0000-0000-0000-000000000002', name: '佐藤 花子', email: 'sato@example.com', avatar_color: '#059669' },
    { id: 'a1000000-0000-0000-0000-000000000003', name: '鈴木 一郎', email: 'suzuki@example.com', avatar_color: '#D97706' },
    { id: 'a1000000-0000-0000-0000-000000000004', name: '伊藤 美咲', email: 'ito@example.com', avatar_color: '#DC2626' },
    { id: 'a1000000-0000-0000-0000-000000000005', name: '山本 健太', email: 'yamamoto@example.com', avatar_color: '#7C3AED' },
  ]

  for (const m of members) {
    const { error } = await supabase.from('members').upsert(m, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  メンバー ${m.name}: ${error.message}`)
  }
  console.log('   ✅ メンバー 5名')

  // パートナー
  const { error: partnerErr } = await supabase.from('partners').upsert({
    id: 'b1000000-0000-0000-0000-000000000001',
    name: 'クレアトール',
    contact_person: '高橋 誠',
    phone: '03-1234-5678',
    kickback_rate: 10.00,
  }, { onConflict: 'id' })
  if (partnerErr) console.log(`   ⚠️  パートナー: ${partnerErr.message}`)
  else console.log('   ✅ パートナー 1社')

  // 顧客
  const clients = [
    { id: 'c1000000-0000-0000-0000-000000000001', name: '中村 さくら', furigana: 'なかむら さくら', phone: '090-1234-5678', email: 'sakura@example.com', address: '東京都渋谷区広尾2-2-2', postal_code: '150-0012', relationship_to_deceased: '長女' },
    { id: 'c1000000-0000-0000-0000-000000000002', name: '加藤 裕子', furigana: 'かとう ゆうこ', phone: '080-9876-5432', email: 'kato@example.com', address: '大阪府大阪市北区梅田1-1-1', postal_code: '530-0001', relationship_to_deceased: '配偶者' },
  ]
  for (const c of clients) {
    const { error } = await supabase.from('clients').upsert(c, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  顧客 ${c.name}: ${error.message}`)
  }
  console.log('   ✅ 顧客 2名')

  // 案件
  const cases = [
    {
      id: 'd1000000-0000-0000-0000-000000000001',
      case_number: 'R7-A00127',
      deal_name: '中村 さくら',
      status: '対応中',
      client_id: 'c1000000-0000-0000-0000-000000000001',
      deceased_name: '中村 義雄',
      date_of_death: '2025-10-01',
      order_date: '2025-10-15',
      completion_date: '2026-03-31',
      difficulty: '難',
      procedure_type: ['手続一式', '登記'],
      additional_services: ['相続税申告', '不動産売却'],
      tax_filing_required: '要',
      tax_filing_deadline: '2026-08-01',
      property_rank: 'S',
      total_asset_estimate: 85000000,
      partner_id: 'b1000000-0000-0000-0000-000000000001',
      notes: '自筆遺言の検認申立が必要。相続人5名で意見調整中。長男が不動産取得を希望しているが他の相続人との調整が難航する可能性あり。',
    },
    {
      id: 'd1000000-0000-0000-0000-000000000002',
      case_number: 'R7-A00128',
      deal_name: '加藤 裕子',
      status: '受注',
      client_id: 'c1000000-0000-0000-0000-000000000002',
      deceased_name: '加藤 正',
      date_of_death: '2025-11-15',
      order_date: '2025-12-01',
      difficulty: '普',
      procedure_type: ['手続一式'],
      additional_services: [],
      tax_filing_required: '不要',
      property_rank: 'B',
      total_asset_estimate: 32000000,
    },
  ]
  for (const c of cases) {
    const { error } = await supabase.from('cases').upsert(c, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  案件 ${c.deal_name}: ${error.message}`)
  }
  console.log('   ✅ 案件 2件')

  // 案件メンバー
  const caseMembers = [
    { case_id: 'd1000000-0000-0000-0000-000000000001', member_id: 'a1000000-0000-0000-0000-000000000001', role: 'sales' },
    { case_id: 'd1000000-0000-0000-0000-000000000001', member_id: 'a1000000-0000-0000-0000-000000000002', role: 'manager' },
    { case_id: 'd1000000-0000-0000-0000-000000000001', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'assistant' },
    { case_id: 'd1000000-0000-0000-0000-000000000001', member_id: 'a1000000-0000-0000-0000-000000000005', role: 'lp' },
    { case_id: 'd1000000-0000-0000-0000-000000000002', member_id: 'a1000000-0000-0000-0000-000000000001', role: 'sales' },
    { case_id: 'd1000000-0000-0000-0000-000000000002', member_id: 'a1000000-0000-0000-0000-000000000002', role: 'manager' },
  ]
  // 既存を削除して再投入
  await supabase.from('case_members').delete().eq('case_id', 'd1000000-0000-0000-0000-000000000001')
  await supabase.from('case_members').delete().eq('case_id', 'd1000000-0000-0000-0000-000000000002')
  const { error: cmErr } = await supabase.from('case_members').insert(caseMembers)
  if (cmErr) console.log(`   ⚠️  案件メンバー: ${cmErr.message}`)
  else console.log('   ✅ 案件メンバー 6件')

  // タスク
  const tasks = [
    { id: 'e1000000-0000-0000-0000-000000000001', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'koseki_request_create', title: '戸籍請求書作成', phase: 'phase1', category: '戸籍', status: '完了', priority: '通常', due_date: '2025-11-01', sort_order: 1 },
    { id: 'e1000000-0000-0000-0000-000000000002', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'koseki_mail', title: '戸籍郵送手配', phase: 'phase1', category: '戸籍', status: '完了', priority: '通常', due_date: '2025-11-05', sort_order: 2 },
    { id: 'e1000000-0000-0000-0000-000000000003', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'koseki_arrive_check', title: '戸籍到着確認・読み込み', phase: 'phase1', category: '戸籍', status: '完了', priority: '通常', due_date: '2025-11-15', sort_order: 3 },
    { id: 'e1000000-0000-0000-0000-000000000004', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'heir_survey_create', title: '相続人調査報告書作成', phase: 'phase1', category: '相続人調査', status: '対応中', priority: '通常', due_date: '2025-12-01', sort_order: 5 },
    { id: 'e1000000-0000-0000-0000-000000000005', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'bank_balance_request', title: '残高証明請求', phase: 'phase2', category: '金融機関', status: '対応中', priority: '急ぎ', due_date: '2025-12-10', sort_order: 10 },
    { id: 'e1000000-0000-0000-0000-000000000006', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'insurance_inquiry', title: '保険会社照会', phase: 'phase2', category: '保険', status: '未着手', priority: '通常', due_date: '2025-12-20', sort_order: 13 },
    { id: 'e1000000-0000-0000-0000-000000000007', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'realestate_research', title: '不動産調査（謄本・公図等取得）', phase: 'phase2', category: '不動産', status: '未着手', priority: '通常', due_date: '2026-01-10', sort_order: 16 },
    { id: 'e1000000-0000-0000-0000-000000000008', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'tax_required_check', title: '相続税申告要否判定', phase: 'phase3', category: '相続税', status: '未着手', priority: '通常', due_date: '2026-02-01', sort_order: 20 },
    { id: 'e1000000-0000-0000-0000-000000000009', case_id: 'd1000000-0000-0000-0000-000000000001', template_key: 'division_draft', title: '遺産分割協議書 原案作成', phase: 'phase4', category: '遺産分割', status: '未着手', priority: '通常', due_date: '2026-03-01', sort_order: 30 },
  ]
  for (const t of tasks) {
    const { error } = await supabase.from('tasks').upsert(t, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  タスク ${t.title}: ${error.message}`)
  }
  console.log('   ✅ タスク 9件')

  // タスク担当者
  const taskAssignees = [
    { task_id: 'e1000000-0000-0000-0000-000000000001', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000002', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000003', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000004', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000004', member_id: 'a1000000-0000-0000-0000-000000000004', role: 'sub' },
    { task_id: 'e1000000-0000-0000-0000-000000000005', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000006', member_id: 'a1000000-0000-0000-0000-000000000004', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000008', member_id: 'a1000000-0000-0000-0000-000000000002', role: 'primary' },
    { task_id: 'e1000000-0000-0000-0000-000000000009', member_id: 'a1000000-0000-0000-0000-000000000003', role: 'primary' },
  ]
  // 既存を削除
  for (const t of tasks) {
    await supabase.from('task_assignees').delete().eq('task_id', t.id)
  }
  const { error: taErr } = await supabase.from('task_assignees').insert(taskAssignees)
  if (taErr) console.log(`   ⚠️  タスク担当者: ${taErr.message}`)
  else console.log('   ✅ タスク担当者 9件')

  // ドキュメント
  const documents = [
    { id: 'f1000000-0000-0000-0000-000000000001', case_id: 'd1000000-0000-0000-0000-000000000001', task_id: 'e1000000-0000-0000-0000-000000000001', name: '戸籍等請求書', file_type: 'PDF', generated_by: 'ai', status: '完了' },
    { id: 'f1000000-0000-0000-0000-000000000002', case_id: 'd1000000-0000-0000-0000-000000000001', task_id: 'e1000000-0000-0000-0000-000000000002', name: '戸籍等請求書（相続人）', file_type: 'PDF', generated_by: 'ai', status: '送付済' },
    { id: 'f1000000-0000-0000-0000-000000000003', case_id: 'd1000000-0000-0000-0000-000000000001', name: '委任契約書', file_type: 'Word', generated_by: 'manual', status: '完了' },
    { id: 'f1000000-0000-0000-0000-000000000004', case_id: 'd1000000-0000-0000-0000-000000000001', name: '委任状', file_type: 'PDF', generated_by: 'ai', status: '完了' },
    { id: 'f1000000-0000-0000-0000-000000000005', case_id: 'd1000000-0000-0000-0000-000000000001', name: '名寄帳・評価証明請求', file_type: 'PDF', generated_by: 'ai', status: '返送待ち' },
    { id: 'f1000000-0000-0000-0000-000000000006', case_id: 'd1000000-0000-0000-0000-000000000002', name: '委任契約書', file_type: 'Word', generated_by: 'manual', status: '作成済' },
    { id: 'f1000000-0000-0000-0000-000000000007', case_id: 'd1000000-0000-0000-0000-000000000002', name: '請求書（前受金）', file_type: 'PDF', generated_by: 'ai', status: '完了' },
  ]
  for (const d of documents) {
    const { error } = await supabase.from('documents').upsert(d, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  ドキュメント ${d.name}: ${error.message}`)
  }
  console.log('   ✅ ドキュメント 7件')

  // 請求書
  const invoices = [
    { id: 'a7000000-0000-0000-0000-000000000001', case_id: 'd1000000-0000-0000-0000-000000000001', invoice_number: 'INV-2025-001', invoice_type: '前受金', amount: 440000, status: '前受金入金済', issued_date: '2025-10-20', due_date: '2025-11-20' },
    { id: 'a7000000-0000-0000-0000-000000000002', case_id: 'd1000000-0000-0000-0000-000000000001', invoice_number: 'INV-2025-002', invoice_type: '確定請求', amount: 2860000, status: '確定請求済', issued_date: '2026-01-15', due_date: '2026-02-15' },
    { id: 'a7000000-0000-0000-0000-000000000003', case_id: 'd1000000-0000-0000-0000-000000000002', invoice_number: 'INV-2025-003', invoice_type: '前受金', amount: 220000, status: '前受金請求済', issued_date: '2025-12-05', due_date: '2026-01-05' },
  ]
  for (const inv of invoices) {
    const { error } = await supabase.from('invoices').upsert(inv, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  請求書 ${inv.invoice_number}: ${error.message}`)
  }
  console.log('   ✅ 請求書 3件')

  // 入金
  const payments = [
    { id: 'a8000000-0000-0000-0000-000000000001', invoice_id: 'a7000000-0000-0000-0000-000000000001', amount: 440000, payment_date: '2025-11-10', payment_method: '振込' },
  ]
  for (const p of payments) {
    const { error } = await supabase.from('payments').upsert(p, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  入金: ${error.message}`)
  }
  console.log('   ✅ 入金 1件')

  // スケジュール
  const events = [
    { id: 'a9000000-0000-0000-0000-000000000001', title: '中村さくら様 面談', event_type: 'interview', event_date: '2026-04-07', start_time: '10:00', end_time: '11:30', member_id: 'a1000000-0000-0000-0000-000000000001', case_id: 'd1000000-0000-0000-0000-000000000001', notes: '不動産・金融資産の詳細確認' },
    { id: 'a9000000-0000-0000-0000-000000000002', title: '加藤裕子様 面談', event_type: 'interview', event_date: '2026-04-08', start_time: '14:00', end_time: '15:00', member_id: 'a1000000-0000-0000-0000-000000000002', case_id: 'd1000000-0000-0000-0000-000000000002', notes: '手続一式の説明' },
    { id: 'a9000000-0000-0000-0000-000000000003', title: '戸籍請求 期限', event_type: 'task', event_date: '2026-04-10', member_id: 'a1000000-0000-0000-0000-000000000003', case_id: 'd1000000-0000-0000-0000-000000000001', notes: '横浜市中区役所' },
    { id: 'a9000000-0000-0000-0000-000000000004', title: '相続税申告期限', event_type: 'deadline', event_date: '2026-08-01', member_id: 'a1000000-0000-0000-0000-000000000001', case_id: 'd1000000-0000-0000-0000-000000000001', notes: '死亡日から10ヶ月' },
    { id: 'a9000000-0000-0000-0000-000000000005', title: '月次報告 パートナーMTG', event_type: 'other', event_date: '2026-04-25', start_time: '16:00', end_time: '17:00', member_id: 'a1000000-0000-0000-0000-000000000001', notes: 'LP向け月次報告' },
  ]
  for (const ev of events) {
    const { error } = await supabase.from('events').upsert(ev, { onConflict: 'id' })
    if (error) console.log(`   ⚠️  イベント ${ev.title}: ${error.message}`)
  }
  console.log('   ✅ スケジュール 5件')

  // Step 4: RLS確認
  console.log('')
  console.log('📋 Step 4: RLS（行レベルセキュリティ）を確認中...')

  // anonキーでアクセスできるかテスト
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonClient = createClient(supabaseUrl, anonKey)
  const { data: anonTest, error: anonErr } = await anonClient
    .from('cases')
    .select('id')
    .eq('id', 'd1000000-0000-0000-0000-000000000001')
    .single()

  if (anonErr) {
    console.log('   ⚠️  anonキーではデータにアクセスできません（RLSが有効）')
    console.log('')
    console.log('   ─────────────────────────────────────────────')
    console.log('   ❗ 開発用にRLSを無効化する必要があります')
    console.log('   ─────────────────────────────────────────────')
    console.log('')
    console.log('   Supabaseダッシュボードで以下を実行:')
    console.log(`   👉 https://supabase.com/dashboard/project/ddkfjfhjnicoffaqrxmp/sql/new`)
    console.log('')
    console.log('   下のSQLをコピペして Run:')
    console.log('')
    console.log('   ALTER TABLE cases DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE clients DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE members DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE case_members DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE task_assignees DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE task_templates DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE roles DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE partners DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE documents DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE payments DISABLE ROW LEVEL SECURITY;')
    console.log('   ALTER TABLE events DISABLE ROW LEVEL SECURITY;')
    console.log('')
    console.log('   実行後、このスクリプトを再度実行して確認してください。')
  } else {
    console.log('   ✅ anonキーでアクセス可能（RLS無効 or ポリシー設定済み）')
  }

  // 完了
  console.log('')
  console.log('══════════════════════════════════════════════')
  console.log('✅ デモデータの投入が完了しました！')
  console.log('══════════════════════════════════════════════')
  console.log('')
  console.log('次のステップ:')
  console.log('')
  console.log('  1. 開発サーバーを起動:')
  console.log('     npm run dev')
  console.log('')
  console.log('  2. ログインページにアクセス:')
  console.log('     http://localhost:3000/login')
  console.log('')
  console.log('  3. 案件詳細ページを開く:')
  console.log('     http://localhost:3000/cases/d1000000-0000-0000-0000-000000000001')
  console.log('')
  console.log('  ※ ログインユーザーはSupabase Authで作成が必要です')
  console.log('    Supabase Dashboard > Authentication > Users > Add user')
  console.log(`    👉 https://supabase.com/dashboard/project/ddkfjfhjnicoffaqrxmp/auth/users`)
  console.log('')
}

main().catch(err => {
  console.error('❌ エラー:', err.message)
  process.exit(1)
})

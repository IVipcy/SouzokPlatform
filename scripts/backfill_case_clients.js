// 連携①で作成された既存案件で、case_clients が空のものに対して
// clients テーブルのデータからメイン依頼者をバックフィルする。
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) acc[m[1]] = m[2].replace(/\r$/, '')
  return acc
}, {})

const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  // lp_case_number IS NOT NULL（連携①由来）の案件
  const { data: cases, error } = await sb
    .from('cases')
    .select('id, case_number, lp_case_number, client_id, clients(name, furigana, phone, mobile_phone, relationship_to_deceased)')
    .not('lp_case_number', 'is', null)
  if (error) { console.log('ERROR:', error.message); return }
  console.log(`連携①由来の案件: ${cases.length}件`)

  let inserted = 0
  let skipped = 0
  for (const c of cases) {
    if (!c.clients?.name) { skipped++; continue }
    // 既存の case_clients(priority='main') を確認
    const { data: existing } = await sb
      .from('case_clients')
      .select('id')
      .eq('case_id', c.id)
      .eq('priority', 'main')
      .maybeSingle()
    if (existing) { skipped++; continue }
    const payload = {
      case_id: c.id,
      name: c.clients.name,
      furigana: c.clients.furigana,
      priority: 'main',
      relationship: c.clients.relationship_to_deceased,
      phone: c.clients.phone,
      mobile_phone: c.clients.mobile_phone,
      sort_order: 0,
    }
    const { error: insertErr } = await sb.from('case_clients').insert(payload)
    if (insertErr) {
      console.log(`  ❌ ${c.case_number}: ${insertErr.message}`)
    } else {
      console.log(`  ✅ ${c.case_number}: ${c.clients.name} を依頼者一覧に追加`)
      inserted++
    }
  }
  console.log(`\n結果: ${inserted}件 追加 / ${skipped}件 スキップ（既存 or 名前なし）`)
})()

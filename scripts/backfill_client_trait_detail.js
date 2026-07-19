// 連携①既存案件で、clients.notes に保存されていた「顧客情報備考」を
// cases.client_trait_detail に移し替える（マッピング修正に伴うバックフィル）
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
  // lp_case_number IS NOT NULL（連携①由来）の案件で、client_trait_detail が空のもの
  const { data: cases, error } = await sb
    .from('cases')
    .select('id, case_number, lp_case_number, client_trait_detail, client_id, clients(notes)')
    .not('lp_case_number', 'is', null)
  if (error) { console.log('ERROR:', error.message); return }
  console.log(`連携①由来の案件: ${cases.length}件`)

  let updated = 0
  let skipped = 0
  for (const c of cases) {
    const notes = c.clients?.notes
    if (!notes) { skipped++; continue }
    if (c.client_trait_detail) { skipped++; continue } // 既に何か入っている → 上書きしない
    const { error: upErr } = await sb.from('cases').update({ client_trait_detail: notes }).eq('id', c.id)
    if (upErr) {
      console.log(`  ❌ ${c.case_number}: ${upErr.message}`)
    } else {
      console.log(`  ✅ ${c.case_number}: client_trait_detail を反映`)
      updated++
    }
  }
  console.log(`\n結果: ${updated}件 更新 / ${skipped}件 スキップ`)
})()

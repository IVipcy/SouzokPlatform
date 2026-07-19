// マイグレーション 058/059 で追加したカラムが Supabase に適用済みか確認
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) acc[m[1]] = m[2].replace(/\r$/, '')
  return acc
}, {})
if (!env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log('Parsed keys:', Object.keys(env).join(', '))
  throw new Error('NEXT_PUBLIC_SUPABASE_URL not found in .env.local')
}

const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const cols = ['referral_partner_number', 'deceased_age', 'visit_address', 'visit_notes', 'hearing_content', 'special_notes', 'other_needs']
  const select = `id, ${cols.join(', ')}`
  const { data, error } = await sb.from('cases').select(select).limit(1)
  if (error) {
    console.log('❌ ERROR:', error.message)
    console.log('   Code:', error.code)
    // どの列が無いか具体的にチェック
    for (const c of cols) {
      const r = await sb.from('cases').select(`id, ${c}`).limit(1)
      console.log(`  ${c}: ${r.error ? '❌ ' + r.error.message : '✅'}`)
    }
  } else {
    console.log('✅ 全カラムOK')
    if (data.length) console.log('  サンプル:', Object.keys(data[0]).join(', '))
  }
})()

// migration 059 を直接 Supabase に適用
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) acc[m[1]] = m[2].replace(/\r$/, '')
  return acc
}, {})

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '117_referral_partner_number.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
console.log('Project:', projectRef)

;(async () => {
  // PostgREST 経由では DDL は叩けないので、postgres プロトコルが必要。
  // ここでは psql/pg-meta が無いため、SQL ステートメントを分割して
  // RPC 関数経由で実行する想定だが、Supabase のデフォルト RPC は無いため
  // 結局 SQL Editor で手動実行が必要。代わりに、必要なら HTTPS POST で
  // /pg/query エンドポイント (pg-meta) を叩く方法もある。
  // 今回は最小限のため、ALTER 文だけ pg-meta query API に投げる。

  const queries = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  console.log(`実行するクエリ数: ${queries.length}`)

  for (const q of queries) {
    const trimmed = q.replace(/\s+/g, ' ').slice(0, 100)
    console.log(`→ ${trimmed}${q.length > 100 ? '...' : ''}`)
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: q + ';' }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.log(`  ❌ ${res.status}: ${body.slice(0, 200)}`)
      if (res.status === 404) {
        console.log('\n⚠️  exec_sql RPC が存在しません。Supabase SQL Editor で 117_referral_partner_number.sql を手動実行してください。')
        return
      }
    } else {
      console.log('  ✅ OK')
    }
  }
})()

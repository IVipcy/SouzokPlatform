// LP経由の案件がDBに正しく入っているか確認
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
  // LP経由の全案件
  const { data: lpAll, error: e1 } = await sb
    .from('cases')
    .select('case_number, lp_case_number, status, order_route, order_route_detail, deal_name, created_at')
    .eq('order_route', 'LP経由')
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('=== order_route = "LP経由" の案件 ===')
  if (e1) console.log('ERROR:', e1.message)
  else {
    console.log(`件数: ${lpAll.length}`)
    for (const c of lpAll) {
      console.log(`  ${c.case_number} (LP:${c.lp_case_number}) [${c.status}] route=${c.order_route} detail=${c.order_route_detail}`)
    }
  }

  // 連携テストで作成された案件
  console.log('\n=== 連携テスト案件（lp_case_number IS NOT NULL） ===')
  const { data: integ, error: e2 } = await sb
    .from('cases')
    .select('case_number, lp_case_number, status, order_route, order_route_detail, created_at')
    .not('lp_case_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
  if (e2) console.log('ERROR:', e2.message)
  else {
    console.log(`件数: ${integ.length}`)
    for (const c of integ) {
      console.log(`  ${c.case_number} (LP:${c.lp_case_number}) [${c.status}] route=${c.order_route || 'NULL'} detail=${c.order_route_detail || 'NULL'}`)
    }
  }
})()

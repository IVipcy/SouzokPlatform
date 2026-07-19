// テスト実行後にDBに保存されたデータを確認
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
  const { data, error } = await sb
    .from('cases')
    .select('case_number, lp_case_number, deal_name, status, order_route, order_route_detail, referral_partner_number, deceased_name, deceased_age, visit_address, hearing_content, clients(name, phone, mobile_phone, relationship_to_deceased)')
    .like('lp_case_number', 'TEST%')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    console.log('❌', error.message)
    return
  }
  console.log(`連携経由で作成された案件: ${data.length}件\n`)
  for (const c of data) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`PF管理番号:       ${c.case_number}`)
    console.log(`LP管理番号:       ${c.lp_case_number}`)
    console.log(`案件名:           ${c.deal_name}`)
    console.log(`ステータス:       ${c.status}`)
    console.log(`受注ルート:       ${c.order_route}`)
    console.log(`紹介元:           ${c.order_route_detail}`)
    console.log(`屋号管理番号:     ${c.referral_partner_number}`)
    console.log(`被相続人:         ${c.deceased_name} (${c.deceased_age}歳)`)
    console.log(`伺い先:           ${c.visit_address}`)
    console.log(`ヒアリング内容:   ${c.hearing_content}`)
    if (c.clients) {
      console.log(`依頼者氏名:       ${c.clients.name}`)
      console.log(`依頼者続柄:       ${c.clients.relationship_to_deceased}`)
      console.log(`依頼者TEL:        ${c.clients.phone} / ${c.clients.mobile_phone}`)
    }
  }
})()

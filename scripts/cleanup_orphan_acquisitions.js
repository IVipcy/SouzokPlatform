// 不動産取得資料の孤児（対象未設定）を掃除する。
//   孤児＝ 有効な物件に紐づかず（target_property_id が無い/削除済） かつ 市区町村も無く（target_municipality 空）
//         かつ 未受領（arrival_date が無い）＝安全に消せるもの。
// 使い方:
//   node scripts/cleanup_orphan_acquisitions.js            … 対象を一覧（削除しない・dry run）
//   node scripts/cleanup_orphan_acquisitions.js --delete   … 実際に削除
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) acc[m[1]] = m[2].replace(/\r$/, ''); return acc
}, {})
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const DO_DELETE = process.argv.includes('--delete')

;(async () => {
  const [{ data: acqs, error: e1 }, { data: props, error: e2 }] = await Promise.all([
    sb.from('real_estate_acquisitions').select('id, case_id, item_type, target_property_id, target_municipality, arrival_date'),
    sb.from('real_estate_properties').select('id'),
  ])
  if (e1 || e2) { console.log('ERROR', e1?.message || e2?.message); process.exit(1) }
  const propIds = new Set((props || []).map(p => p.id))

  const orphans = (acqs || []).filter(a => {
    const hasProp = a.target_property_id && propIds.has(a.target_property_id)
    const hasMuni = (a.target_municipality || '').trim() !== ''
    const received = !!a.arrival_date
    return !hasProp && !hasMuni && !received && !!a.item_type
  })

  console.log(`孤児（対象未設定・未受領）: ${orphans.length}件`)
  for (const o of orphans) {
    console.log(`  - ${o.item_type}  case=${o.case_id}  prop=${o.target_property_id ?? 'null'}  id=${o.id}`)
  }

  if (!DO_DELETE) { console.log('\n（dry run。削除するには --delete を付けて再実行）'); return }
  if (orphans.length === 0) { console.log('削除対象なし'); return }
  const { error } = await sb.from('real_estate_acquisitions').delete().in('id', orphans.map(o => o.id))
  if (error) { console.log('削除失敗:', error.message); process.exit(1) }
  console.log(`\n✅ ${orphans.length}件を削除しました`)
})()

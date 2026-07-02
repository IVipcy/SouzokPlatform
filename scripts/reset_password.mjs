// ============================================================
// reset_password.mjs
// パスワードを忘れた人向けの「運用リセット」。管理者が実行し、新しい仮パスワードを発行して本人に伝える。
// （メール/SMTP不要。self-service のメールリセットを作るまでの当面の運用手段。）
//
// 【必要な環境変数】
//   SUPABASE_URL                 … 例 https://xxxx.supabase.co（NEXT_PUBLIC_SUPABASE_URL でも可）
//   SUPABASE_SERVICE_ROLE_KEY    … service_role キー（絶対に公開しない）
//
// 【実行】
//   node scripts/reset_password.mjs user@ocean.legal                 # ランダムな新パスワードを発行
//   node scripts/reset_password.mjs user@ocean.legal 好きな仮パス      # 指定した仮パスワードにする
//
// 実行後に表示される新パスワードを本人へ伝え、ログイン後にプロフィール画面で本人が変更してもらう。
// ============================================================

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const EMAIL = (process.argv[2] || '').toLowerCase()
const NEW_PW = process.argv[3] || null

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!EMAIL || !EMAIL.includes('@')) { console.error('❌ 使い方: node scripts/reset_password.mjs <email> [新パスワード]'); process.exit(1) }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください'); process.exit(1) }

function genPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.randomBytes(12), x => chars[x % chars.length]).join('')
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  const user = await findUserByEmail(EMAIL)
  if (!user) { console.error(`❌ ${EMAIL} のアカウントが見つかりません`); process.exit(1) }

  const password = NEW_PW || genPassword()
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password })
  if (error) { console.error(`❌ リセット失敗: ${error.message}`); process.exit(1) }

  console.log('✓ パスワードをリセットしました')
  console.log(`  対象   : ${EMAIL}`)
  console.log(`  新パス : ${password}`)
  console.log('  → 本人に伝え、ログイン後にプロフィール画面で本人に変更してもらってください。')
}

main().catch(e => { console.error(e); process.exit(1) })

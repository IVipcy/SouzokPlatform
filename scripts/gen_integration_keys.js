/**
 * 相続ステーション連携用の APIキー / HMAC シークレットを生成。
 *
 * 使い方:
 *   node scripts/gen_integration_keys.js
 *
 * 出力された値を：
 *   - Render 環境変数 INBOUND_API_KEY / INBOUND_HMAC_SECRET に設定
 *   - 1Password 共有ボールトに登録して先方に共有
 *
 * 鍵は本番用と検証用で別物を発行すること（流出時の被害範囲を限定）。
 */
const crypto = require('crypto')

function generateKey(bytes = 48) {
  // base64url で 64文字程度（48 bytes ≒ 64 chars）
  return crypto.randomBytes(bytes).toString('base64url')
}

const apiKey = generateKey(48)
const hmacSecret = generateKey(48)

console.log('========================================')
console.log('相続ステーション連携 認証情報')
console.log('========================================')
console.log()
console.log('INBOUND_API_KEY:')
console.log(apiKey)
console.log()
console.log('INBOUND_HMAC_SECRET:')
console.log(hmacSecret)
console.log()
console.log('========================================')
console.log('次の手順：')
console.log('  1. 上記2つを Render の環境変数に設定')
console.log('  2. 1Password 共有ボールトに登録')
console.log('  3. 先方（ステーション開発会社）に通知')
console.log('========================================')

// AI 呼び出しなどコストのかかる API の簡単な回数制限（メモリ内・固定窓）。
//
// サーバー1プロセスの中だけで数えるので、複数インスタンスでは「インスタンスごとに N 回」になる。
// 目的は誤操作や連打・スクリプトでの叩きすぎを止めることで、厳密な課金制御ではない。
// 本格的にやるなら Redis 等に置き換える。

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** 窓を過ぎた古い鍵を掃く（増え続けないように、呼び出しのたびに軽く） */
function sweep(now: number) {
  if (buckets.size < 1000) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number }

/**
 * key（通常は "ルート名:memberId"）ごとに windowMs の間 limit 回まで許す。
 * 超えたら ok=false と、次に許される秒数を返す。
 */
export function rateLimit(key: string, opts: { limit: number; windowMs?: number }): RateLimitResult {
  const windowMs = opts.windowMs ?? 60_000
  const now = Date.now()
  sweep(now)
  const cur = buckets.get(key)
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: opts.limit - 1 }
  }
  if (cur.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) }
  }
  cur.count += 1
  return { ok: true, remaining: opts.limit - cur.count }
}

/** 429 のときに返す日本語メッセージ */
export function rateLimitMessage(r: { retryAfterSec: number }): string {
  return `短時間に呼び出しが多すぎます。${r.retryAfterSec}秒ほど待ってからもう一度お試しください`
}

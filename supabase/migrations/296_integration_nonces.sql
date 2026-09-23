-- 296: 相続ステーション連携のリプレイ防止（ナンス表）（2026-09-23）
--
-- 受信 API は APIキー＋HMAC署名＋タイムスタンプ（±5分）で守っているが、
-- 5分以内なら同じリクエストをそのまま再送できた（同じ署名が何度でも通る）。
-- 受け取った要求の識別子（X-Request-Id、無ければ署名値）をここに入れ、
-- 主キー違反＝再送として 401 にする（src/lib/stationIntegration.ts rejectReplay）。
-- 保持期間（許容ズレの2倍＝10分）を過ぎた行は受信処理の中で掃除する。cron は増やさない。

CREATE TABLE IF NOT EXISTS integration_nonces (
  nonce      text PRIMARY KEY,                    -- "req:{X-Request-Id}" または "sig:{署名}"
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_nonces_created ON integration_nonces(created_at);

-- 連携 API は service_role で書く。画面（authenticated）から触る用途は無いので、
-- RLS を有効にしてポリシーは作らない（＝service_role 以外は読めない・書けない）。
ALTER TABLE integration_nonces ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE integration_nonces IS '相続ステーション連携の受信済みリクエスト識別子（リプレイ防止。10分で掃除）。migration 296';

NOTIFY pgrst, 'reload schema';

-- 確認：
-- SELECT count(*) FROM integration_nonces;
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'integration_nonces';

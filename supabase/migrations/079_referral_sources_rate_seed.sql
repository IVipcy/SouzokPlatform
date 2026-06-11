-- ============================================================
-- 079_referral_sources_rate_seed.sql
-- 紹介元マスタに紹介料率を追加し、テストデータを投入。
--   referral_rate = 紹介料率（%）
-- 経路は constants.ts の ORDER_ROUTES 表記に合わせる（葬儀社経由）。
-- 再実行しても安全（ON CONFLICT で率を更新）。
-- ============================================================

ALTER TABLE referral_sources ADD COLUMN IF NOT EXISTS referral_rate NUMERIC;

INSERT INTO referral_sources (route, name, referral_rate) VALUES
  ('LP経由',     'はせがわ',     10),
  ('LP経由',     'パートナーB',  10),
  ('LP経由',     'パートナーC',  10),
  ('葬儀社経由', '公益社',       10),
  ('葬儀社経由', '横浜セレモ',   10),
  ('葬儀社経由', '伊藤典範',     10)
ON CONFLICT (route, name) DO UPDATE SET referral_rate = EXCLUDED.referral_rate;

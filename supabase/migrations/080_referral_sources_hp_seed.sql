-- ============================================================
-- 080_referral_sources_hp_seed.sql
-- HP経由の紹介元（自社HP）をテストデータとして投入。
--   自社HPは紹介料が発生しないため referral_rate は未設定(NULL)。
-- 再実行しても安全（既存は変更しない）。
-- ============================================================

INSERT INTO referral_sources (route, name) VALUES
  ('HP経由', '自社公式HP'),
  ('HP経由', 'いきいきライフ協会HP')
ON CONFLICT (route, name) DO NOTHING;

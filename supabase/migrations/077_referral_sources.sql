-- ============================================================
-- 077_referral_sources.sql
-- 紹介元マスタ（面談ルート＝受注ルートの「詳細」をルックアップ管理）
--   route = 面談ルート（LP経由 / 葬儀社経由 / HP経由 / 税理士経由）
--   name  = 紹介元名（LP名 / 葬儀社名 / 税理士事務所名 など）
--   ※ 過去客経由は既存依頼者(clients)を参照するため、このマスタには含めない。
-- 経路で絞った検索候補を出し、無ければその場で追加して育てる運用。
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route, name)
);

CREATE INDEX IF NOT EXISTS idx_referral_sources_route ON referral_sources(route);

ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_sources_all ON referral_sources;
CREATE POLICY referral_sources_all ON referral_sources
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

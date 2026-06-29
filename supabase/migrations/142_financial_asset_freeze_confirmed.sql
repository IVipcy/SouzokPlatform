-- ============================================================
-- 142_financial_asset_freeze_confirmed.sql
-- 金融資産の「凍結確認済」フラグ。財産調査禁止期間（口座凍結前）に金融資産を動かさないため、
-- 管理担当が口座凍結を確認したらチェックする。未確認の口座があるうちは、その案件の
-- 金融資産調査・解約タスクは着手不可（ハード制限）。
--   freeze_confirmed     … 凍結確認済か
--   freeze_confirmed_by  … 確認した管理担当
--   freeze_confirmed_at  … 確認日時
-- ============================================================

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS freeze_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_confirmed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS freeze_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_financial_assets_case_freeze ON financial_assets(case_id, freeze_confirmed);

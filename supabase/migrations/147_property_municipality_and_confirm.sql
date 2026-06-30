-- ============================================================
-- 147_property_municipality_and_confirm.sql
-- 不動産を「都道府県＋市区町村」単位でタブ化するためのキーと、
-- 不動産・金融の「確定済」（管理担当のみ／TOP一覧・財産目録へ反映）フラグ。
-- ============================================================

-- 不動産：市区町村（サブタブのグルーピングキー。ヒアリングで入力）＋確定済
ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS municipality text,                 -- 都道府県＋市区町村（例: 東京都墨田区）
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 金融：残高確定（凍結確認 freeze_confirmed とは別概念。残高入力後に確定）
ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS balance_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_confirmed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS balance_confirmed_at timestamptz;

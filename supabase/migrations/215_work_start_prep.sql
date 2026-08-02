-- ============================================================
-- 215_work_start_prep.sql
-- 「作業着手準備」ステータス関連の列 ＋ 割振り担当フラグ。
--   受注系 → 作業着手準備（新）→ 作業進行中(対応中) の間を作る。
--   ・ファイル化（事務管理担当）: filing_status（未/済）
--   ・オーダーシート最終化（管理担当のハンコ）: order_sheet_finalized_*
--   ・作業着手準備へ進めた操作のハンコ: work_prep_advanced_*
--   ・着手OK（作業進行中へ）のハンコ: work_start_ok_*
--   ・割振り担当フラグ: members.is_dispatcher（菅家しずく・上田拓海をシード）
-- cases.status に CHECK 制約は無いので値追加はアプリ側(CASE_STATUSES)のみで足りる。
-- ============================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS filing_status text,                    -- ファイル化：未 / 済
  ADD COLUMN IF NOT EXISTS order_sheet_finalized_at timestamptz,  -- OS最終化ハンコ（管理担当チェック済）
  ADD COLUMN IF NOT EXISTS order_sheet_finalized_by uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_sheet_finalized_name text,
  ADD COLUMN IF NOT EXISTS work_prep_advanced_at timestamptz,     -- 作業着手準備へ進めた
  ADD COLUMN IF NOT EXISTS work_prep_advanced_by uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_prep_advanced_name text,
  ADD COLUMN IF NOT EXISTS work_start_ok_at timestamptz,          -- 着手OK（作業進行中へ）
  ADD COLUMN IF NOT EXISTS work_start_ok_by uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_start_ok_name text;

ALTER TABLE members ADD COLUMN IF NOT EXISTS is_dispatcher boolean NOT NULL DEFAULT false;  -- 割振り担当（管理担当のアサインを差配）

-- 菅家しずく・上田拓海 を割振り担当としてシード（名前一致で付与）。以降はプロフィール編集で設定。
UPDATE members SET is_dispatcher = true WHERE name IN ('菅家しずく', '上田拓海');

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 218_proposal_split_and_manager_skip.sql
-- 面談結果登録まわりの追加。
--   ・提案金額を「司法書士報酬」「行政書士報酬」の2本に分けて持てるように。
--     （既存 proposal_note は互換のため残置。以後は下記2カラムが正）
--   ・割振り依頼ポップの「この案件には管理担当を割り振らない」チェック用フラグ。
--     true の案件は受注ナビ／対応中ナビから「管理担当アサイン」を出さない。
-- ============================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS proposal_judicial text,           -- 提案金額（司法書士報酬。「提案せず」or 税抜カンマ整形）
  ADD COLUMN IF NOT EXISTS proposal_administrative text,     -- 提案金額（行政書士報酬。同上）
  ADD COLUMN IF NOT EXISTS manager_assign_skipped boolean NOT NULL DEFAULT false;  -- 管理担当を割り振らない

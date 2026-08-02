-- ============================================================
-- 214_financial_survey_ban_and_safedeposit.sql
-- 金融資産（預金/証券/信託）の調査禁止指定・投信/貸金庫チェックの列追加。
--   ・調査禁止指定（指定なし/指定あり）→ 指定ありのとき 禁止方法（期間指定/連絡待ち）。
--     期間指定のときだけ survey_prohibited_start/end（既存162）を使う。禁止理由は両方で入力。
--   ・連絡待ちの解除日（お客様から「もう禁止しなくていい」連絡を受けた日）。
--   ・投信有無・貸金庫有無（実務・預金のみのチェック）。貸金庫ありでタスク生成。
-- 凍結確認済は既存 financial_assets.freeze_confirmed（142）を流用する。
-- ============================================================

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS survey_prohibited_designation text,  -- 指定なし / 指定あり（null=指定なし扱い）
  ADD COLUMN IF NOT EXISTS survey_prohibited_method text,       -- 期間指定 / 連絡待ち（指定ありのとき）
  ADD COLUMN IF NOT EXISTS prohibition_released_at date,        -- 連絡待ちの解除日（お客様OK）
  ADD COLUMN IF NOT EXISTS has_investment_trust boolean NOT NULL DEFAULT false,  -- 投信有無（預金・メモ）
  ADD COLUMN IF NOT EXISTS has_safe_deposit boolean NOT NULL DEFAULT false;      -- 貸金庫有無（預金・タスク生成トリガー）

-- 既存で禁止期間/理由が入っている口座は「指定あり・期間指定」に寄せる（データ整合）。
UPDATE financial_assets
  SET survey_prohibited_designation = '指定あり',
      survey_prohibited_method = '期間指定'
  WHERE survey_prohibited_designation IS NULL
    AND (survey_prohibited_start IS NOT NULL OR survey_prohibited_end IS NOT NULL);

NOTIFY pgrst, 'reload schema';

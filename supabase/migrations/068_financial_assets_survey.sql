-- ============================================================
-- 068_financial_assets_survey.sql
-- 金融機関（預金/証券/信託）の調査・進捗カラム（追加のみ・非破壊）
--
--   要否系（要/不要/確認中）:
--     all_branch_survey          全店調査の実施要否（預金）
--     balance_cert_required      残高証明の取得要否（預金/証券）
--     accrued_interest_required  経過利息取得の要否（預金）
--     share_cert_required        所有株式数証明の取得要否（信託）
--     unclaimed_dividend_required 未受領配当金取得の要否（信託）
--   調査期間:
--     survey_period_type  '相続開始日' / '任意指定'
--     survey_date         任意指定時の調査基準日
--   進捗（オーダーシート後のタブで使用）:
--     request_date  請求日
--     arrival_date  到着日
--
--   ※ 解約有無は既存 cancellation_required、銘柄は stock_name を流用。
-- ============================================================

ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS all_branch_survey TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS balance_cert_required TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS accrued_interest_required TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS share_cert_required TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS unclaimed_dividend_required TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS survey_period_type TEXT;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS survey_date DATE;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS request_date DATE;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS arrival_date DATE;

-- ============================================================
-- 148_cost_doublecheck_summary_status.sql
-- ・進捗サマリーに「状態」(未着手/対応中/追加調査中/完了)
-- ・費用の汎用モデル(費用予算/返金分/確定費用=立替実費の実績)＋ダブルチェック(自分以外・請求時/受信時)
-- ・戸籍の追加請求(管理担当の承認ゲート)
-- 対象：戸籍 / 不動産取得資料 / 相続登記(登録免許税)
-- ============================================================

-- 進捗サマリーの状態（全タブ共通）
ALTER TABLE progress_summaries ADD COLUMN IF NOT EXISTS status text;  -- 未着手 / 対応中 / 追加調査中 / 完了

-- 戸籍請求：費用＋ダブルチェック＋追加請求承認
ALTER TABLE koseki_requests
  ADD COLUMN IF NOT EXISTS cost_budget numeric,            -- 費用予算（小為替同梱・予納）
  ADD COLUMN IF NOT EXISTS cost_refund numeric,            -- 返金分（おつり小為替 等）
  ADD COLUMN IF NOT EXISTS cost_confirmed numeric,         -- 確定費用（＝予算−返金。立替実費の実績）
  ADD COLUMN IF NOT EXISTS request_check_name text,        -- 請求時ダブルチェック 確認者
  ADD COLUMN IF NOT EXISTS request_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_check_name text,        -- 受信時ダブルチェック 確認者
  ADD COLUMN IF NOT EXISTS receipt_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_additional boolean NOT NULL DEFAULT false,  -- 追加請求か
  ADD COLUMN IF NOT EXISTS additional_reason text,         -- 追加請求の理由
  ADD COLUMN IF NOT EXISTS additional_approved_by uuid REFERENCES members(id) ON DELETE SET NULL,  -- 追加OK（管理担当）
  ADD COLUMN IF NOT EXISTS additional_approved_at timestamptz;

-- 不動産 取得資料：費用＋ダブルチェック（①市区町村請求＝小為替、②物件取得＝印紙）
ALTER TABLE real_estate_acquisitions
  ADD COLUMN IF NOT EXISTS cost_budget numeric,
  ADD COLUMN IF NOT EXISTS cost_refund numeric,
  ADD COLUMN IF NOT EXISTS cost_confirmed numeric,
  ADD COLUMN IF NOT EXISTS request_check_name text,
  ADD COLUMN IF NOT EXISTS request_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_check_name text,
  ADD COLUMN IF NOT EXISTS receipt_check_at timestamptz;

-- 相続登記：確定費用（登録免許税）＋申請時ダブルチェック
ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS registration_cost numeric,
  ADD COLUMN IF NOT EXISTS registration_check_name text,
  ADD COLUMN IF NOT EXISTS registration_check_at timestamptz;

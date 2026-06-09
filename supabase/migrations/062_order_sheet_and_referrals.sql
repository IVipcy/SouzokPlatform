-- ============================================================
-- 062_order_sheet_and_referrals.sql
-- 案件ライフサイクル刷新の基盤（追加のみ・非破壊）
--
--   1. cases.order_sheet_completed_at
--        オーダーシートの「完成」フラグ（保存時にセット）。
--        受託案件で実務タブ群を解禁し、「対応中」への遷移を許可する条件に使う。
--   2. case_referrals テーブル
--        「他事業者紹介」タブの業者別（税理士/弁護士/不動産/遺品整理）紹介情報。
--        1案件×1業者で最大1行（サブタブの存在＝行の存在 = チェックした業者）。
--
-- 注: いずれも既存テーブルへの追加／新規テーブルのみ。既存挙動は変更しない。
-- ============================================================

-- 1. オーダーシート完成フラグ
ALTER TABLE cases ADD COLUMN IF NOT EXISTS order_sheet_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN cases.order_sheet_completed_at IS 'オーダーシートを完成（保存）した日時。NULL=未作成。実務タブ解禁・対応中遷移の条件。';

-- 2. 他事業者紹介（業者別の紹介情報）
CREATE TABLE IF NOT EXISTS case_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  partner_type TEXT NOT NULL,            -- 税理士 / 弁護士 / 不動産 / 遺品整理
  firm_name TEXT,                        -- 紹介先法人名
  referred_date DATE,                    -- 紹介日付
  content TEXT,                          -- 紹介内容
  estimated_fee NUMERIC,                 -- 見込み報酬
  billing_status TEXT,                   -- 報酬請求状態（未請求 / 請求済 / 入金済 等）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1案件×1業者で1行（業者サブタブの単位）
  CONSTRAINT uniq_case_referral UNIQUE (case_id, partner_type)
);

CREATE INDEX IF NOT EXISTS idx_case_referrals_case ON case_referrals(case_id);

ALTER TABLE case_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_referrals_all ON case_referrals;
CREATE POLICY case_referrals_all ON case_referrals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER case_referrals_updated_at
  BEFORE UPDATE ON case_referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

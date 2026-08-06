-- ============================================================
-- 223_asset_evidence_and_numbers.sql
-- 財産調査に「根拠資料」と、財産目録に必要な番号（口座番号・家屋番号）を追加する。
--
-- ねらい：
--   ・財産目録に載せる金額は、必ず裏付けとなる資料がある状態にしたい。
--     そこで金額の隣で「根拠資料の有無」と「何で確認したか」を持たせる。
--   ・目録の表記に必要な 口座番号（預金）が無かったので追加する。
--     地番(lot_number)・家屋番号(kaoku_bango, migration 098)は既にあるため列追加は不要。
--     区分マンションは 敷地の地番 と 専有部分の家屋番号 の両方を持つので、
--     表は分けず1行で両方保持し、種別に応じてUI側で出し分ける。
-- ============================================================

-- 金融資産（預金・証券・信託・生命保険）
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS has_evidence boolean NOT NULL DEFAULT false;
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS evidence_docs text[];
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS evidence_note text;

COMMENT ON COLUMN financial_assets.account_number IS '口座番号（預金）。財産目録の表記に使う。';
COMMENT ON COLUMN financial_assets.has_evidence  IS '残高の根拠資料があるか。';
COMMENT ON COLUMN financial_assets.evidence_docs IS '根拠資料の種別（複数可）。預金=通帳/残高証明書/経過利息証明書/取引履歴、証券=所有株式数証明/残高証明書/未払い配当金明細 等。';
COMMENT ON COLUMN financial_assets.evidence_note IS '根拠資料の「その他」フリー入力・補足。';

-- 不動産：地番(lot_number)・家屋番号(kaoku_bango) は既存のため列追加なし。

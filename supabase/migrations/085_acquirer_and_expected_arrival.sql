-- ============================================================
-- 085_acquirer_and_expected_arrival.sql
-- 取得行に「取得区分（自社/依頼者）」と「到着予定日（見込み）」を追加。
--   acquirer: 自社 / 依頼者（既定=自社＝従来どおり自社が請求する前提）
--     依頼者取得 = 依頼者が取得して送付 → 書類受信簿で受信 → 到着日が入り受信済になる
--   expected_arrival_date: 到着予定日（見込み。依頼者・役所のどちらが送る場合も）
-- 対象: 戸籍請求 / 金融資産（財産調査）/ 不動産（登記・取得物）
-- すべて追加のみ・非破壊。
-- ============================================================

ALTER TABLE koseki_requests        ADD COLUMN IF NOT EXISTS acquirer TEXT DEFAULT '自社';
ALTER TABLE koseki_requests        ADD COLUMN IF NOT EXISTS expected_arrival_date DATE;

ALTER TABLE financial_assets       ADD COLUMN IF NOT EXISTS acquirer TEXT DEFAULT '自社';
ALTER TABLE financial_assets       ADD COLUMN IF NOT EXISTS expected_arrival_date DATE;

ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS acquirer TEXT DEFAULT '自社';
ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS expected_arrival_date DATE;

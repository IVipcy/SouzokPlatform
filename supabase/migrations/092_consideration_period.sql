-- ============================================================
-- 092_consideration_period.sql
-- 検討期間区分（1週間 / 2週間 / 1ヶ月 / 見込み不明）。
-- 相続ステーションの「提案・検討中（◯）」と対応させ、お客様回答予定日(client_response_due_date)の
-- 上限を決める。検討中・検討中（契約書待ち）で使用。
-- ============================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS consideration_period TEXT;

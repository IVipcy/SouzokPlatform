-- ============================================================
-- 059_referral_partner_number.sql
-- 相続ステーション連携①で受信する「屋号管理番号」用カラムを追加。
--
-- 例：KN02（株式会社セレモニー結）
-- 受信時のキー名: referral_partner_number
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS referral_partner_number TEXT;

COMMENT ON COLUMN cases.referral_partner_number IS '紹介元の屋号管理番号（相続ステーション連携で受信。例：KN02）';

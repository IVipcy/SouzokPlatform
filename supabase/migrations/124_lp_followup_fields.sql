-- ============================================================
-- 124_lp_followup_fields.sql
-- 連携②（PF→ステーション）廃止に伴い、LP担当が新システムのLP案件一覧を
-- 直接見て追いかける運用に変更。検討中案件の追いかけ管理用フィールドを追加。
--
--   - lp_followup_allowed       : LPによる追いかけ可否（true=可 / false=不可）
--   - lp_followup_method        : 連絡方法（電話/メール/SMS/LINE/その他）
--   - lp_followup_method_other  : 連絡方法が「その他」のとき自由入力
--   - lp_followup_due_date      : 追いかけ期限日
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS lp_followup_allowed BOOLEAN;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lp_followup_method TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lp_followup_method_other TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lp_followup_due_date DATE;

COMMENT ON COLUMN cases.lp_followup_allowed IS 'LPによる追いかけ可否（true=可 / false=不可）';
COMMENT ON COLUMN cases.lp_followup_method IS 'LP追いかけの連絡方法（電話/メール/SMS/LINE/その他）';
COMMENT ON COLUMN cases.lp_followup_method_other IS '連絡方法が「その他」のとき自由入力';
COMMENT ON COLUMN cases.lp_followup_due_date IS 'LP追いかけの期限日';

-- ============================================================
-- 155_follow_up_call_needed.sql
-- 追い電話の必要性（検討中ステータスのとき、面談内容詳細の上で入力）。
-- 確度が低い案件で、念のため一定期間追い電話が必要かどうかを記録する。
--   follow_up_call_needed … true=要 / false=不要 / null=未入力
-- 旧 lp_followup_* フィールド（連携②廃止時の追いかけ運用）は廃止し、本フラグに集約。
-- ============================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS follow_up_call_needed boolean;

COMMENT ON COLUMN cases.follow_up_call_needed IS '追い電話の必要性（true=要 / false=不要 / null=未入力）';

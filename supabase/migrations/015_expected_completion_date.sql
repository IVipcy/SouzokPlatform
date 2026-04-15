-- 完了予定日カラム追加
-- これまで completion_date 1本に「完了日」「完了予定日」両方を保存していたバグを修正。
-- 完了日: 最終タスク（案件クローズ）完了時に自動入力される実績日
-- 完了予定日: ユーザーが計画として入力する予定日
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

COMMENT ON COLUMN cases.completion_date IS '完了日（最終タスク完了で自動入力）';
COMMENT ON COLUMN cases.expected_completion_date IS '完了予定日（計画）';

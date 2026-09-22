-- 291: 案件報告モーダルの改修（2026-09-22）
-- 管理担当が書く側に「案件の現状」（フェーズ・最終連絡日・完了予定日）と「次回報告までの対応」
-- （ネクストアクション・担当者・対応期日）を足す。受注担当の確認側は同じものを表で見せ、
-- 「ネクストアクションの追加」でその内容からタスクを作る（書く側ではタスクにしない）。
--   ・last_contact_date / expected_completion_date … 報告した時点の値（案件の値を写す。あとで案件側が変わっても報告は変えない）
--   ・next_action / next_action_assignee_id / next_action_due … 次回報告までの対応（空でも報告できる）
-- 状態（report_state）の呼び名も変える：順調／確認事項あり／相談・対応依頼／要至急対応。
-- 既存の行は書き換えない（画面で読み替える。lib/constants.ts reportStateLabel）。
ALTER TABLE progress_reports
  ADD COLUMN IF NOT EXISTS last_contact_date date,
  ADD COLUMN IF NOT EXISTS expected_completion_date date,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_assignee_id uuid REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_action_due date;
COMMENT ON COLUMN progress_reports.last_contact_date IS '報告時点の最終連絡日（依頼者連絡の最新日。migration 291）';
COMMENT ON COLUMN progress_reports.expected_completion_date IS '報告時点の完了予定日（migration 291）';
COMMENT ON COLUMN progress_reports.next_action IS '次回報告までの対応：ネクストアクション（migration 291）';
COMMENT ON COLUMN progress_reports.next_action_assignee_id IS '次回報告までの対応：担当者（migration 291）';
COMMENT ON COLUMN progress_reports.next_action_due IS '次回報告までの対応：対応期日（migration 291）';

NOTIFY pgrst, 'reload schema';

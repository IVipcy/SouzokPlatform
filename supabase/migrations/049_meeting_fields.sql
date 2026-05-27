-- ============================================================
-- 049_meeting_fields.sql
-- 案件 (cases) に面談関連の新規カラムを追加。
--
--   - meeting_executed_date    : 面談実施日（実際に面談した日）
--   - client_response_due_date : お客様回答予定日（検討中→回答予定日）
--
-- 既存:
--   - meeting_date    : 面談予定日
--   - meeting_place   : 面談場所
--   - lost_reason     : 失注の理由
-- ============================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS meeting_executed_date DATE,
  ADD COLUMN IF NOT EXISTS client_response_due_date DATE;

-- インデックス: 当月面談一覧で meeting_date や client_response_due_date での
-- ソート・フィルタを高速化
CREATE INDEX IF NOT EXISTS idx_cases_meeting_date ON cases(meeting_date);
CREATE INDEX IF NOT EXISTS idx_cases_response_due ON cases(client_response_due_date);

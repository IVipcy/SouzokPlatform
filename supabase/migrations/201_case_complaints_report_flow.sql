-- 案件クレームを「案件報告と同じフォーマット(報告→確認)」に拡張。
-- 既存の severity / contact_method / action(対応内容) はそのまま残す。
-- 案件報告(progress_reports)と同じく status='依頼中'(=表示は「報告中」)/'確認済' を持つ。
-- 追加:
--   status              報告中/確認済
--   requester_id        報告者
--   requested_date      報告日
--   confirmer_id        確認者
--   confirmed_date      確認日
--   confirm_comment     確認した内容

ALTER TABLE case_complaints
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '依頼中'
    CHECK (status IN ('依頼中','確認済')),
  ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES members(id),
  ADD COLUMN IF NOT EXISTS requested_date date,
  ADD COLUMN IF NOT EXISTS confirmer_id uuid REFERENCES members(id),
  ADD COLUMN IF NOT EXISTS confirmed_date date,
  ADD COLUMN IF NOT EXISTS confirm_comment text;

-- 既存行の requested_date は occurred_at から補完。requester_id は created_by から。
UPDATE case_complaints
   SET requested_date = COALESCE(requested_date, occurred_at),
       requester_id   = COALESCE(requester_id, created_by),
       status         = COALESCE(status, '依頼中')
 WHERE requested_date IS NULL OR requester_id IS NULL OR status IS NULL;

CREATE INDEX IF NOT EXISTS idx_case_complaints_status ON case_complaints(status);

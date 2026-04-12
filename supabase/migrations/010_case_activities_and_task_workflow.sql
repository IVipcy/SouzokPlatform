-- =========================================================
-- 010: 活動履歴テーブル + タスク着手者追跡
-- =========================================================

-- 1. 案件活動履歴テーブル
CREATE TABLE IF NOT EXISTS case_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL DEFAULT 'note',
    -- 'task_started'    : タスク着手
    -- 'task_completed'  : タスク完了
    -- 'status_change'   : ステータス変更
    -- 'note'            : 手動メモ
  description TEXT NOT NULL,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_activities_case ON case_activities(case_id);
CREATE INDEX idx_case_activities_task ON case_activities(task_id);
CREATE INDEX idx_case_activities_date ON case_activities(activity_date DESC);

-- 2. タスクに着手者/着手日時を追加（事前割当の代わり）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES members(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

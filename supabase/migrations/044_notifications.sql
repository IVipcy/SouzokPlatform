-- =========================================================
-- 044: 通知テーブル (ベルマーク用)
-- 用途: タスク差戻し / 担当者割当などのシステム内通知
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- 'task_returned' | 'task_assigned' | 'task_due_soon' 等
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_member
  ON notifications(member_id, is_read, created_at DESC);

-- RLS: 既存テーブル群と同じく認証済みユーザーは全操作可
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_all ON notifications;
CREATE POLICY notifications_all ON notifications
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 実施タスク（intake_roles の作業行）から生成したタスクの紐付けキー。
-- intake_roles の各作業に付与する rid（クライアントで採番）を tasks.source_rid に持たせ、
-- 「この作業＝このタスク」を1対1で対応づける（進捗を tasks に一本化するため）。
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_rid TEXT;

COMMENT ON COLUMN tasks.source_rid IS '生成元の実施タスク(intake_roles[].rid)。実施タスク→タスクの紐付け';

CREATE INDEX IF NOT EXISTS idx_tasks_source_rid ON tasks(case_id, source_rid);

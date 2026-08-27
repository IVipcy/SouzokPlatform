-- タスクの「確認中」ステータス（2026-08-27）
--
-- タスク詳細の「担当に確認する」（中身は報連相）から相談を送ると、
-- そのタスクは status='確認中' になり、相手が回答（case_reports.status='確認済'）するまで
-- 完了にできない。どのタスクについての相談かを追えるよう、報連相にタスクを紐づける。

ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_case_reports_task_id ON case_reports(task_id);

-- tasks.status に CHECK 制約は無い（テキスト運用）ため、値の追加だけで足りる。
-- 既存データには影響しない。

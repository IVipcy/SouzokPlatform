-- タスク依存関係テーブル
-- from_task_id（前提タスク）の条件がクリアされたら、to_task_id（次のタスク）に着手可能

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL DEFAULT 'task_completed'
    CHECK (condition_type IN ('task_completed', 'checkpoint')),
  checkpoint_field TEXT,       -- ext_dataのキー（checkpoint時のみ）
  label TEXT,                  -- 条件の表示ラベル（例: '到着日が入力済'）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_task_dep UNIQUE(from_task_id, to_task_id, condition_type)
);

CREATE INDEX idx_task_deps_from ON task_dependencies(from_task_id);
CREATE INDEX idx_task_deps_to ON task_dependencies(to_task_id);
CREATE INDEX idx_task_deps_case ON task_dependencies(case_id);

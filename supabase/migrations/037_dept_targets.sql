-- ============================================================
-- 029_dept_targets.sql
-- 部全体ダッシュボード（サマリタブ）で使う月次目標値を保持するテーブル。
--   - ym ごとに 1 行（new_orders / managing / completed / cycle_months / completed_amount）
--   - completed_amount は「円」単位で保存（UI 側で万円に変換して表示）
-- ============================================================

CREATE TABLE IF NOT EXISTS dept_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ym TEXT NOT NULL UNIQUE,                       -- 'YYYY-MM'
  new_orders INT NOT NULL DEFAULT 0,             -- 新規受注案件 目標（件/月）
  managing INT NOT NULL DEFAULT 0,               -- 管理案件 目標（件/月）
  completed INT NOT NULL DEFAULT 0,              -- 完了案件 目標（件/月）
  cycle_months NUMERIC(4,1) NOT NULL DEFAULT 0,  -- サイクル 目標（カ月）
  completed_amount BIGINT NOT NULL DEFAULT 0,    -- 業務完了金額 目標（円）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dept_targets_ym ON dept_targets(ym);

ALTER TABLE dept_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_targets_select_authenticated" ON dept_targets;
CREATE POLICY "dept_targets_select_authenticated" ON dept_targets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_targets_modify_authenticated" ON dept_targets;
CREATE POLICY "dept_targets_modify_authenticated" ON dept_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at を自動更新
CREATE OR REPLACE FUNCTION update_dept_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dept_targets_updated_at ON dept_targets;
CREATE TRIGGER trg_dept_targets_updated_at
  BEFORE UPDATE ON dept_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_dept_targets_updated_at();

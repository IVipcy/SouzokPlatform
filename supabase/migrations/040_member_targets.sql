-- ============================================================
-- 040_member_targets.sql
-- 受注担当の個人別「新規受注件数」月次目標を保持するテーブル。
--   - member_id × ym で uniq
--   - new_orders_count: 当月新規受注件数の目標値
--   - 達成（actual >= target）したメンバーには UserAvatar に
--     レインボーリング装飾が表示される
-- ============================================================

CREATE TABLE IF NOT EXISTS member_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ym TEXT NOT NULL,                           -- 'YYYY-MM'
  new_orders_count INT NOT NULL DEFAULT 0,    -- 新規受注件数 目標
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (member_id, ym)
);

CREATE INDEX IF NOT EXISTS idx_member_targets_ym ON member_targets(ym);
CREATE INDEX IF NOT EXISTS idx_member_targets_member ON member_targets(member_id);

ALTER TABLE member_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_targets_select_authenticated" ON member_targets;
CREATE POLICY "member_targets_select_authenticated" ON member_targets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "member_targets_modify_authenticated" ON member_targets;
CREATE POLICY "member_targets_modify_authenticated" ON member_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at の自動更新
CREATE OR REPLACE FUNCTION update_member_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_member_targets_updated_at ON member_targets;
CREATE TRIGGER trg_member_targets_updated_at
  BEFORE UPDATE ON member_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_member_targets_updated_at();

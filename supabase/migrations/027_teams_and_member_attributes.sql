-- ============================================================
-- 027_teams_and_member_attributes.sql
-- 月次成績ダッシュボード用に以下を追加:
--   - teams テーブル新設（チームマスタ）
--   - members に team_id / job_type / joined_at / primary_role カラム追加
-- ============================================================

-- =========================
-- 1. teams（チームマスタ）
-- =========================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select_authenticated" ON teams;
CREATE POLICY "teams_select_authenticated" ON teams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "teams_modify_authenticated" ON teams;
CREATE POLICY "teams_modify_authenticated" ON teams
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================
-- 2. members 拡張
--   team_id      : 所属チーム
--   job_type     : 職種（現状は単一カラム。将来マスタ化）
--   joined_at    : 入社日（在籍期間算出に使用）
--   primary_role : 主たる役割（'sales' / 'manager' / 'assistant' / 'lp' / 'accounting'）
--                  ダッシュボード個人テーブルは sales / manager のみ表示する想定
-- =========================
ALTER TABLE members ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE members ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT '総合職';
ALTER TABLE members ADD COLUMN IF NOT EXISTS joined_at DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS primary_role TEXT
  CHECK (primary_role IN ('sales', 'manager', 'assistant', 'lp', 'accounting'));

CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);
CREATE INDEX IF NOT EXISTS idx_members_primary_role ON members(primary_role);

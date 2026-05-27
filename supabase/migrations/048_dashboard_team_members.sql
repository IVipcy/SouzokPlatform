-- ============================================================
-- 048_dashboard_team_members.sql
-- ダッシュボード用の手動チーム編成テーブル
--
-- 仕様:
--   - members.team_id は社員マスタの「正規」所属。
--   - 異動・派遣・メンタリング関係などダッシュボード上の柔軟な
--     チーム編成を別レイヤーで管理する。
--   - kind = 'member' : チーム集計値に含める
--   - kind = 'mentor' : 集計には含めないが、画面上にメンバーとして表示
--   - 1人を複数チームのメンターとして登録可能。
--   - 同一 (team_id, member_id) の組み合わせはユニーク。
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'member'
    CHECK (kind IN ('member', 'mentor')),
  added_by UUID REFERENCES members(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_team_members_team
  ON dashboard_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_team_members_member
  ON dashboard_team_members(member_id);

-- RLS: 認証ユーザーは全操作可（既存テーブルと統一）
ALTER TABLE dashboard_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dashboard_team_members_all ON dashboard_team_members;
CREATE POLICY dashboard_team_members_all ON dashboard_team_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 既存のチーム所属メンバーを 'member' として自動登録（初期データ）
INSERT INTO dashboard_team_members (team_id, member_id, kind)
SELECT m.team_id, m.id, 'member'
  FROM members m
 WHERE m.team_id IS NOT NULL
   AND m.is_active = true
ON CONFLICT (team_id, member_id) DO NOTHING;

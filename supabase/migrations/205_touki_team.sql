-- 相続登記チーム 基盤。
--   1) teams テーブルに「相続登記チーム」システムチームを1件seed（判別用に is_touki_team_special フラグ）
--   2) members.is_touki_team フラグを追加。ONで team_id を相続登記チームに切替（アプリ側で処理）
--   3) tasks.task_kind の CHECK 制約に 'touki_team' を追加
--        既存: case (事務管理) / system (受注/管理担当)
--        新規: touki_team (相続登記チームタスク・権利書の製本など)

-- 1) teams: 相続登記チーム 判別用の予約フラグ列 + seed
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_touki_team_special boolean NOT NULL DEFAULT false;

INSERT INTO teams (name, is_active, is_touki_team_special)
SELECT '相続登記チーム', true, true
 WHERE NOT EXISTS (SELECT 1 FROM teams WHERE is_touki_team_special = true);

-- 2) members.is_touki_team フラグ
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_touki_team boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_members_is_touki_team ON members(is_touki_team);

-- 3) tasks.task_kind CHECK制約更新
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_kind_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_kind_check
  CHECK (task_kind IN ('case', 'system', 'touki_team'));

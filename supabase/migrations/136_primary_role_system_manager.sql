-- ============================================================
-- 136_primary_role_system_manager.sql
-- members.primary_role に 'system_manager' を許可する。
-- 中間テーブル member_roles を使わず、primary_role だけでシステム管理者を
-- 設定できるようにするため（実運用は primary_role 一本のため）。
-- ============================================================

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_primary_role_check;
ALTER TABLE members ADD CONSTRAINT members_primary_role_check
  CHECK (primary_role IS NULL OR primary_role IN (
    'sales', 'manager', 'assistant', 'lp', 'accounting', 'system_manager'
  ));

-- ============================================================
-- 135_system_manager_role.sql
-- システム管理者ロール（全機能・全ダッシュボードのスーパーユーザー）を追加。
-- ＋ 入金突合(銀行CSV)の権限 billing.reconcile を新設し、経理・システム管理者のみ許可。
-- 追加のみ・非破壊。
-- ============================================================

-- system_manager ロール
INSERT INTO roles (key, label, description, sort_order)
VALUES ('system_manager', 'システム管理者', '全機能・全ダッシュボードにアクセスできる管理者', 0)
ON CONFLICT (key) DO NOTHING;

-- 入金突合権限（経理＋システム管理者のみ true。他は false で明示）
INSERT INTO role_permissions (role_id, permission, allowed)
SELECT r.id, 'billing.reconcile', (r.key IN ('accounting', 'system_manager'))
FROM roles r
WHERE r.key IN ('sales', 'manager', 'assistant', 'lp', 'accounting', 'system_manager')
ON CONFLICT (role_id, permission) DO UPDATE SET allowed = EXCLUDED.allowed;

-- system_manager に既存の全権限を許可で付与（スーパーユーザー）
INSERT INTO role_permissions (role_id, permission, allowed)
SELECT (SELECT id FROM roles WHERE key = 'system_manager'), p.permission, true
FROM (SELECT DISTINCT permission FROM role_permissions) p
ON CONFLICT (role_id, permission) DO UPDATE SET allowed = true;

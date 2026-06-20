-- 「初期タスクあげ」システムタスク（sys_initial_tasks_create）を廃止。
-- 076 以降、管理担当アサイン時に ensure_manager_assign_tasks がこのタスクのみ生成していた。
-- 初期タスクは一括生成（業務マスタ）で上げる運用に寄せるため、本タスクは不要として削除する。

-- ── 1. ensure_manager_assign_tasks を no-op に（タスク生成しない） ──
--   呼び出し元（受注時 generate_system_tasks_on_status_change /
--   管理担当アサイン時 sync_system_tasks_on_member_add）は残るが、生成は行わない。
CREATE OR REPLACE FUNCTION ensure_manager_assign_tasks(p_case_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 初期タスクあげ（sys_initial_tasks_create）は廃止。生成タスクなし。
  -- （案件内容の共有は受注時に生成済み。本関数はもう何も生成しない）
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ── 2. 既存の未完了「初期タスクあげ」を削除（完了済みは履歴として残す） ──
DELETE FROM tasks
 WHERE task_kind = 'system'
   AND status <> '完了'
   AND template_key = 'sys_initial_tasks_create';

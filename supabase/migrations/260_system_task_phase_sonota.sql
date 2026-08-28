-- システムタスクの業務区分を 'system' から 'その他' に変える（2026-08-28）
--
-- create_system_task が phase に 'system' を固定で入れていたため、
-- 「管理担当をアサインする」などのシステムタスクの業務区分タグに
-- そのまま "system" と出ていた。GYOMU_ALL に無い値なので、
-- 一覧の業務タブでも「業務」側に落ちて分類がずれていた。
--
-- phase='その他' にすると、業務区分タグが「その他」になり、
-- 一覧の業務タブも「その他」に入る。
-- task_kind='system' は変えないので、担当区分（受注/管理）の扱いは今までどおり。

-- 1) 関数を直す（これから作られるぶん）
--    056 の定義から phase だけを 'その他' に変更したもの。
CREATE OR REPLACE FUNCTION create_system_task(
  p_case_id      UUID,
  p_template_key TEXT,
  p_category     TEXT,
  p_title        TEXT,
  p_procedure    TEXT,
  p_work_role    TEXT,
  p_due_date     DATE DEFAULT NULL,
  p_assign_role  TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_existing UUID;
  v_new_id UUID;
  v_assign_role TEXT;
BEGIN
  -- 既に同じテンプレキーのシステムタスクがあれば作らない (status 問わず)
  SELECT id INTO v_existing
    FROM tasks
   WHERE case_id = p_case_id
     AND task_kind = 'system'
     AND template_key = p_template_key
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- 担当区分: 明示が無ければ work_role(sales/manager) から推定
  v_assign_role := COALESCE(
    p_assign_role,
    CASE WHEN p_work_role IN ('sales', 'manager') THEN p_work_role ELSE NULL END
  );

  INSERT INTO tasks (
    case_id, task_kind, template_key, title, category, phase,
    status, priority, work_role, assign_role, procedure_text, due_date, sort_order
  ) VALUES (
    p_case_id, 'system', p_template_key, p_title, p_category, 'その他',
    '着手前', '通常', p_work_role, v_assign_role, p_procedure, p_due_date, 0
  )
  RETURNING id INTO v_new_id;

  -- 自動アサイン（案件の担当者を task_assignees へ）
  IF v_assign_role IS NOT NULL THEN
    INSERT INTO task_assignees (task_id, member_id, role)
    SELECT v_new_id, cm.member_id, 'primary'
      FROM case_members cm
     WHERE cm.case_id = p_case_id
       AND (
         (v_assign_role = 'both' AND cm.role IN ('sales', 'manager'))
         OR (v_assign_role IN ('sales', 'manager') AND cm.role = v_assign_role)
       )
    ON CONFLICT (task_id, member_id) DO NOTHING;
  END IF;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- 2) 既存データを直す
UPDATE tasks SET phase = 'その他'
WHERE task_kind = 'system' AND phase = 'system';

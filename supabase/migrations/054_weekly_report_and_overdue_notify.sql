-- ============================================================
-- 054_weekly_report_and_overdue_notify.sql
-- 案件アラートの自動化を拡充（053 の generate_case_alert_tasks を差し替え）
--
--   3. 週次報告の漏れ : 直近7日以内に「確認済」の進捗報告が無い管理案件に、
--      管理担当向けの「今週の進捗報告（進捗確認依頼）を行う」システムタスクを週次生成。
--      ※ 未完了の同タスクがある間は再生成しない＝完了/報告のたびに翌週また出る（週次再生成）
--   4. タスク期限超過 : 期限切れの未完了タスクがある案件の管理担当へ通知（新タスクは作らない）。
--      ※ 未読の task_overdue 通知が既にある場合は重複通知しない
-- ============================================================

CREATE OR REPLACE FUNCTION generate_case_alert_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_case RECORD;
  v_rec  RECORD;
  v_count INTEGER := 0;
BEGIN
  -- 1) アサイン未完了（受注3日超過 & 管理担当なし）
  FOR v_case IN
    SELECT c.id
      FROM cases c
     WHERE c.status IN ('受注', '対応中', '保留・長期')
       AND NOT EXISTS (SELECT 1 FROM case_members cm WHERE cm.case_id = c.id AND cm.role = 'manager')
       AND EXISTS (
         SELECT 1 FROM activity_log al
          WHERE al.entity_type = 'case' AND al.entity_id = c.id
            AND al.action = 'status_change' AND al.new_value = '受注'
            AND al.created_at <= now() - INTERVAL '3 days'
       )
  LOOP
    PERFORM create_system_task(
      v_case.id, 'sys_assign_manager', '初期対応', '管理担当をアサインする',
      E'【作業内容】受注から3日以上、管理担当が未アサインです。管理担当を割り当ててください。',
      'sales', CURRENT_DATE
    );
    v_count := v_count + 1;
  END LOOP;

  -- 2) 面談メモ未記載（面談予定日超過 & 面談実施日なし）
  FOR v_case IN
    SELECT c.id
      FROM cases c
     WHERE c.meeting_date IS NOT NULL
       AND c.meeting_date < CURRENT_DATE
       AND c.meeting_executed_date IS NULL
       AND c.status IN ('面談設定済', '検討中')
  LOOP
    PERFORM create_system_task(
      v_case.id, 'sys_meeting_memo', '面談', '面談メモを記載する',
      E'【作業内容】面談予定日を過ぎていますが、面談メモ（面談実施日）が未記録です。面談結果を記録してください。',
      'sales', CURRENT_DATE
    );
    v_count := v_count + 1;
  END LOOP;

  -- 3) 週次報告の漏れ（直近7日以内に確認済の進捗報告が無い管理案件）→ 週次でタスク生成
  FOR v_case IN
    SELECT c.id
      FROM cases c
     WHERE c.status IN ('受注', '対応中', '保留・長期')
       AND NOT EXISTS (
         SELECT 1 FROM progress_reports pr
          WHERE pr.case_id = c.id AND pr.status = '確認済'
            AND pr.confirmed_date >= CURRENT_DATE - INTERVAL '7 days'
       )
       -- 未完了の週次報告タスクが無いときだけ生成（＝週次で再生成される）
       AND NOT EXISTS (
         SELECT 1 FROM tasks t
          WHERE t.case_id = c.id AND t.task_kind = 'system'
            AND t.template_key = 'sys_weekly_report' AND t.status <> '完了'
       )
  LOOP
    INSERT INTO tasks (
      case_id, task_kind, template_key, title, category, phase,
      status, priority, work_role, procedure_text, due_date, sort_order
    ) VALUES (
      v_case.id, 'system', 'sys_weekly_report', '今週の進捗報告（進捗確認依頼）を行う', '定期進捗連絡', 'system',
      '着手前', '通常', 'manager',
      E'【作業内容】今週分の進捗報告（進捗確認依頼）がまだ確認済になっていません。進捗確認依頼を発行してください。',
      CURRENT_DATE, 0
    );
    v_count := v_count + 1;
  END LOOP;

  -- 4) タスク期限超過 → 管理担当へ通知（新タスクは作らない・未読通知があれば重複させない）
  FOR v_rec IN
    SELECT DISTINCT cm.member_id, t.case_id
      FROM tasks t
      JOIN case_members cm ON cm.case_id = t.case_id AND cm.role = 'manager'
     WHERE t.due_date < CURRENT_DATE
       AND t.status NOT IN ('完了', 'キャンセル')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notifications n
       WHERE n.member_id = v_rec.member_id AND n.case_id = v_rec.case_id
         AND n.type = 'task_overdue' AND n.is_read = false
    ) THEN
      INSERT INTO notifications (member_id, type, case_id, title, body)
      VALUES (v_rec.member_id, 'task_overdue', v_rec.case_id, 'タスク期限超過', '期限を過ぎた未完了タスクがあります');
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

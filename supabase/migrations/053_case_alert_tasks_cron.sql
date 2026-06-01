-- ============================================================
-- 053_case_alert_tasks_cron.sql
-- アラートの自動タスク化
--
-- 案件一覧に出すアラートのうち、対応が必要なものを「システムタスク」として自動生成する。
--   1. アサイン未完了 : 受注から3日超過しても管理担当が未アサイン → 受注担当に「管理担当をアサインする」
--   2. 面談メモ未記載 : 面談予定日を過ぎても面談実施日(=メモ)が未記録 → 受注担当に「面談メモを記載する」
--
-- create_system_task() は同一案件×同一 template_key を重複生成しないため、案件ごと1回だけ生成される。
-- （週次報告の漏れ・タスク期限超過は一覧表示のみ。タスク期限超過は元タスクが既に存在するため再生成しない）
-- ============================================================

CREATE OR REPLACE FUNCTION generate_case_alert_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_case RECORD;
  v_count INTEGER := 0;
BEGIN
  -- 1) アサイン未完了（受注3日超過 & 管理担当なし）
  FOR v_case IN
    SELECT c.id
      FROM cases c
     WHERE c.status IN ('受注', '対応中', '保留・長期')
       AND NOT EXISTS (
         SELECT 1 FROM case_members cm WHERE cm.case_id = c.id AND cm.role = 'manager'
       )
       AND EXISTS (
         SELECT 1 FROM activity_log al
          WHERE al.entity_type = 'case'
            AND al.entity_id = c.id
            AND al.action = 'status_change'
            AND al.new_value = '受注'
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

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- pg_cron で日次実行（毎日 0:10 UTC = 9:10 JST。047 と時間をずらす）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'case_alert_tasks_daily';

    PERFORM cron.schedule(
      'case_alert_tasks_daily',
      '10 0 * * *',
      $cron$ SELECT generate_case_alert_tasks(); $cron$
    );
  END IF;
END $$;

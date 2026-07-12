-- ============================================================
-- 164_management_started_weekly_gate.sql
-- 週次報告のカウント開始を「作業進行中（対応中）に入って1週間後」からにする。
--   ・cases.management_started_at（対応中に入った日時）を追加＋トリガーで自動セット。
--   ・既存の対応中案件は activity_log の対応中遷移日 or now()-8日 で backfill（従来どおり即対象）。
--   ・週次報告タスク生成 cron（generate_case_alert_tasks の③）を
--     「対応中 かつ 対応中に入って7日以上経過」に限定（受注段階・保留は対象外）。
-- ============================================================

-- ── 1. 列追加 ──
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS management_started_at TIMESTAMPTZ;

COMMENT ON COLUMN cases.management_started_at IS '作業進行中（対応中）に入った日時。週次報告のカウント開始基準（対応中＋7日）。';

-- ── 2. トリガー: status が対応中になったら（未設定なら）日時をセット ──
CREATE OR REPLACE FUNCTION set_management_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '対応中' AND NEW.management_started_at IS NULL THEN
    NEW.management_started_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_set_management_started ON cases;
CREATE TRIGGER cases_set_management_started
  BEFORE INSERT OR UPDATE OF status ON cases
  FOR EACH ROW EXECUTE FUNCTION set_management_started_at();

-- ── 3. 既存の対応中案件を backfill（対応中遷移ログ or now()-8日で即対象化） ──
UPDATE cases c
   SET management_started_at = COALESCE(
     (SELECT MIN(al.created_at) FROM activity_log al
       WHERE al.entity_type = 'case' AND al.entity_id = c.id
         AND al.action = 'status_change' AND al.new_value = '対応中'),
     now() - INTERVAL '8 days'
   )
 WHERE c.status = '対応中' AND c.management_started_at IS NULL;

-- ── 4. 週次報告タスク生成 cron を「対応中＋7日」に限定して差し替え ──
--   （056 の generate_case_alert_tasks を再定義。変更は③のWHERE条件のみ。）
CREATE OR REPLACE FUNCTION generate_case_alert_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_case RECORD;
  v_rec  RECORD;
  v_task_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- 1) アサイン未完了（受注3日超過 & 管理担当なし）→ 受注担当へ。期限=受注日+1日
  FOR v_case IN
    SELECT c.id, COALESCE(c.order_received_date, CURRENT_DATE) AS order_date
      FROM cases c
     WHERE c.status IN ('受注', '対応中')
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
      'sales', v_case.order_date + 1, 'sales'
    );
    v_count := v_count + 1;
  END LOOP;

  -- 2) 面談メモ未記載（面談予定日超過 & 面談実施日なし）→ 受注担当へ。期限=面談予定日
  FOR v_case IN
    SELECT c.id, c.meeting_date
      FROM cases c
     WHERE c.meeting_date IS NOT NULL
       AND c.meeting_date < CURRENT_DATE
       AND c.meeting_executed_date IS NULL
       AND c.status IN ('面談設定済', '検討中', '検討中（契約書待ち）')
  LOOP
    PERFORM create_system_task(
      v_case.id, 'sys_meeting_memo', '面談', '面談メモを記載する',
      E'【作業内容】面談予定日を過ぎていますが、面談メモ（面談実施日）が未記録です。面談結果を記録してください。',
      'sales', v_case.meeting_date, 'sales'
    );
    v_count := v_count + 1;
  END LOOP;

  -- 3) 週次報告の漏れ → 管理担当へ週次生成。
  --    「対応中」かつ「対応中に入って7日以上経過」の案件のみ（受注段階・入りたては対象外）。
  FOR v_case IN
    SELECT c.id
      FROM cases c
     WHERE c.status = '対応中'
       AND c.management_started_at IS NOT NULL
       AND c.management_started_at <= now() - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM progress_reports pr
          WHERE pr.case_id = c.id AND pr.status = '確認済'
            AND pr.confirmed_date >= CURRENT_DATE - INTERVAL '7 days'
       )
       AND NOT EXISTS (
         SELECT 1 FROM tasks t
          WHERE t.case_id = c.id AND t.task_kind = 'system'
            AND t.template_key = 'sys_weekly_report' AND t.status <> '完了'
       )
  LOOP
    INSERT INTO tasks (
      case_id, task_kind, template_key, title, category, phase,
      status, priority, work_role, assign_role, procedure_text, due_date, sort_order
    ) VALUES (
      v_case.id, 'system', 'sys_weekly_report', '今週の進捗報告（進捗確認依頼）を行う', '定期進捗連絡', 'system',
      '着手前', '通常', 'manager', 'manager',
      E'【作業内容】今週分の進捗報告（進捗確認依頼）がまだ確認済になっていません。進捗確認依頼を発行してください。',
      CURRENT_DATE, 0
    )
    RETURNING id INTO v_task_id;

    -- 管理担当へ自動アサイン
    INSERT INTO task_assignees (task_id, member_id, role)
    SELECT v_task_id, cm.member_id, 'primary'
      FROM case_members cm
     WHERE cm.case_id = v_case.id AND cm.role = 'manager'
    ON CONFLICT (task_id, member_id) DO NOTHING;

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

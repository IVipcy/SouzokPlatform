-- ============================================================
-- 056_system_tasks_redefine.sql
-- システムタスク定義の刷新（引き継ぎ仕様 フェーズ2）
--
-- 変更点:
--   1. tasks.assign_role 追加（'sales' / 'manager' / 'both'）。
--      = 担当区分（受注担当 / 管理担当 / 両担当）。自動アサインとチームタスクのラベルに使う。
--   2. create_system_task() を刷新し、生成時に task_assignees へ自動アサイン。
--        - sales   → 案件の受注担当へ
--        - manager → 案件の管理担当へ
--        - both    → 受注担当＋管理担当の両方へ
--      （旧シグネチャ互換: p_assign_role 省略時は work_role(sales/manager) から推定）
--   3. 受注時に生成するシステムタスクを見直し:
--        - 削除: 契約書の作成・送付 / 契約書の確認 / 送付書類の確認
--        - 追加: 案件詳細入力（オーダーシート）  受注日+3日
--        - 標準期限を自動設定（前受金請求書=受注日当日 等）
--        - 案件内容の共有 / 初期タスクあげ は「管理担当アサイン時」に移動
--        - お客様への御礼連絡 は「前受金入金の確認 完了時」に移動（タスク依存）
--   4. 管理担当アサイン時に 案件内容の共有(+3日) / 初期タスクあげ(+1日) を生成。
--      併せて、後から担当が増えた場合に both/該当ロールのシステムタスクへ自動アサインを backfill。
--   5. 前受金入金の確認の期限を、前受金請求書（invoices.due_date）に追従させる。
--   6. アラート系cron(generate_case_alert_tasks)の標準期限を仕様に合わせる。
-- ============================================================

-- ── 1. assign_role 列 ──
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assign_role TEXT
  CHECK (assign_role IN ('sales', 'manager', 'both'));

-- ============================================================
-- 2. create_system_task: 生成 + 自動アサイン
-- ============================================================
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
    p_case_id, 'system', p_template_key, p_title, p_category, 'system',
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

-- ============================================================
-- 3. 管理担当アサイン由来のタスク生成（受注後に管理担当が紐付いた時）
--    案件内容の共有(+3日) / 初期タスクあげ(+1日)
--    ※ create_system_task の重複ガードにより案件ごと1回だけ生成
-- ============================================================
CREATE OR REPLACE FUNCTION ensure_manager_assign_tasks(p_case_id UUID)
RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_assigned DATE;
BEGIN
  SELECT status INTO v_status FROM cases WHERE id = p_case_id;
  -- 受注以降の案件のみ対象
  IF v_status NOT IN ('受注', '対応中', '保留・長期', '完了') THEN
    RETURN;
  END IF;

  -- 管理担当のアサイン日（複数いれば最古）
  SELECT MIN(assigned_at)::date INTO v_assigned
    FROM case_members
   WHERE case_id = p_case_id AND role = 'manager';

  IF v_assigned IS NULL THEN
    RETURN;  -- 管理担当未アサイン
  END IF;

  -- 案件内容の共有（受注担当）: 管理担当アサイン日 +3日
  PERFORM create_system_task(
    p_case_id, 'sys_case_handover', '初期対応', '案件内容の共有',
    E'【作業内容】受注担当者から管理担当者へ案件の引継ぎを行う\n\n【手順】\n□ 割振りされたメールを確認、管理担当者に共有',
    'sales', v_assigned + 3, 'sales'
  );

  -- 初期タスクあげ（両担当）: 管理担当アサイン日 +1日
  PERFORM create_system_task(
    p_case_id, 'sys_initial_tasks_create', '初期対応', '初期タスクあげ',
    E'【作業内容】契約書返送・前金入金確認後、初期に動けるタスクを全てあげる\n\n【手順】\n□ オーダーシートを参照し、可能な案件タスクをあげる',
    'manager', v_assigned + 1, 'both'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. 案件ステータス変更時のシステムタスク自動生成（刷新）
-- ============================================================
CREATE OR REPLACE FUNCTION generate_system_tasks_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_order_date DATE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ── 検討中 / 検討中（契約書待ち） → 検討状況の確認 ──
  IF NEW.status IN ('検討中', '検討中（契約書待ち）') THEN
    PERFORM create_system_task(
      NEW.id, 'sys_review_status', '面談', '検討状況の確認',
      E'【作業内容】面談実施後、お客様の回答予定日に検討状況を確認する\n\n【手順】\n□ 案件詳細の回答予定日を確認\n□ お客様に連絡し、検討状況をヒアリング\n□ やり取り履歴に記録',
      'sales', NEW.client_response_due_date, 'sales'
    );
  END IF;

  -- ── 受注 → 初期システムタスク ──
  IF NEW.status = '受注' THEN
    v_order_date := COALESCE(NEW.order_received_date, CURRENT_DATE);

    -- 案件詳細入力（オーダーシート）受注日+3日 / 受注担当
    PERFORM create_system_task(
      NEW.id, 'sys_order_sheet', '初期対応', '案件詳細入力（オーダーシート）',
      E'【作業内容】面談内容をもとに案件詳細（オーダーシート）を入力する\n\n【手順】\n□ 面談メモ・受領資料を確認\n□ 案件詳細の各タブ（基本情報・受注内容・財産 等）を入力',
      'sales', v_order_date + 3, 'sales'
    );

    -- 前受金請求書作成・送付 受注日当日 / 両担当
    PERFORM create_system_task(
      NEW.id, 'sys_advance_invoice', '初期対応', '前受金請求書作成・送付',
      E'【作業内容】前受金の請求書を発行しお客様に請求する\n\n【手順】\n□ 案件詳細の契約・報酬・請求タブで前受金額を入力\n□ 請求書発行ボタンで請求書を発行\n□ 発行後、ステータスを入金待ちに変更',
      'sales', v_order_date, 'both'
    );

    -- 前受金入金の確認 期限=前受金請求書の入金予定日（後追いで設定） / 両担当
    PERFORM create_system_task(
      NEW.id, 'sys_advance_payment_confirm', '初期対応', '前受金入金の確認',
      E'【作業内容】お客様からの入金確認\n\n【手順】\n□ 経理メール / 顧客管理システムで入金ステータスを確認',
      'sales', (
        SELECT i.due_date FROM invoices i
         WHERE i.case_id = NEW.id AND i.invoice_type = '前受金'
         ORDER BY i.created_at DESC LIMIT 1
      ), 'both'
    );

    -- 原本預かり証の送付 期限なし / 両担当
    PERFORM create_system_task(
      NEW.id, 'sys_original_receipt', '初期対応', '原本預かり証の送付',
      E'【作業内容】お預かりした原本に対し、原本預かり証を発行・送付する\n\n【手順】\n□ 預かり書類の通数を確認\n□ 原本預かり証を発行、写しを取って原本を返送',
      'sales', NULL, 'both'
    );

    -- 受注時点で既に管理担当がいる場合は、アサイン由来タスクも生成
    PERFORM ensure_manager_assign_tasks(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. case_members 追加時: 管理担当タスク生成 + 既存システムタスクへの自動アサイン backfill
-- ============================================================
CREATE OR REPLACE FUNCTION sync_system_tasks_on_member_add()
RETURNS TRIGGER AS $$
BEGIN
  -- 既存システムタスク（未完了）へ、追加された担当者を backfill
  IF NEW.role IN ('sales', 'manager') THEN
    INSERT INTO task_assignees (task_id, member_id, role)
    SELECT t.id, NEW.member_id, 'primary'
      FROM tasks t
     WHERE t.case_id = NEW.case_id
       AND t.task_kind = 'system'
       AND t.status <> '完了'
       AND (t.assign_role = NEW.role OR t.assign_role = 'both')
    ON CONFLICT (task_id, member_id) DO NOTHING;
  END IF;

  -- 管理担当が付いたら、案件内容の共有 / 初期タスクあげ を生成
  IF NEW.role = 'manager' THEN
    PERFORM ensure_manager_assign_tasks(NEW.case_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_members_sync_system_tasks ON case_members;
CREATE TRIGGER case_members_sync_system_tasks
  AFTER INSERT ON case_members
  FOR EACH ROW EXECUTE FUNCTION sync_system_tasks_on_member_add();

-- ============================================================
-- 6. お客様への御礼連絡: 前受金入金の確認が完了したら生成（期限=完了日）
-- ============================================================
CREATE OR REPLACE FUNCTION generate_thanks_task_on_payment_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.task_kind = 'system'
     AND NEW.template_key = 'sys_advance_payment_confirm'
     AND NEW.status = '完了'
     AND OLD.status IS DISTINCT FROM '完了'
  THEN
    PERFORM create_system_task(
      NEW.case_id, 'sys_thanks_contact', '初期対応', 'お客様への御礼連絡',
      E'【作業内容】ご入金・書類送付の御礼連絡\n\n【手順】\n□ 入金確認が完了したら御礼の連絡をする',
      'sales', COALESCE(NEW.completed_at, CURRENT_DATE), 'both'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_generate_thanks_on_payment ON tasks;
CREATE TRIGGER tasks_generate_thanks_on_payment
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION generate_thanks_task_on_payment_confirm();

-- ============================================================
-- 7. 前受金請求書(invoices)の入金予定日 → 前受金入金の確認タスクの期限に追従
-- ============================================================
CREATE OR REPLACE FUNCTION sync_advance_payment_due()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_type = '前受金' AND NEW.due_date IS NOT NULL THEN
    UPDATE tasks
       SET due_date = NEW.due_date
     WHERE case_id = NEW.case_id
       AND task_kind = 'system'
       AND template_key = 'sys_advance_payment_confirm'
       AND status <> '完了';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_sync_advance_payment_due ON invoices;
CREATE TRIGGER invoices_sync_advance_payment_due
  AFTER INSERT OR UPDATE OF due_date, invoice_type ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_advance_payment_due();

-- ============================================================
-- 8. アラート系cron: 標準期限を仕様に合わせる + 週次報告の担当アサイン
-- ============================================================
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

  -- 3) 週次報告の漏れ（直近7日以内に確認済の進捗報告が無い管理案件）→ 管理担当へ週次生成
  FOR v_case IN
    SELECT c.id
      FROM cases c
     WHERE c.status IN ('受注', '対応中', '保留・長期')
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

-- ============================================================
-- 9. 廃止タスクの掃除（未完了のみ削除。完了済みは履歴として残す）
-- ============================================================
DELETE FROM tasks
 WHERE task_kind = 'system'
   AND status <> '完了'
   AND template_key IN ('sys_contract_create', 'sys_contract_confirm', 'sys_received_docs_check');

-- ============================================================
-- 10. 既存システムタスクへ assign_role / 自動アサインを backfill
-- ============================================================
-- 既存の system タスクに assign_role を補完（work_role から推定。両担当系は個別補正）
UPDATE tasks
   SET assign_role = CASE
     WHEN template_key IN ('sys_advance_invoice', 'sys_advance_payment_confirm',
                           'sys_thanks_contact', 'sys_original_receipt', 'sys_initial_tasks_create') THEN 'both'
     WHEN work_role = 'manager' THEN 'manager'
     WHEN work_role = 'sales' THEN 'sales'
     ELSE assign_role
   END
 WHERE task_kind = 'system' AND assign_role IS NULL;

-- 未完了システムタスクへ、案件担当者を backfill アサイン
INSERT INTO task_assignees (task_id, member_id, role)
SELECT t.id, cm.member_id, 'primary'
  FROM tasks t
  JOIN case_members cm ON cm.case_id = t.case_id
 WHERE t.task_kind = 'system'
   AND t.status <> '完了'
   AND t.assign_role IS NOT NULL
   AND (
     (t.assign_role = 'both' AND cm.role IN ('sales', 'manager'))
     OR (t.assign_role IN ('sales', 'manager') AND cm.role = t.assign_role)
   )
ON CONFLICT (task_id, member_id) DO NOTHING;

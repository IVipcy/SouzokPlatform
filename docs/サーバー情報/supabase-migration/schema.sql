


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_progress_memo_on_task_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result text;
BEGIN
  -- 完了に切り替わった瞬間のみ
  IF NEW.status = '完了' AND OLD.status IS DISTINCT FROM '完了' THEN
    result := NULLIF(btrim(COALESCE(NEW.ext_data->>'execution_result', '')), '');
    IF result IS NOT NULL THEN
      INSERT INTO case_activities (case_id, task_id, member_id, activity_type, description, activity_date, title)
      VALUES (NEW.case_id, NEW.id, NEW.started_by, 'note', result, COALESCE(NEW.completed_at, CURRENT_DATE), NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."add_progress_memo_on_task_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_document_receipt_sequence"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.sequence_no IS NULL OR NEW.sequence_no = 0 THEN
    SELECT COALESCE(MAX(sequence_no), 0) + 1
      INTO NEW.sequence_no
      FROM document_receipts
      WHERE received_date = NEW.received_date;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_document_receipt_sequence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_set_case_completion_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 「完了」に変わった瞬間のみ
  IF NEW.status = '完了' AND (OLD.status IS DISTINCT FROM '完了') THEN
    -- case_close テンプレートのタスクなら案件の完了日を設定
    IF NEW.template_key = 'case_close' THEN
      UPDATE cases
        SET completion_date = CURRENT_DATE
        WHERE id = NEW.case_id
          AND completion_date IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_set_case_completion_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_existing UUID;
  v_new_id UUID;
  v_priority TEXT;
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

  v_priority := COALESCE((SELECT '通常'), '通常');

  INSERT INTO tasks (
    case_id, task_kind, template_key, title, category, phase,
    status, priority, work_role, procedure_text, due_date, sort_order
  ) VALUES (
    p_case_id, 'system', p_template_key, p_title, p_category, 'system',
    '着手前', '通常', p_work_role, p_procedure, p_due_date, 0
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date" DEFAULT NULL::"date", "p_assign_role" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date", "p_assign_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_manager_assign_tasks"("p_case_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 初期タスクあげ（sys_initial_tasks_create）は廃止。生成タスクなし。
  -- （案件内容の共有は受注時に生成済み。本関数はもう何も生成しない）
  RETURN;
END;
$$;


ALTER FUNCTION "public"."ensure_manager_assign_tasks"("p_case_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_case_alert_tasks"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_case_alert_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_system_tasks_on_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 初期対応タスクはアラート通知に移行したため、ここでは何も生成しない。
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_system_tasks_on_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_thanks_task_on_payment_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_thanks_task_on_payment_confirm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_case_member_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO activity_log (entity_type, entity_id, action, new_value, metadata)
    VALUES ('case', NEW.case_id, 'assignee_change', NEW.role,
            jsonb_build_object('op', 'add', 'member_id', NEW.member_id, 'role', NEW.role));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO activity_log (entity_type, entity_id, action, old_value, metadata)
    VALUES ('case', OLD.case_id, 'assignee_change', OLD.role,
            jsonb_build_object('op', 'remove', 'member_id', OLD.member_id, 'role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."log_case_member_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_case_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO activity_log (entity_type, entity_id, action, old_value, new_value, created_at)
    VALUES ('case', NEW.id, 'status_change', OLD.status, NEW.status, now());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_case_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_periodic_progress"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_case RECORD;
  v_last_date DATE;
  v_count INTEGER := 0;
BEGIN
  -- 対象: status が「受注」または「対応中」の案件
  FOR v_case IN
    SELECT id, deal_name FROM cases
    WHERE status IN ('受注', '対応中')
  LOOP
    -- 最終連絡日を取得
    SELECT MAX(communicated_at) INTO v_last_date
      FROM client_communications
     WHERE case_id = v_case.id;

    -- 一度も連絡がない案件は対象外（運用開始されていない判定）
    IF v_last_date IS NULL THEN
      CONTINUE;
    END IF;

    -- 直近の連絡から 7日経過していない場合スキップ
    IF v_last_date > CURRENT_DATE - INTERVAL '7 days' THEN
      CONTINUE;
    END IF;

    -- 既に未完了の「sys_periodic_contact」がある場合スキップ
    IF EXISTS (
      SELECT 1 FROM tasks
       WHERE case_id = v_case.id
         AND task_kind = 'system'
         AND template_key = 'sys_periodic_contact'
         AND status <> '完了'
    ) THEN
      CONTINUE;
    END IF;

    -- システムタスク生成
    PERFORM create_system_task(
      v_case.id,
      'sys_periodic_contact',
      '定期進捗連絡',
      '定期進捗連絡',
      E'【作業内容】お客様への定期的な進捗連絡\n\n【手順】\n□ 案件詳細の依頼者タブを確認\n□ お客様に進捗をご連絡\n□ やり取り履歴に記録',
      'sales',
      CURRENT_DATE  -- 期限=本日
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."notify_periodic_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_management_started_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = '対応中' AND NEW.management_started_at IS NULL THEN
    NEW.management_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_management_started_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_task_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 完了に切り替わった瞬間に当日日付をセット（既に値があれば尊重）
  IF NEW.status = '完了' AND (OLD.status IS DISTINCT FROM '完了') AND NEW.completed_at IS NULL THEN
    NEW.completed_at = CURRENT_DATE;
  END IF;
  -- 完了から外れた場合は completed_at をクリア
  IF NEW.status <> '完了' AND OLD.status = '完了' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_task_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_advance_payment_due"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_advance_payment_due"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_case_has_complaint"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_case uuid;
  has_any boolean;
BEGIN
  target_case := COALESCE(NEW.case_id, OLD.case_id);
  SELECT EXISTS(
    SELECT 1 FROM case_complaints
    WHERE case_id = target_case AND severity IN ('クレーム','大クレーム')
  ) INTO has_any;
  -- 既存の client_communications='クレーム対応' からのフラグも尊重（OR）
  IF NOT has_any THEN
    SELECT EXISTS(
      SELECT 1 FROM client_communications
      WHERE case_id = target_case AND communication_type = 'クレーム対応'
    ) INTO has_any;
  END IF;
  UPDATE cases SET has_complaint = has_any WHERE id = target_case;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_case_has_complaint"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_review_task_due_on_response_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.client_response_due_date IS DISTINCT FROM OLD.client_response_due_date THEN
    UPDATE tasks
       SET due_date = NEW.client_response_due_date
     WHERE case_id = NEW.id
       AND template_key = 'sys_review_status'
       AND status <> '完了';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_review_task_due_on_response_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_system_tasks_on_member_add"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_system_tasks_on_member_add"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_client_communications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_client_communications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_dept_targets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_dept_targets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_document_dispatches_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_document_dispatches_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_document_receipts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_document_receipts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_targets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_member_targets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sagyo_documents_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_sagyo_documents_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sales_targets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_sales_targets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "old_value" "text",
    "new_value" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agreement_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "heir_id" "uuid",
    "sent_date" "date",
    "received_date" "date",
    "received" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agreement_dispatches" OWNER TO "postgres";


COMMENT ON TABLE "public"."agreement_dispatches" IS '遺産分割協議書の送付・受領状況（相続人単位）';



COMMENT ON COLUMN "public"."agreement_dispatches"."sent_date" IS '協議書の送付日';



COMMENT ON COLUMN "public"."agreement_dispatches"."received_date" IS '協議書の返送（受領）日';



COMMENT ON COLUMN "public"."agreement_dispatches"."received" IS '受領済（署名・押印済の返送を確認）';



CREATE TABLE IF NOT EXISTS "public"."asset_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "asset_class" "text",
    "detail" "text",
    "amount" numeric,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allocations" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payer_heir_id" "uuid",
    "payer_name" "text"
);


ALTER TABLE "public"."asset_inventory" OWNER TO "postgres";


COMMENT ON COLUMN "public"."asset_inventory"."allocations" IS '取得者ごとの割付 { heir_id: 金額 }。空なら未割付。';



COMMENT ON COLUMN "public"."asset_inventory"."payer_heir_id" IS '立替者（この債務・費用を既に払った相続人）。相続人間の精算計算に使う。';



COMMENT ON COLUMN "public"."asset_inventory"."payer_name" IS '立替者の氏名（相続人一覧に無い人のフリー入力。計算対象外の参考表示）。';



CREATE TABLE IF NOT EXISTS "public"."billing_expense_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "shigyo" "text",
    "label" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "taxable" boolean DEFAULT false NOT NULL,
    "quantity" numeric,
    "unit_price" numeric,
    "note" "text",
    "source_kind" "text",
    "source_id" "uuid"
);


ALTER TABLE "public"."billing_expense_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."case_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "member_id" "uuid",
    "activity_type" "text" DEFAULT 'note'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "activity_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "gyomu" "text"
);


ALTER TABLE "public"."case_activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."case_activities"."title" IS '進捗メモのタイトル（任意）。NULLならタスクリンク等にフォールバック表示。';



CREATE TABLE IF NOT EXISTS "public"."case_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "furigana" "text",
    "priority" "text" DEFAULT 'main'::"text" NOT NULL,
    "birth_date" "date",
    "relationship" "text",
    "phone" "text",
    "email" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "postal_code" "text",
    "address" "text",
    "mobile_phone" "text",
    "preferred_contact" "text"[],
    "has_special_chars" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."case_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."case_complaints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "occurred_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "severity" "text" NOT NULL,
    "contact_method" "text",
    "detail" "text",
    "action" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT '依頼中'::"text" NOT NULL,
    "requester_id" "uuid",
    "requested_date" "date",
    "confirmer_id" "uuid",
    "confirmed_date" "date",
    "confirm_comment" "text",
    CONSTRAINT "case_complaints_action_check" CHECK (("action" = ANY (ARRAY['謝罪・即対応（完結）'::"text", '謝罪・受注相談'::"text"]))),
    CONSTRAINT "case_complaints_contact_method_check" CHECK (("contact_method" = ANY (ARRAY['電話'::"text", 'LINE'::"text", 'メール'::"text", '手紙'::"text"]))),
    CONSTRAINT "case_complaints_severity_check" CHECK (("severity" = ANY (ARRAY['少し不満'::"text", '不満'::"text", 'クレーム'::"text", '大クレーム'::"text"]))),
    CONSTRAINT "case_complaints_status_check" CHECK (("status" = ANY (ARRAY['依頼中'::"text", '確認済'::"text"])))
);


ALTER TABLE "public"."case_complaints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."case_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "document_name" "text" NOT NULL,
    "sent_date" "date",
    "sent_to" "text",
    "quantity" integer DEFAULT 1,
    "received_date" "text",
    "received_file_path" "text",
    "received_file_name" "text",
    "received_file_type" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "task_id" "uuid",
    "outbound_file_path" "text",
    "outbound_file_name" "text",
    "outbound_file_type" "text",
    "outbound_file_bucket" "text",
    "received_file_bucket" "text",
    "generated_by" "text",
    CONSTRAINT "document_dispatches_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."case_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."case_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_bucket" "text" DEFAULT 'documents'::"text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text",
    "file_size" bigint,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."case_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."case_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "case_members_role_check" CHECK (("role" = ANY (ARRAY['sales'::"text", 'manager'::"text", 'assistant'::"text", 'lp'::"text", 'accounting'::"text"])))
);


ALTER TABLE "public"."case_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."case_other_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "label" "text",
    "amount" numeric,
    "payer_heir_id" "uuid",
    "payer_name" "text",
    "settle_between_heirs" boolean DEFAULT false NOT NULL,
    "has_evidence" boolean DEFAULT false NOT NULL,
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "case_other_assets_kind_check" CHECK (("kind" = ANY (ARRAY['その他財産'::"text", '相続債務'::"text", 'その他費用'::"text"])))
);


ALTER TABLE "public"."case_other_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."case_other_assets" IS 'その他財産／相続債務／その他費用。amount は常に正で、マイナス扱いかは kind で決まる。';



COMMENT ON COLUMN "public"."case_other_assets"."payer_name" IS '立替者の氏名（相続人未登録時のフリー入力。payer_heir_id が入っていればそちらが優先）';



CREATE TABLE IF NOT EXISTS "public"."case_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "partner_type" "text" NOT NULL,
    "firm_name" "text",
    "referred_date" "date",
    "content" "text",
    "estimated_fee" numeric,
    "billing_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_detail" "text"
);


ALTER TABLE "public"."case_referrals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."case_referrals"."content_detail" IS '依頼内容詳細（フリーテキスト。税理士/不動産の選択肢の補足）。';



CREATE TABLE IF NOT EXISTS "public"."case_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "requester_id" "uuid",
    "recipient_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "message" "text",
    "requested_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT '依頼中'::"text" NOT NULL,
    "confirmer_id" "uuid",
    "confirmed_date" "date",
    "confirm_comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewing_by" "uuid",
    "reviewing_at" timestamp with time zone,
    CONSTRAINT "case_reports_kind_check" CHECK (("kind" = ANY (ARRAY['情報共有'::"text", '要対応'::"text"]))),
    CONSTRAINT "case_reports_status_check" CHECK (("status" = ANY (ARRAY['依頼中'::"text", '確認中'::"text", '確認済'::"text"])))
);


ALTER TABLE "public"."case_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_number" "text" NOT NULL,
    "deal_name" "text" NOT NULL,
    "status" "text" DEFAULT '架電案件化'::"text" NOT NULL,
    "client_id" "uuid",
    "deceased_name" "text",
    "date_of_death" "date",
    "order_date" "date",
    "completion_date" "date",
    "difficulty" "text",
    "procedure_type" "text"[],
    "additional_services" "text"[],
    "tax_filing_required" "text" DEFAULT '確認中'::"text",
    "tax_filing_deadline" "date",
    "property_rank" "text",
    "total_asset_estimate" bigint,
    "partner_id" "uuid",
    "referral_destination_id" "uuid",
    "referral_fee" bigint,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deceased_furigana" "text",
    "deceased_birth_date" "date",
    "deceased_address" "text",
    "deceased_registered_address" "text",
    "division_policy" "text",
    "division_proposal" "text",
    "agreement_signing_method" "text",
    "inheritance_risk" "text",
    "will_type" "text",
    "will_storage" "text",
    "will_execution" "text",
    "contract_type" "text",
    "contract_date" "date",
    "fee_administrative" bigint,
    "fee_judicial" bigint,
    "fee_total" bigint,
    "payment_status" "text",
    "payment_date" "date",
    "fee_real_estate" bigint,
    "fee_tax_referral" bigint,
    "total_revenue_estimate" bigint,
    "location" "text",
    "team" "text",
    "probability" integer,
    "meeting_date" "date",
    "order_received_date" "date",
    "other_procedure" "text",
    "order_category" "text"[],
    "koseki_request_reason" "text",
    "koseki_request_reason_other" "text",
    "koseki_request_pattern" "text",
    "koseki_request_type" "text"[],
    "koseki_purpose" "text",
    "koseki_notes" "text",
    "order_route" "text",
    "order_route_lp_name" "text",
    "order_route_person" "text",
    "referral_name" "text",
    "mailing_destination" "text",
    "mailing_address_other" "text",
    "investigation_document" "text",
    "tax_advisor_referral" "text",
    "tax_advisor_name" "text",
    "will_remainders_risk" boolean DEFAULT false,
    "will_bequest" boolean DEFAULT false,
    "will_creation_place" "text",
    "notary_office_name" "text",
    "trust_contract_type" "text",
    "life_insurance_proposal" "text",
    "life_insurance_company" "text",
    "life_insurance_type_amount" "text",
    "life_insurance_inquiry" boolean DEFAULT false,
    "life_insurance_inquiry_notes" "text",
    "deceased_has_special_chars" boolean DEFAULT false,
    "invoice_status" "text" DEFAULT '下書き'::"text",
    "advance_payment" bigint DEFAULT 0,
    "invoice_date" "date",
    "payment_due_date" "date",
    "payment_confirmed_date" "date",
    "payment_amount" bigint,
    "partner_compensation" bigint,
    "invoice_memo" "text",
    "expected_completion_date" "date",
    "life_insurance_type" "text",
    "life_insurance_amount" numeric,
    "meeting_place" "text",
    "order_route_detail" "text",
    "lawyer_name" "text",
    "lawyer_office" "text",
    "lawyer_referral_fee" integer,
    "estate_clearance_company" "text",
    "estate_clearance_fee" integer,
    "inventory_categories" "text"[],
    "trust_content" "text"[],
    "will_draft_confirmed_date" "date",
    "financial_survey_start_condition" "text",
    "will_witness" "text",
    "will_content" "text"[],
    "will_bequest_handler" "text",
    "trust_final_beneficiary" "text",
    "trust_creation_place" "text",
    "real_estate_appraisal_status" "text",
    "will_content_details" "jsonb",
    "trust_content_details" "jsonb",
    "client_trait" "text",
    "client_trait_detail" "text",
    "has_complaint" boolean DEFAULT false NOT NULL,
    "complaint_detail" "text",
    "meeting_executed_date" "date",
    "client_response_due_date" "date",
    "last_opened_at" timestamp with time zone,
    "deceased_age" integer,
    "visit_address" "text",
    "visit_notes" "text",
    "hearing_content" "text",
    "special_notes" "text",
    "other_needs" "text",
    "order_sheet_completed_at" timestamp with time zone,
    "meeting_hearing_memo" "text",
    "meeting_other_notes" "text",
    "registration_columns" "jsonb" DEFAULT '[]'::"jsonb",
    "financial_survey_prohibited_period" "text",
    "financial_survey_prohibited_reason" "text",
    "lp_case_number" "text",
    "intake_documents" "jsonb",
    "intake_roles" "jsonb",
    "service_category" "text",
    "consideration_period" "text",
    "service_category_2" "text",
    "financial_survey_prohibited_start" "date",
    "financial_survey_prohibited_end" "date",
    "deceased_postal_code" "text",
    "real_estate_evaluation_method" "text",
    "division_proposal_presence" "text",
    "agreement_dispatch_method" "text",
    "court_procedure_info" "jsonb",
    "referral_partner_number" "text",
    "advance_payment_administrative" numeric,
    "advance_payment_judicial" numeric,
    "lp_followup_allowed" boolean,
    "lp_followup_method" "text",
    "lp_followup_method_other" "text",
    "lp_followup_due_date" "date",
    "consideration_decline_reason" "text",
    "consideration_decline_reason_detail" "text",
    "service_parts" "jsonb",
    "meeting_info_updated_at" timestamp with time zone,
    "meeting_owner_id" "uuid",
    "meeting_type" "text",
    "proposal_note" "text",
    "is_lp_direct" boolean DEFAULT false NOT NULL,
    "work_content" "jsonb",
    "follow_up_call_needed" boolean,
    "instant_order" boolean DEFAULT false NOT NULL,
    "order_win_type" "text",
    "meeting_content_detail" "text",
    "management_started_at" timestamp with time zone,
    "billing_pattern" "text" DEFAULT 'staged'::"text" NOT NULL,
    "bank" "text",
    "family_tree_apply_date" "date",
    "family_tree_obtain_date" "date",
    "family_tree_count" integer,
    "family_tree_office" "text",
    "family_tree_note" "text",
    "prospect_level" "text",
    "intake_draft" boolean DEFAULT false NOT NULL,
    "difficulty_reasons" "text"[],
    "difficulty_reason_other" "text",
    "accounting_memo" "text",
    "accounting_memo_updated_at" timestamp with time zone,
    "accounting_memo_updated_by" "uuid",
    "delivery_status" "text",
    "filing_status" "text",
    "order_sheet_finalized_at" timestamp with time zone,
    "order_sheet_finalized_by" "uuid",
    "order_sheet_finalized_name" "text",
    "work_prep_advanced_at" timestamp with time zone,
    "work_prep_advanced_by" "uuid",
    "work_prep_advanced_name" "text",
    "work_start_ok_at" timestamp with time zone,
    "work_start_ok_by" "uuid",
    "work_start_ok_name" "text",
    "reward_discount_judicial" numeric DEFAULT 0 NOT NULL,
    "reward_discount_administrative" numeric DEFAULT 0 NOT NULL,
    "reward_note_judicial" "text",
    "reward_note_administrative" "text",
    "proposal_judicial" "text",
    "proposal_administrative" "text",
    "manager_assign_skipped" boolean DEFAULT false NOT NULL,
    "order_sheet_started_at" timestamp with time zone,
    "meeting_snapshot" "jsonb",
    "meeting_snapshot_at" timestamp with time zone,
    CONSTRAINT "cases_billing_pattern_check" CHECK (("billing_pattern" = ANY (ARRAY['staged'::"text", 'lump_expense'::"text", 'lump_only'::"text"]))),
    CONSTRAINT "cases_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['準備中'::"text", '確認申請中'::"text", '納品待ち'::"text", '納品済'::"text"]))),
    CONSTRAINT "cases_difficulty_check" CHECK ((("difficulty" IS NULL) OR ("difficulty" = ANY (ARRAY['普通'::"text", '難'::"text", '激難'::"text"])))),
    CONSTRAINT "cases_property_rank_check" CHECK (("property_rank" = ANY (ARRAY['S'::"text", 'A'::"text", 'B'::"text", 'C'::"text", '確認中'::"text"]))),
    CONSTRAINT "cases_tax_filing_required_check" CHECK (("tax_filing_required" = ANY (ARRAY['要'::"text", '不要'::"text", '確認中'::"text"])))
);


ALTER TABLE "public"."cases" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cases"."completion_date" IS '完了日（最終タスク完了で自動入力）';



COMMENT ON COLUMN "public"."cases"."expected_completion_date" IS '完了予定日（計画）';



COMMENT ON COLUMN "public"."cases"."life_insurance_type" IS '生命保険の種類（終身/定期等）';



COMMENT ON COLUMN "public"."cases"."life_insurance_amount" IS '生命保険金額';



COMMENT ON COLUMN "public"."cases"."will_content_details" IS '遺言文案 カテゴリ別自由記述 (例: {"不動産": "〇〇を長男△△に相続させる", ...})';



COMMENT ON COLUMN "public"."cases"."trust_content_details" IS '信託文案 カテゴリ別自由記述 (例: {"不動産": "〇〇を信託財産とする", ...})';



COMMENT ON COLUMN "public"."cases"."deceased_age" IS '被相続人年齢（ステーション連携で受信）。生年月日が判明したら deceased_birth_date を更新';



COMMENT ON COLUMN "public"."cases"."visit_address" IS '伺い先住所（訪問面談時の訪問先）';



COMMENT ON COLUMN "public"."cases"."visit_notes" IS '伺い先補足（目印、駐車場、呼び鈴位置等）';



COMMENT ON COLUMN "public"."cases"."hearing_content" IS 'LP担当ヒアリング内容（行政書士間で共有）';



COMMENT ON COLUMN "public"."cases"."special_notes" IS '特記事項（オーシャン社内のみ参照、パートナー報告対象外）';



COMMENT ON COLUMN "public"."cases"."other_needs" IS 'その他ニーズ（案内リクエスト等、日付プレフィックス付き複数行）';



COMMENT ON COLUMN "public"."cases"."order_sheet_completed_at" IS 'オーダーシートを完成（保存）した日時。NULL=未作成。実務タブ解禁・対応中遷移の条件。';



COMMENT ON COLUMN "public"."cases"."meeting_hearing_memo" IS '面談内容: ヒアリング内容メモ（面談で聞いた内容。事前情報 hearing_content とは別）';



COMMENT ON COLUMN "public"."cases"."meeting_other_notes" IS '面談内容: その他備考';



COMMENT ON COLUMN "public"."cases"."registration_columns" IS '相続登記表の任意項目（列名）の定義。例：["申請日","完了日","法務局"]';



COMMENT ON COLUMN "public"."cases"."financial_survey_prohibited_period" IS '財産調査禁止期間';



COMMENT ON COLUMN "public"."cases"."financial_survey_prohibited_reason" IS '財産調査禁止理由';



COMMENT ON COLUMN "public"."cases"."financial_survey_prohibited_start" IS '財産調査禁止期間 開始日';



COMMENT ON COLUMN "public"."cases"."financial_survey_prohibited_end" IS '財産調査禁止期間 終了日';



COMMENT ON COLUMN "public"."cases"."deceased_postal_code" IS '被相続人 郵便番号';



COMMENT ON COLUMN "public"."cases"."real_estate_evaluation_method" IS '不動産の評価方法（固定資産評価額/路線価）';



COMMENT ON COLUMN "public"."cases"."division_proposal_presence" IS '分配方針の提案 有無';



COMMENT ON COLUMN "public"."cases"."agreement_dispatch_method" IS '遺産分割協議書の送付・調印方法';



COMMENT ON COLUMN "public"."cases"."court_procedure_info" IS '家裁手続きの共通情報（業務別。管轄家裁/事件番号/申立日/期日/結果）';



COMMENT ON COLUMN "public"."cases"."referral_partner_number" IS '紹介元の屋号管理番号（相続ステーション連携で受信。例：KN02）';



COMMENT ON COLUMN "public"."cases"."advance_payment_administrative" IS '前受金（行政書士法人ぶん・税込）';



COMMENT ON COLUMN "public"."cases"."advance_payment_judicial" IS '前受金（司法書士法人ぶん・税込）';



COMMENT ON COLUMN "public"."cases"."lp_followup_allowed" IS 'LPによる追いかけ可否（true=可 / false=不可）';



COMMENT ON COLUMN "public"."cases"."lp_followup_method" IS 'LP追いかけの連絡方法（電話/メール/SMS/LINE/その他）';



COMMENT ON COLUMN "public"."cases"."lp_followup_method_other" IS '連絡方法が「その他」のとき自由入力';



COMMENT ON COLUMN "public"."cases"."lp_followup_due_date" IS 'LP追いかけの期限日';



COMMENT ON COLUMN "public"."cases"."consideration_decline_reason" IS '検討中・不受託の理由（旧 lost_reason の置換。【検討】/【不受託】プレフィックス付き選択肢）';



COMMENT ON COLUMN "public"."cases"."consideration_decline_reason_detail" IS '検討中・不受託理由のその他詳細（フリーテキスト）。';



COMMENT ON COLUMN "public"."cases"."service_parts" IS '受注区分のパート（順序付き＋status[未着手/進行中/完了/中止]）。NULL=旧データ（service_category/_2から導出）。';



COMMENT ON COLUMN "public"."cases"."follow_up_call_needed" IS '追い電話の必要性（true=要 / false=不要 / null=未入力）';



COMMENT ON COLUMN "public"."cases"."instant_order" IS '即受注フラグ（面談登録で面談結果=受注にした＝その場受注のとき true）';



COMMENT ON COLUMN "public"."cases"."order_win_type" IS '受注の獲得区分（即受注/面談なし受注。通常受注はNULL）。status=受注 のときのみ意味を持つ';



COMMENT ON COLUMN "public"."cases"."meeting_content_detail" IS '面談内容詳細（面談結果が検討中/失注以外のとき。詳細理由・その他申し送り事項とは別）';



COMMENT ON COLUMN "public"."cases"."management_started_at" IS '作業進行中（対応中）に入った日時。週次報告のカウント開始基準（対応中＋7日）。';



COMMENT ON COLUMN "public"."cases"."family_tree_apply_date" IS '法定相続情報一覧図の申出日。';



COMMENT ON COLUMN "public"."cases"."family_tree_obtain_date" IS '法定相続情報一覧図の取得日。';



COMMENT ON COLUMN "public"."cases"."family_tree_count" IS '法定相続情報一覧図の必要枚数（何通取るか）。';



COMMENT ON COLUMN "public"."cases"."family_tree_office" IS '法定相続情報一覧図の提出先の法務局。';



COMMENT ON COLUMN "public"."cases"."family_tree_note" IS '法定相続情報一覧図の認証番号・備考。';



COMMENT ON COLUMN "public"."cases"."order_sheet_started_at" IS 'オーダーシートの作成を開始した日時。受注前の案件で、面談シート／オーダーシートのどちらを出すかの判定に使う。';



COMMENT ON COLUMN "public"."cases"."meeting_snapshot" IS '面談結果登録を保存した時点の面談シート内容（案件・依頼者・相続人・財産・メモ）';



COMMENT ON COLUMN "public"."cases"."meeting_snapshot_at" IS '上記を保存した日時';



CREATE TABLE IF NOT EXISTS "public"."client_communications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "communicated_at" "date" NOT NULL,
    "communication_type" "text" NOT NULL,
    "detail" "text",
    "status" "text" DEFAULT 'お客様待ち'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contact_method" "text",
    CONSTRAINT "client_communications_status_check" CHECK (("status" = ANY (ARRAY['お客様待ち'::"text", '完了'::"text"])))
);


ALTER TABLE "public"."client_communications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "furigana" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "postal_code" "text",
    "relationship_to_deceased" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mobile_phone" "text",
    "preferred_contact" "text"[],
    "customer_no" "text",
    "has_special_chars" boolean DEFAULT false,
    "transfer_name_kana" "text",
    "transfer_name_kana_2" "text",
    "transfer_name_kana_3" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."transfer_name_kana" IS '振込名義人カナ（全角カタカナ推奨）。入金CSV突合の振込人キー。';



COMMENT ON COLUMN "public"."clients"."transfer_name_kana_2" IS '振込名義人カナ（2つ目）。入金CSV突合キー。';



COMMENT ON COLUMN "public"."clients"."transfer_name_kana_3" IS '振込名義人カナ（3つ目）。入金CSV突合キー。';



CREATE TABLE IF NOT EXISTS "public"."confirm_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid",
    "case_number" "text",
    "case_name" "text",
    "gyomu" "text",
    "kind" "text",
    "action" "text",
    "target" "text",
    "content" "text",
    "amount" numeric,
    "requested_by" "uuid",
    "requested_by_name" "text",
    "requested_at" timestamp with time zone,
    "checked_by" "uuid",
    "checked_by_name" "text",
    "checked_at" timestamp with time zone DEFAULT "now"(),
    "source_table" "text",
    "source_row_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."confirm_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "name" "text",
    "status" "text",
    "expected_arrival_date" "date",
    "arrival_date" "date",
    "case_document_id" "uuid",
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "file_path" "text",
    "file_bucket" "text",
    "file_name" "text",
    "file_type" "text",
    "delivery_target" boolean,
    "delivery_check_by" "uuid",
    "delivery_check_at" timestamp with time zone,
    "delivery_display_name" "text",
    "delivery_touki_notice_date" "text",
    "delivery_touki_notice_number" "text",
    "delivery_inkan_client_names" "text"[],
    "delivery_recipient_heir_id" "uuid",
    CONSTRAINT "contract_documents_category_check" CHECK (("category" = ANY (ARRAY['契約'::"text", '戸籍'::"text", '金融'::"text", '不動産'::"text", '登記'::"text", 'その他'::"text", 'お客様預かり書類'::"text"])))
);


ALTER TABLE "public"."contract_documents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."contract_documents"."file_path" IS '受領書類のスキャンファイル等のStorageパス。NULL=未添付(原本のみ等)。';



COMMENT ON COLUMN "public"."contract_documents"."file_bucket" IS '受領書類ファイルのStorageバケット(通常 documents)。';



COMMENT ON COLUMN "public"."contract_documents"."delivery_recipient_heir_id" IS '納品物の受領先（相続人）。未設定は共通＝どの受領証にも載せる。';



CREATE TABLE IF NOT EXISTS "public"."dashboard_team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'member'::"text" NOT NULL,
    "added_by" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dashboard_team_members_kind_check" CHECK (("kind" = ANY (ARRAY['member'::"text", 'mentor'::"text"])))
);


ALTER TABLE "public"."dashboard_team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dept_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ym" "text" NOT NULL,
    "new_orders" integer DEFAULT 0 NOT NULL,
    "managing" integer DEFAULT 0 NOT NULL,
    "completed" integer DEFAULT 0 NOT NULL,
    "cycle_months" numeric(4,1) DEFAULT 0 NOT NULL,
    "completed_amount" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dept_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."division_details" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "asset_category" "text" NOT NULL,
    "division_method" "text",
    "recipient" "text",
    "share_ratio" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "amount" numeric,
    "entry_kind" "text" DEFAULT '財産'::"text" NOT NULL
);


ALTER TABLE "public"."division_details" OWNER TO "postgres";


COMMENT ON COLUMN "public"."division_details"."entry_kind" IS '協議書の行種別：財産（取得する）／債務（負担する）／精算（代償金・精算金を支払う）。';



CREATE TABLE IF NOT EXISTS "public"."document_receipt_item_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_item_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_receipt_item_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "quantity" integer,
    "received_from" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "linked_kind" "text",
    "linked_id" "uuid",
    "linked_field" "text",
    "case_document_id" "uuid",
    "uploaded_at" timestamp with time zone,
    "link_not_required" boolean,
    "settlement_reflect" boolean DEFAULT false NOT NULL,
    "settlement_amount" numeric,
    "delivery_target" boolean,
    "delivery_check_by" "uuid",
    "delivery_check_at" timestamp with time zone,
    "delivery_display_name" "text",
    "delivery_touki_notice_date" "text",
    "delivery_touki_notice_number" "text",
    "delivery_inkan_client_names" "text"[],
    "delivery_recipient_heir_id" "uuid"
);


ALTER TABLE "public"."document_receipt_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."document_receipt_items"."delivery_recipient_heir_id" IS '納品物の受領先（相続人）。未設定は共通＝どの受領証にも載せる。';



CREATE TABLE IF NOT EXISTS "public"."document_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "received_date" "date" NOT NULL,
    "sequence_no" integer NOT NULL,
    "dual_check_member_id" "uuid",
    "dual_checked_at" timestamp with time zone,
    "started_by_member_id" "uuid",
    "started_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "started_task_id" "uuid",
    "postal_type" "text",
    "storage_team_id" "uuid",
    "location" "text",
    "is_parcel" boolean DEFAULT false NOT NULL,
    "arrival_notified_at" timestamp with time zone,
    "opened_at" timestamp with time zone
);


ALTER TABLE "public"."document_receipts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."document_receipts"."started_task_id" IS '受信をトリガーに着手/作成したタスク（関連タスク列のリンク先）';



COMMENT ON COLUMN "public"."document_receipts"."postal_type" IS '郵送種別（〒の種類）: 速達 / 簡易書留 / 赤レタパ / 青レタパ';



COMMENT ON COLUMN "public"."document_receipts"."storage_team_id" IS '原本（紙）の物理格納先チーム（teams.id）。各チームのメールボックスに格納した先。';



CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "name" "text" NOT NULL,
    "file_path" "text",
    "file_type" "text",
    "generated_by" "text",
    "status" "text" DEFAULT '下書き'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "start_time" "text",
    "end_time" "text",
    "member_id" "uuid",
    "case_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "events_event_type_check" CHECK (("event_type" = ANY (ARRAY['interview'::"text", 'task'::"text", 'deadline'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "expense_date" "date",
    "related_task" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "related_task_id" "uuid",
    "billed_invoice_id" "uuid",
    "taxable" boolean
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "asset_type" "text" NOT NULL,
    "institution_name" "text" NOT NULL,
    "branch_name" "text",
    "required_docs" "text"[],
    "existence_check" "text",
    "balance_cert_date" "text",
    "transaction_history_period" "text",
    "safe_deposit_box" "text",
    "stock_name" "text",
    "additional_info" "jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "houri_inquiry" boolean DEFAULT false NOT NULL,
    "odd_lot_handling" "text",
    "unclaimed_dividend" "text",
    "new_account_found_date" "date",
    "dissolution_status" "text",
    "passbook_status" "text",
    "cancellation_required" "text",
    "cancellation_date" "date",
    "cancellation_restrictions" "text",
    "all_branch_survey" "text",
    "balance_cert_required" "text",
    "accrued_interest_required" "text",
    "share_cert_required" "text",
    "unclaimed_dividend_required" "text",
    "survey_period_type" "text",
    "survey_date" "date",
    "request_date" "date",
    "arrival_date" "date",
    "cancellation_request_date" "date",
    "cancellation_arrival_date" "date",
    "cancellation_done" boolean DEFAULT false NOT NULL,
    "acquirer" "text" DEFAULT '自社'::"text",
    "expected_arrival_date" "date",
    "acquired_part" "text",
    "transaction_detail_required" "text",
    "freeze_confirmed" boolean DEFAULT false NOT NULL,
    "freeze_confirmed_by" "uuid",
    "freeze_confirmed_at" timestamp with time zone,
    "balance_amount" numeric,
    "oc_transferred" boolean DEFAULT false NOT NULL,
    "survey_result" "text",
    "cancellation_result" "text",
    "balance_confirmed" boolean DEFAULT false NOT NULL,
    "balance_confirmed_by" "uuid",
    "balance_confirmed_at" timestamp with time zone,
    "survey_prohibited_start" "date",
    "survey_prohibited_end" "date",
    "survey_prohibited_reason" "text",
    "balance_confirm_requested_at" timestamp with time zone,
    "balance_confirm_requested_by" "uuid",
    "freeze_confirm_requested_at" timestamp with time zone,
    "freeze_confirm_requested_by" "uuid",
    "account_type" "text",
    "freeze_confirmed_name" "text",
    "balance_confirmed_name" "text",
    "survey_prohibited_designation" "text",
    "survey_prohibited_method" "text",
    "prohibition_released_at" "date",
    "has_investment_trust" boolean DEFAULT false NOT NULL,
    "has_safe_deposit" boolean DEFAULT false NOT NULL,
    "account_number" "text",
    "has_evidence" boolean DEFAULT false NOT NULL,
    "evidence_docs" "text"[],
    "evidence_note" "text",
    "transaction_periods" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "balance_cert_on_death" boolean DEFAULT false NOT NULL,
    "balance_cert_dates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."financial_assets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."financial_assets"."cancellation_required" IS '解約要否（要/不要/確認中）';



COMMENT ON COLUMN "public"."financial_assets"."cancellation_date" IS '解約日';



COMMENT ON COLUMN "public"."financial_assets"."cancellation_restrictions" IS '解約時の禁止事項';



COMMENT ON COLUMN "public"."financial_assets"."acquired_part" IS '取得した受注区分パート（service_parts のキー。行作成時の現在パートを自動記録）。';



COMMENT ON COLUMN "public"."financial_assets"."survey_prohibited_start" IS '財産調査禁止期間 開始日（口座単位）';



COMMENT ON COLUMN "public"."financial_assets"."survey_prohibited_end" IS '財産調査禁止期間 終了日（口座単位）';



COMMENT ON COLUMN "public"."financial_assets"."survey_prohibited_reason" IS '財産調査禁止理由（口座単位）';



COMMENT ON COLUMN "public"."financial_assets"."account_type" IS '口座種別（普通/定期/当座/積立/貯蓄/その他）';



COMMENT ON COLUMN "public"."financial_assets"."freeze_confirmed_name" IS '凍結確認者の氏名（ハンコ表示用）';



COMMENT ON COLUMN "public"."financial_assets"."balance_confirmed_name" IS '残高確定者の氏名（ハンコ表示用）';



COMMENT ON COLUMN "public"."financial_assets"."account_number" IS '口座番号（預金）。財産目録の表記に使う。';



COMMENT ON COLUMN "public"."financial_assets"."has_evidence" IS '残高の根拠資料があるか。';



COMMENT ON COLUMN "public"."financial_assets"."evidence_docs" IS '根拠資料の種別（複数可）。預金=通帳/残高証明書/経過利息証明書/取引履歴、証券=所有株式数証明/残高証明書/未払い配当金明細 等。';



COMMENT ON COLUMN "public"."financial_assets"."evidence_note" IS '根拠資料の「その他」フリー入力・補足。';



COMMENT ON COLUMN "public"."financial_assets"."transaction_periods" IS '取引明細の取得期間（{start,end} の配列。取引明細=要 のときに使う）';



COMMENT ON COLUMN "public"."financial_assets"."balance_cert_on_death" IS '残高証明を相続開始日で取る';



COMMENT ON COLUMN "public"."financial_assets"."balance_cert_dates" IS '残高証明の取得日（任意の日付。"YYYY-MM-DD" の配列）';



CREATE TABLE IF NOT EXISTS "public"."heirs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "furigana" "text",
    "relationship" "text",
    "address" "text",
    "registered_address" "text",
    "phone" "text",
    "email" "text",
    "is_legal_heir" boolean DEFAULT true,
    "birth_date" "date",
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "relationship_type" "text",
    "is_applicant" boolean DEFAULT false NOT NULL,
    "lived_together" boolean DEFAULT false NOT NULL,
    "other_parent_heir_id" "uuid",
    "legal_share_num" integer,
    "legal_share_den" integer,
    "is_client" boolean DEFAULT false NOT NULL,
    "is_deceased" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."heirs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."heirs"."lived_together" IS '被相続人と同居していたか。相関図に「同居」バッジで表示する。';



COMMENT ON COLUMN "public"."heirs"."other_parent_heir_id" IS '被相続人以外のもう一方の親（前妻・前夫の heirs 行を指す）。未設定なら現配偶者との子として描画する。';



COMMENT ON COLUMN "public"."heirs"."legal_share_num" IS '法定相続割合（分子）。目録の「参考：法定相続分」に使う。';



COMMENT ON COLUMN "public"."heirs"."legal_share_den" IS '法定相続割合（分母）。';



COMMENT ON COLUMN "public"."heirs"."is_client" IS '依頼者（この案件を依頼した相続人）かどうか。続柄とは別軸のフラグ。';



COMMENT ON COLUMN "public"."heirs"."is_deceased" IS '死亡している相続人（数次相続・代襲の判断に使う。相関図で「故」表示）';



CREATE TABLE IF NOT EXISTS "public"."instruction_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "heir_id" "uuid",
    "heir_name" "text",
    "bank_name" "text",
    "branch_name" "text",
    "account_no" "text",
    "amount" numeric,
    "transferred" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."instruction_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "invoice_number" "text",
    "invoice_type" "text" NOT NULL,
    "amount" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT '未請求'::"text" NOT NULL,
    "issued_date" "date",
    "due_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "fee_amount" bigint DEFAULT 0,
    "expenses_amount" bigint DEFAULT 0,
    "advance_deduction" bigint DEFAULT 0 NOT NULL,
    "firm_type" "text",
    "generated_file_path" "text",
    "overdue_notified_at" timestamp with time zone,
    "receipt_issued_date" "date",
    "needs_review" boolean DEFAULT false NOT NULL,
    "review_reason" "text",
    "posted_date" "date",
    "deduct_expense_nontax" bigint DEFAULT 0 NOT NULL,
    "deduct_expense_tax" bigint DEFAULT 0 NOT NULL,
    "bank_override" "text",
    CONSTRAINT "invoices_firm_type_check" CHECK (("firm_type" = ANY (ARRAY['gyosei'::"text", 'shiho'::"text"]))),
    CONSTRAINT "invoices_invoice_type_check" CHECK (("invoice_type" = ANY (ARRAY['前受金'::"text", '確定請求'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['未請求'::"text", '作成済'::"text", '入金待ち'::"text", '入金済'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invoices"."generated_file_path" IS '生成済みの公式請求書Excel（documentsバケットのパス）';



COMMENT ON COLUMN "public"."invoices"."overdue_notified_at" IS '未入金アラートを受注担当へ送信した日時（NULL=未送信）。';



COMMENT ON COLUMN "public"."invoices"."receipt_issued_date" IS '領収書を発行（生成）した日。NULL=未発行。';



COMMENT ON COLUMN "public"."invoices"."bank_override" IS '売上表の銀行手動指定（みずほ/きらぼし）。null=自動判定(payments.bank に従う)';



CREATE TABLE IF NOT EXISTS "public"."koseki_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "target_person" "text",
    "image_path" "text" NOT NULL,
    "image_bucket" "text" DEFAULT 'koseki-images'::"text" NOT NULL,
    "file_name" "text",
    "annotations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "koseki_request_id" "uuid"
);


ALTER TABLE "public"."koseki_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."koseki_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "person_name" "text" NOT NULL,
    "range_text" "text",
    "address_doc" "text",
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."koseki_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."koseki_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "request_to" "text",
    "target_person" "text",
    "doc_types" "text",
    "purpose" "text",
    "request_date" "date",
    "arrival_date" "date",
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_reason" "text",
    "request_reason_other" "text",
    "acquirer" "text" DEFAULT '自社'::"text",
    "expected_arrival_date" "date",
    "range_text" "text",
    "acquired_part" "text",
    "read_result" "text",
    "cost_budget" numeric,
    "cost_refund" numeric,
    "cost_confirmed" numeric,
    "request_check_name" "text",
    "request_check_at" timestamp with time zone,
    "receipt_check_name" "text",
    "receipt_check_at" timestamp with time zone,
    "is_additional" boolean DEFAULT false NOT NULL,
    "additional_reason" "text",
    "additional_approved_by" "uuid",
    "additional_approved_at" timestamp with time zone,
    "request_done_by" "uuid",
    "receipt_done_by" "uuid",
    "request_check_by" "uuid",
    "receipt_check_by" "uuid",
    "request_check_requested_at" timestamp with time zone,
    "request_check_requested_by" "uuid",
    "receipt_check_requested_at" timestamp with time zone,
    "receipt_check_requested_by" "uuid",
    "request_kind" "text" DEFAULT '通常請求'::"text" NOT NULL,
    "request_firm" "text",
    "doc_form" "text",
    "head_person" "text",
    "juminhyo_items" "text",
    "submit_to" "text"
);


ALTER TABLE "public"."koseki_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."koseki_requests"."doc_types" IS '請求の種別①（戸籍/除籍/原戸籍/住民票/除票/戸籍の附票）。複数は「・」区切り';



COMMENT ON COLUMN "public"."koseki_requests"."range_text" IS '請求する戸籍の範囲（出生から死亡まで/現在戸籍 等）';



COMMENT ON COLUMN "public"."koseki_requests"."acquired_part" IS '取得した受注区分パート（service_parts のキー。行作成時の現在パートを自動記録）。';



COMMENT ON COLUMN "public"."koseki_requests"."request_done_by" IS '請求作業者（請求日を入力した人）。W-Checkの自己チェック判定用。';



COMMENT ON COLUMN "public"."koseki_requests"."receipt_done_by" IS '受信作業者（到着日を入力した人）。W-Checkの自己チェック判定用。';



COMMENT ON COLUMN "public"."koseki_requests"."request_check_by" IS '請求時W-Checkを実施した人（member_id）。';



COMMENT ON COLUMN "public"."koseki_requests"."receipt_check_by" IS '受信時W-Checkを実施した人（member_id）。';



CREATE TABLE IF NOT EXISTS "public"."manual_chapters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."manual_chapters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chapter" "text" DEFAULT '未分類'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "shots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."manual_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_memos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "section" "text",
    "image_path" "text",
    "image_bucket" "text" DEFAULT 'meeting-memos'::"text" NOT NULL,
    "ocr_text" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb"
);


ALTER TABLE "public"."meeting_memos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meeting_memos"."meta" IS '白紙メモの帯境界など（{w,h,bands:[{key,label,y0,y1}]}）。セクション別メモではNULL。';



CREATE TABLE IF NOT EXISTS "public"."member_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL
);


ALTER TABLE "public"."member_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "ym" "text" NOT NULL,
    "new_orders_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "invoice_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."member_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "avatar_color" "text" DEFAULT '#6B7280'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "job_type" "text" DEFAULT '総合職'::"text",
    "joined_at" "date",
    "primary_role" "text",
    "avatar_url" "text",
    "phone" "text",
    "bio" "text",
    "hobbies" "text"[],
    "specialties" "text"[],
    "hometown" "text",
    "favorite_food" "text",
    "department" "text",
    "is_touki_team" boolean DEFAULT false NOT NULL,
    "is_dispatcher" boolean DEFAULT false NOT NULL,
    CONSTRAINT "members_primary_role_check" CHECK ((("primary_role" IS NULL) OR ("primary_role" = ANY (ARRAY['sales'::"text", 'manager'::"text", 'assistant'::"text", 'lp'::"text", 'accounting'::"text", 'system_manager'::"text"]))))
);


ALTER TABLE "public"."members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."members"."department" IS '所属事業部（相続事業部 / LP事業部 等。team より上位の組織区分）';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "case_id" "uuid",
    "task_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "kickback_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_check_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "case_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "confirmer_id" "uuid",
    "status" "text" DEFAULT '依頼中'::"text" NOT NULL,
    "result_note" "text",
    "requested_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "confirmed_date" "date",
    "auto_closed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'confirm'::"text" NOT NULL,
    "reason_category" "text",
    "fee_bearer" "text",
    "refund_amount" numeric,
    "request_note" "text",
    "resolution" "text",
    "sales_approver_id" "uuid",
    "sales_approved_at" timestamp with time zone,
    "sales_reject_note" "text",
    "leader_approver_id" "uuid",
    "leader_approved_at" timestamp with time zone,
    "leader_reject_note" "text",
    "approval_status" "text"
);


ALTER TABLE "public"."payment_check_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_check_requests" IS '入金状況の確認依頼（経理/管理担当→受注担当）。請求書単位。';



COMMENT ON COLUMN "public"."payment_check_requests"."result_note" IS '受注担当が入力する確認結果（例: 12/15に○○銀行から振込済と確認）。';



COMMENT ON COLUMN "public"."payment_check_requests"."auto_closed" IS '入金突合/消込で自動的に確認済化したか。';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount" bigint NOT NULL,
    "payment_date" "date" NOT NULL,
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "matched_by" "text",
    "match_note" "text",
    "is_refund" boolean DEFAULT false NOT NULL,
    "bank" "text"
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."matched_by" IS '突合の判定者（ai=CSV自動突合 / human=手動・人手確認）';



COMMENT ON COLUMN "public"."payments"."match_note" IS 'CSV突合の根拠（振込人名・摘要・取込日 等）';



COMMENT ON COLUMN "public"."payments"."is_refund" IS '返金行（amountはマイナス）。入金純額=Σamount。理由はmatch_note。';



CREATE TABLE IF NOT EXISTS "public"."phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "color" "text",
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "confirmer_id" "uuid",
    "requested_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT '依頼中'::"text" NOT NULL,
    "confirmed_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_point" "text",
    "confirm_comment" "text",
    "kind" "text" DEFAULT 'progress_check'::"text" NOT NULL,
    "phase" "text",
    "report_state" "text",
    CONSTRAINT "progress_reports_kind_check" CHECK (("kind" = ANY (ARRAY['progress_check'::"text", 'work_complete'::"text", 'case_reopen'::"text", 'delivery_confirm'::"text"]))),
    CONSTRAINT "progress_reports_status_check" CHECK (("status" = ANY (ARRAY['依頼中'::"text", '確認済'::"text"])))
);


ALTER TABLE "public"."progress_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."progress_reports"."confirmer_id" IS '確認者（確認した本人。確認時にセット。依頼者本人は不可）。';



COMMENT ON COLUMN "public"."progress_reports"."review_point" IS '確認ポイント（依頼時に記入）。';



COMMENT ON COLUMN "public"."progress_reports"."confirm_comment" IS '確認コメント（確認時に確認者が記入）。';



COMMENT ON COLUMN "public"."progress_reports"."phase" IS '案件報告のフェーズ（戸籍/財産調査/目録作成/協議中/協議書作成/登記/解約）';



COMMENT ON COLUMN "public"."progress_reports"."report_state" IS '案件報告の状態（問題なし順調に進行中/確認事項あり/困りごとありHELP/至急！！）';



CREATE TABLE IF NOT EXISTS "public"."progress_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "scope_key" "text" NOT NULL,
    "body" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text"
);


ALTER TABLE "public"."progress_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."real_estate_acquisitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "item_type" "text",
    "target_property_id" "uuid",
    "target_municipality" "text",
    "request_to" "text",
    "request_date" "date",
    "expected_arrival_date" "date",
    "arrival_date" "date",
    "received" boolean DEFAULT false NOT NULL,
    "amount" numeric,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost_budget" numeric,
    "cost_refund" numeric,
    "cost_confirmed" numeric,
    "request_check_name" "text",
    "request_check_at" timestamp with time zone,
    "receipt_check_name" "text",
    "receipt_check_at" timestamp with time zone,
    "scope" "text",
    "request_done_by" "uuid",
    "receipt_done_by" "uuid",
    "request_check_by" "uuid",
    "receipt_check_by" "uuid",
    "is_additional" boolean DEFAULT false NOT NULL,
    "additional_reason" "text",
    "additional_approved_at" timestamp with time zone,
    "additional_approved_by" "uuid",
    "request_check_requested_at" timestamp with time zone,
    "request_check_requested_by" "uuid",
    "receipt_check_requested_at" timestamp with time zone,
    "receipt_check_requested_by" "uuid",
    "item_types" "text"[],
    "myna_year" "text",
    "acquirer" "text",
    "received_at_meeting" boolean DEFAULT false NOT NULL,
    "doc_year" "text",
    "contract_document_id" "uuid",
    "request_kind" "text" DEFAULT '通常請求'::"text" NOT NULL
);


ALTER TABLE "public"."real_estate_acquisitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."real_estate_acquisitions" IS '不動産の取得資料管理（請求・参照を問わず、何をどこにいつ取得し受領したか）';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."request_done_by" IS '請求作業者（請求日を入力した人）。W-Checkの自己チェック判定用。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."receipt_done_by" IS '受信作業者（到着日を入力した人）。W-Checkの自己チェック判定用。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."request_check_by" IS '請求時W-Checkを実施した人（member_id）。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."receipt_check_by" IS '受信時W-Checkを実施した人（member_id）。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."is_additional" IS '初期生成後に追加された取得資料（管理担当の承認ゲート対象）。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."additional_reason" IS '追加請求の理由（承認者へ伝える）。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."additional_approved_at" IS '追加請求の承認日時。承認までタスクは生成しない。';



COMMENT ON COLUMN "public"."real_estate_acquisitions"."additional_approved_by" IS '追加請求を承認した管理担当（member_id）。';



CREATE TABLE IF NOT EXISTS "public"."real_estate_properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "property_type" "text",
    "address" "text",
    "lot_number" "text",
    "resident_status" "text",
    "area_evaluation" "text",
    "building_age" integer,
    "sale_intention" "text",
    "has_title_deed" boolean DEFAULT false,
    "has_tax_notice" boolean DEFAULT false,
    "name_consolidation_dest" "text",
    "evaluation_cert_dest" "text",
    "has_registry_info" boolean DEFAULT false,
    "has_cadastral_map" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "has_survey_map" boolean DEFAULT false NOT NULL,
    "has_route_price" boolean DEFAULT false NOT NULL,
    "sale_expected_date" "date",
    "evaluation_method" "text",
    "is_condo_land" boolean DEFAULT false NOT NULL,
    "sale_agent_name" "text",
    "rank" "text",
    "appraisal_status" "text",
    "title_change_required" "text",
    "registration_data" "jsonb" DEFAULT '{}'::"jsonb",
    "name_consolidation_arrival_date" "date",
    "admin_sq_required" "text",
    "judicial_sq_required" "text",
    "ref_nayose" boolean DEFAULT false NOT NULL,
    "ref_title_deed" boolean DEFAULT false NOT NULL,
    "ref_tax_notice" boolean DEFAULT false NOT NULL,
    "registry_required" "text",
    "cadastral_required" "text",
    "survey_map_required" "text",
    "route_price_required" "text",
    "eval_cert_required" "text",
    "eval_cert_obtained" boolean DEFAULT false NOT NULL,
    "title_change_date" "date",
    "title_change_request_date" "date",
    "title_change_arrival_date" "date",
    "title_change_done" boolean DEFAULT false NOT NULL,
    "registry_request_date" "date",
    "registry_receipt_date" "date",
    "cadastral_request_date" "date",
    "cadastral_receipt_date" "date",
    "survey_map_request_date" "date",
    "survey_map_receipt_date" "date",
    "route_price_request_date" "date",
    "route_price_receipt_date" "date",
    "eval_cert_request_date" "date",
    "eval_cert_receipt_date" "date",
    "acquirer" "text" DEFAULT '自社'::"text",
    "expected_arrival_date" "date",
    "kaoku_bango" "text",
    "near_land_price" "text",
    "registration_types" "text"[],
    "registration_cause" "text",
    "registration_office" "text",
    "registration_status" "text",
    "registration_apply_date" "date",
    "registration_complete_date" "date",
    "registration_notes" "text",
    "acquired_part" "text",
    "appraisal_value" numeric,
    "survey_result" "text",
    "registration_result" "text",
    "municipality" "text",
    "confirmed" boolean DEFAULT false NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "registration_cost" numeric,
    "registration_check_name" "text",
    "registration_check_at" timestamp with time zone,
    "is_additional" boolean DEFAULT false NOT NULL,
    "additional_approved_at" timestamp with time zone,
    "additional_approved_by" "uuid",
    "registration_acquirer" "text",
    "registration_share" "text",
    "confirm_requested_at" timestamp with time zone,
    "confirm_requested_by" "uuid",
    "confirmed_name" "text",
    "eval_cert_year" "text",
    "land_category" "text",
    "land_area" numeric,
    "building_kind" "text",
    "building_structure" "text",
    "share_numerator" numeric,
    "share_denominator" numeric,
    "mortgage" "text",
    CONSTRAINT "real_estate_properties_appraisal_status_check" CHECK ((("appraisal_status" IS NULL) OR ("appraisal_status" = ANY (ARRAY['未対応'::"text", '対応中'::"text", '完了'::"text", '不要'::"text"])))),
    CONSTRAINT "real_estate_properties_rank_check" CHECK ((("rank" IS NULL) OR ("rank" = ANY (ARRAY['S'::"text", 'A'::"text", 'B'::"text", 'C'::"text", '確認中'::"text"]))))
);


ALTER TABLE "public"."real_estate_properties" OWNER TO "postgres";


COMMENT ON COLUMN "public"."real_estate_properties"."title_change_required" IS '名義変更要否（要/不要/確認中）';



COMMENT ON COLUMN "public"."real_estate_properties"."registration_data" IS '相続登記の任意項目の値（{列名:値}）';



COMMENT ON COLUMN "public"."real_estate_properties"."kaoku_bango" IS '家屋番号（固定資産申請書の家屋行）';



COMMENT ON COLUMN "public"."real_estate_properties"."near_land_price" IS '近傍宅地価格の要否（要/不要）';



COMMENT ON COLUMN "public"."real_estate_properties"."registration_types" IS '相続登記の種別（複数選択）';



COMMENT ON COLUMN "public"."real_estate_properties"."registration_status" IS '相続登記ステータス';



COMMENT ON COLUMN "public"."real_estate_properties"."acquired_part" IS '取得した受注区分パート（service_parts のキー。行作成時の現在パートを自動記録）。';



COMMENT ON COLUMN "public"."real_estate_properties"."is_additional" IS '初期生成後に事務が追加した市区町村（管理担当の承認ゲート対象）。';



COMMENT ON COLUMN "public"."real_estate_properties"."additional_approved_at" IS '市区町村追加の承認日時。承認まで名寄帳・登記のタスクは生成しない。';



COMMENT ON COLUMN "public"."real_estate_properties"."additional_approved_by" IS '市区町村追加を承認した管理担当（member_id）。';



COMMENT ON COLUMN "public"."real_estate_properties"."registration_acquirer" IS '相続登記の取得者（この物件を相続する相続人）。';



COMMENT ON COLUMN "public"."real_estate_properties"."registration_share" IS '相続登記の持分（例: 1/2、全部）。';



COMMENT ON COLUMN "public"."real_estate_properties"."land_category" IS '地目（宅地・田・畑 等）。土地のみ。';



COMMENT ON COLUMN "public"."real_estate_properties"."land_area" IS '地積（㎡）。土地のみ。';



COMMENT ON COLUMN "public"."real_estate_properties"."building_kind" IS '種類（居宅・共同住宅 等）。建物のみ。';



COMMENT ON COLUMN "public"."real_estate_properties"."building_structure" IS '構造・床面積。建物のみ。';



COMMENT ON COLUMN "public"."real_estate_properties"."share_numerator" IS '被相続人の登記持分（分子）。未入力なら持分1として扱う。';



COMMENT ON COLUMN "public"."real_estate_properties"."share_denominator" IS '被相続人の登記持分（分母）。';



COMMENT ON COLUMN "public"."real_estate_properties"."mortgage" IS '抵当権（設定内容。例：◯◯銀行 抵当権設定）。';



CREATE TABLE IF NOT EXISTS "public"."referral_destinations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "specialty" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_destinations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "referral_rate" numeric
);


ALTER TABLE "public"."referral_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reward_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "shigyo" "text" DEFAULT '司法'::"text" NOT NULL,
    "label" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "discount" numeric DEFAULT 0 NOT NULL,
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "registration_tax" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."reward_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid" NOT NULL,
    "permission" "text" NOT NULL,
    "allowed" boolean DEFAULT false
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sagyo_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "gyomu" "text" NOT NULL,
    "sagyou" "text" NOT NULL,
    "name" "text",
    "requested_to" "text",
    "requested_date" "date",
    "received_date" "date",
    "receipt_id" "uuid",
    "status" "text",
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sagyo_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ym" "text" NOT NULL,
    "meetings_count" integer DEFAULT 0 NOT NULL,
    "new_orders_count" integer DEFAULT 0 NOT NULL,
    "conversion_rate" numeric(4,1) DEFAULT 0 NOT NULL,
    "avg_order_unit" bigint DEFAULT 0 NOT NULL,
    "tax_filing_count" integer DEFAULT 0 NOT NULL,
    "property_appraisal_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."securities_holdings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "financial_asset_id" "uuid" NOT NULL,
    "brand_name" "text",
    "quantity" numeric,
    "unit_price" numeric,
    "base_date" "date",
    "amount" numeric,
    "note" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."securities_holdings" OWNER TO "postgres";


COMMENT ON TABLE "public"."securities_holdings" IS '有価証券の銘柄明細。財産目録の「合計評価額」はこの合計、「備考」は株数×1株評価額（基準日）にあたる。';



CREATE TABLE IF NOT EXISTS "public"."settlement_expense_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "kind" "text",
    "label" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "source" "text",
    "ref_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid" boolean DEFAULT false NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."settlement_expense_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlement_income_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "asset_class" "text",
    "detail" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "oc_transferred" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."settlement_income_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "color" "text",
    "sort_order" integer DEFAULT 0,
    CONSTRAINT "status_definitions_type_check" CHECK (("type" = ANY (ARRAY['case'::"text", 'task'::"text"])))
);


ALTER TABLE "public"."status_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "from_status" "text" NOT NULL,
    "to_status" "text" NOT NULL,
    "allowed_roles" "text"[],
    "requires_comment" boolean DEFAULT false,
    CONSTRAINT "status_transitions_type_check" CHECK (("type" = ANY (ARRAY['case'::"text", 'task'::"text"])))
);


ALTER TABLE "public"."status_transitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_assignees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'primary'::"text" NOT NULL,
    CONSTRAINT "task_assignees_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'sub'::"text"])))
);


ALTER TABLE "public"."task_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "comment_type" "text" DEFAULT 'comment'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "task_comments_comment_type_check" CHECK (("comment_type" = ANY (ARRAY['comment'::"text", 'rejection'::"text", 'wcheck_pass'::"text"])))
);


ALTER TABLE "public"."task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_dependencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "from_task_id" "uuid" NOT NULL,
    "to_task_id" "uuid" NOT NULL,
    "condition_type" "text" DEFAULT 'task_completed'::"text" NOT NULL,
    "checkpoint_field" "text",
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_dependencies_condition_type_check" CHECK (("condition_type" = ANY (ARRAY['task_completed'::"text", 'checkpoint'::"text"])))
);


ALTER TABLE "public"."task_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid",
    "reviewed_task_id" "uuid" NOT NULL,
    "reviewer_task_id" "uuid",
    "reviewed_member_id" "uuid",
    "reviewer_member_id" "uuid",
    "result" "text" NOT NULL,
    "defect_detail" "text",
    "gyomu" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "phase" "text" NOT NULL,
    "category" "text" NOT NULL,
    "procedure_text" "text",
    "default_role" "text",
    "is_manual" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."task_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "template_key" "text",
    "title" "text" NOT NULL,
    "phase" "text" NOT NULL,
    "category" "text",
    "status" "text" DEFAULT '未着手'::"text" NOT NULL,
    "priority" "text" DEFAULT '通常'::"text" NOT NULL,
    "due_date" "date",
    "procedure_text" "text",
    "wcheck_by" "uuid",
    "wcheck_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ext_data" "jsonb" DEFAULT '{}'::"jsonb",
    "issued_date" "date",
    "notes" "text",
    "remarks" "text",
    "started_by" "uuid",
    "started_at" timestamp with time zone,
    "work_role" "text",
    "expected_completion_date" "date",
    "completed_at" "date",
    "task_kind" "text" DEFAULT 'case'::"text" NOT NULL,
    "assign_role" "text",
    "team_id" "uuid",
    "source_rid" "text",
    "client_communication_id" "uuid",
    "origin" "text",
    "created_by" "uuid",
    CONSTRAINT "tasks_assign_role_check" CHECK (("assign_role" = ANY (ARRAY['sales'::"text", 'manager'::"text", 'both'::"text"]))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['通常'::"text", '急ぎ'::"text", '超急ぎ'::"text"]))),
    CONSTRAINT "tasks_task_kind_check" CHECK (("task_kind" = ANY (ARRAY['case'::"text", 'system'::"text", 'touki_team'::"text"]))),
    CONSTRAINT "tasks_work_role_check" CHECK (("work_role" = ANY (ARRAY['manager'::"text", 'assistant'::"text", 'accounting'::"text", 'sales'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."source_rid" IS '生成元の実施タスク(intake_roles[].rid)。実施タスク→タスクの紐付け';



CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "division" "text",
    "bank" "text",
    "is_touki_team_special" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unmatched_deposits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payer_name" "text",
    "amount" numeric NOT NULL,
    "deposit_date" "date",
    "memo" "text",
    "source_file" "text",
    "dedup_key" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "linked_invoice_id" "uuid",
    "resolved_note" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."unmatched_deposits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreement_dispatches"
    ADD CONSTRAINT "agreement_dispatches_case_id_heir_id_key" UNIQUE ("case_id", "heir_id");



ALTER TABLE ONLY "public"."agreement_dispatches"
    ADD CONSTRAINT "agreement_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_inventory"
    ADD CONSTRAINT "asset_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_expense_items"
    ADD CONSTRAINT "billing_expense_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_activities"
    ADD CONSTRAINT "case_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_clients"
    ADD CONSTRAINT "case_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_complaints"
    ADD CONSTRAINT "case_complaints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_files"
    ADD CONSTRAINT "case_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_members"
    ADD CONSTRAINT "case_members_case_id_member_id_role_key" UNIQUE ("case_id", "member_id", "role");



ALTER TABLE ONLY "public"."case_members"
    ADD CONSTRAINT "case_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_other_assets"
    ADD CONSTRAINT "case_other_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_referrals"
    ADD CONSTRAINT "case_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_reports"
    ADD CONSTRAINT "case_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_case_number_key" UNIQUE ("case_number");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_communications"
    ADD CONSTRAINT "client_communications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."confirm_events"
    ADD CONSTRAINT "confirm_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_documents"
    ADD CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_team_members"
    ADD CONSTRAINT "dashboard_team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_team_members"
    ADD CONSTRAINT "dashboard_team_members_team_id_member_id_key" UNIQUE ("team_id", "member_id");



ALTER TABLE ONLY "public"."dept_targets"
    ADD CONSTRAINT "dept_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dept_targets"
    ADD CONSTRAINT "dept_targets_ym_key" UNIQUE ("ym");



ALTER TABLE ONLY "public"."division_details"
    ADD CONSTRAINT "division_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_documents"
    ADD CONSTRAINT "document_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_receipt_item_tasks"
    ADD CONSTRAINT "document_receipt_item_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_receipt_item_tasks"
    ADD CONSTRAINT "document_receipt_item_tasks_receipt_item_id_task_id_key" UNIQUE ("receipt_item_id", "task_id");



ALTER TABLE ONLY "public"."document_receipt_items"
    ADD CONSTRAINT "document_receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_received_date_sequence_no_key" UNIQUE ("received_date", "sequence_no");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_assets"
    ADD CONSTRAINT "financial_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."heirs"
    ADD CONSTRAINT "heirs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instruction_items"
    ADD CONSTRAINT "instruction_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."koseki_images"
    ADD CONSTRAINT "koseki_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."koseki_plans"
    ADD CONSTRAINT "koseki_plans_case_id_person_name_key" UNIQUE ("case_id", "person_name");



ALTER TABLE ONLY "public"."koseki_plans"
    ADD CONSTRAINT "koseki_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_chapters"
    ADD CONSTRAINT "manual_chapters_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."manual_chapters"
    ADD CONSTRAINT "manual_chapters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_steps"
    ADD CONSTRAINT "manual_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_memos"
    ADD CONSTRAINT "meeting_memos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_member_id_role_id_key" UNIQUE ("member_id", "role_id");



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_targets"
    ADD CONSTRAINT "member_targets_member_id_ym_key" UNIQUE ("member_id", "ym");



ALTER TABLE ONLY "public"."member_targets"
    ADD CONSTRAINT "member_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."phases"
    ADD CONSTRAINT "phases_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."phases"
    ADD CONSTRAINT "phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_reports"
    ADD CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_summaries"
    ADD CONSTRAINT "progress_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."real_estate_properties"
    ADD CONSTRAINT "real_estate_properties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_destinations"
    ADD CONSTRAINT "referral_destinations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_sources"
    ADD CONSTRAINT "referral_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_sources"
    ADD CONSTRAINT "referral_sources_route_name_key" UNIQUE ("route", "name");



ALTER TABLE ONLY "public"."reward_items"
    ADD CONSTRAINT "reward_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_permission_key" UNIQUE ("role_id", "permission");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sagyo_documents"
    ADD CONSTRAINT "sagyo_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_targets"
    ADD CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_targets"
    ADD CONSTRAINT "sales_targets_ym_key" UNIQUE ("ym");



ALTER TABLE ONLY "public"."securities_holdings"
    ADD CONSTRAINT "securities_holdings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_expense_items"
    ADD CONSTRAINT "settlement_expense_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_income_items"
    ADD CONSTRAINT "settlement_income_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_definitions"
    ADD CONSTRAINT "status_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_definitions"
    ADD CONSTRAINT "status_definitions_type_key_key" UNIQUE ("type", "key");



ALTER TABLE ONLY "public"."status_transitions"
    ADD CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_transitions"
    ADD CONSTRAINT "status_transitions_type_from_status_to_status_key" UNIQUE ("type", "from_status", "to_status");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_member_id_key" UNIQUE ("task_id", "member_id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_reviews"
    ADD CONSTRAINT "task_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."case_referrals"
    ADD CONSTRAINT "uniq_case_referral" UNIQUE ("case_id", "partner_type");



ALTER TABLE ONLY "public"."unmatched_deposits"
    ADD CONSTRAINT "unmatched_deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "uq_task_dep" UNIQUE ("from_task_id", "to_task_id", "condition_type");



CREATE INDEX "idx_activity_log_actor" ON "public"."activity_log" USING "btree" ("actor_id");



CREATE INDEX "idx_activity_log_entity" ON "public"."activity_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_agreement_dispatches_case" ON "public"."agreement_dispatches" USING "btree" ("case_id");



CREATE INDEX "idx_asset_inventory_case" ON "public"."asset_inventory" USING "btree" ("case_id", "sort_order");



CREATE INDEX "idx_billing_expense_case" ON "public"."billing_expense_items" USING "btree" ("case_id", "sort_order");



CREATE INDEX "idx_case_activities_case" ON "public"."case_activities" USING "btree" ("case_id");



CREATE INDEX "idx_case_activities_date" ON "public"."case_activities" USING "btree" ("activity_date" DESC);



CREATE INDEX "idx_case_activities_task" ON "public"."case_activities" USING "btree" ("task_id");



CREATE INDEX "idx_case_clients_case" ON "public"."case_clients" USING "btree" ("case_id");



CREATE INDEX "idx_case_complaints_case_id" ON "public"."case_complaints" USING "btree" ("case_id");



CREATE INDEX "idx_case_complaints_severity" ON "public"."case_complaints" USING "btree" ("severity");



CREATE INDEX "idx_case_complaints_status" ON "public"."case_complaints" USING "btree" ("status");



CREATE INDEX "idx_case_documents_case_sent" ON "public"."case_documents" USING "btree" ("case_id", "sent_date" DESC);



CREATE INDEX "idx_case_documents_sent_waiting" ON "public"."case_documents" USING "btree" ("case_id") WHERE (("sent_date" IS NOT NULL) AND ("received_date" IS NULL));



CREATE INDEX "idx_case_files_case" ON "public"."case_files" USING "btree" ("case_id", "created_at" DESC);



CREATE INDEX "idx_case_members_case" ON "public"."case_members" USING "btree" ("case_id");



CREATE INDEX "idx_case_members_member" ON "public"."case_members" USING "btree" ("member_id");



CREATE INDEX "idx_case_other_assets_case" ON "public"."case_other_assets" USING "btree" ("case_id", "kind", "sort_order");



CREATE INDEX "idx_case_referrals_case" ON "public"."case_referrals" USING "btree" ("case_id");



CREATE INDEX "idx_case_reports_case_id" ON "public"."case_reports" USING "btree" ("case_id");



CREATE INDEX "idx_case_reports_kind" ON "public"."case_reports" USING "btree" ("kind");



CREATE INDEX "idx_case_reports_status" ON "public"."case_reports" USING "btree" ("status");



CREATE INDEX "idx_cases_bank" ON "public"."cases" USING "btree" ("bank");



CREATE INDEX "idx_cases_has_complaint" ON "public"."cases" USING "btree" ("has_complaint") WHERE ("has_complaint" = true);



CREATE INDEX "idx_cases_intake_draft" ON "public"."cases" USING "btree" ("intake_draft") WHERE ("intake_draft" = true);



CREATE INDEX "idx_cases_last_opened" ON "public"."cases" USING "btree" ("last_opened_at");



CREATE INDEX "idx_cases_lp_case_number" ON "public"."cases" USING "btree" ("lp_case_number");



CREATE INDEX "idx_cases_meeting_date" ON "public"."cases" USING "btree" ("meeting_date");



CREATE INDEX "idx_cases_partner" ON "public"."cases" USING "btree" ("partner_id");



CREATE INDEX "idx_cases_response_due" ON "public"."cases" USING "btree" ("client_response_due_date");



CREATE INDEX "idx_cases_status" ON "public"."cases" USING "btree" ("status");



CREATE INDEX "idx_client_communications_case" ON "public"."client_communications" USING "btree" ("case_id", "communicated_at" DESC);



CREATE INDEX "idx_confirm_events_case" ON "public"."confirm_events" USING "btree" ("case_id");



CREATE INDEX "idx_confirm_events_checked_at" ON "public"."confirm_events" USING "btree" ("checked_at" DESC);



CREATE INDEX "idx_confirm_events_checked_by" ON "public"."confirm_events" USING "btree" ("checked_by");



CREATE INDEX "idx_contract_documents_case" ON "public"."contract_documents" USING "btree" ("case_id");



CREATE INDEX "idx_contract_documents_category" ON "public"."contract_documents" USING "btree" ("category");



CREATE INDEX "idx_contract_documents_delivery_target" ON "public"."contract_documents" USING "btree" ("delivery_target");



CREATE INDEX "idx_dashboard_team_members_member" ON "public"."dashboard_team_members" USING "btree" ("member_id");



CREATE INDEX "idx_dashboard_team_members_team" ON "public"."dashboard_team_members" USING "btree" ("team_id");



CREATE INDEX "idx_dept_targets_ym" ON "public"."dept_targets" USING "btree" ("ym");



CREATE INDEX "idx_division_details_case" ON "public"."division_details" USING "btree" ("case_id");



CREATE INDEX "idx_document_receipt_items_delivery_target" ON "public"."document_receipt_items" USING "btree" ("delivery_target");



CREATE INDEX "idx_document_receipt_items_receipt" ON "public"."document_receipt_items" USING "btree" ("receipt_id", "sort_order");



CREATE INDEX "idx_document_receipts_case" ON "public"."document_receipts" USING "btree" ("case_id");



CREATE INDEX "idx_document_receipts_date" ON "public"."document_receipts" USING "btree" ("received_date" DESC, "sequence_no" DESC);



CREATE INDEX "idx_document_receipts_started_task" ON "public"."document_receipts" USING "btree" ("started_task_id");



CREATE INDEX "idx_document_receipts_storage_team" ON "public"."document_receipts" USING "btree" ("storage_team_id");



CREATE INDEX "idx_documents_case" ON "public"."documents" USING "btree" ("case_id");



CREATE INDEX "idx_drit_item" ON "public"."document_receipt_item_tasks" USING "btree" ("receipt_item_id");



CREATE INDEX "idx_drit_task" ON "public"."document_receipt_item_tasks" USING "btree" ("task_id");



CREATE INDEX "idx_events_case" ON "public"."events" USING "btree" ("case_id");



CREATE INDEX "idx_events_date" ON "public"."events" USING "btree" ("event_date");



CREATE INDEX "idx_events_member" ON "public"."events" USING "btree" ("member_id");



CREATE INDEX "idx_expenses_billed_invoice" ON "public"."expenses" USING "btree" ("billed_invoice_id") WHERE ("billed_invoice_id" IS NOT NULL);



CREATE INDEX "idx_expenses_case" ON "public"."expenses" USING "btree" ("case_id");



CREATE INDEX "idx_expenses_unbilled" ON "public"."expenses" USING "btree" ("case_id") WHERE ("billed_invoice_id" IS NULL);



CREATE INDEX "idx_financial_assets_case" ON "public"."financial_assets" USING "btree" ("case_id");



CREATE INDEX "idx_financial_assets_case_freeze" ON "public"."financial_assets" USING "btree" ("case_id", "freeze_confirmed");



CREATE INDEX "idx_heirs_case" ON "public"."heirs" USING "btree" ("case_id");



CREATE INDEX "idx_heirs_is_client" ON "public"."heirs" USING "btree" ("case_id") WHERE "is_client";



CREATE UNIQUE INDEX "idx_heirs_one_applicant_per_case" ON "public"."heirs" USING "btree" ("case_id") WHERE ("is_applicant" = true);



CREATE INDEX "idx_heirs_other_parent" ON "public"."heirs" USING "btree" ("other_parent_heir_id");



CREATE INDEX "idx_instruction_items_case" ON "public"."instruction_items" USING "btree" ("case_id", "sort_order");



CREATE INDEX "idx_invoices_case" ON "public"."invoices" USING "btree" ("case_id");



CREATE INDEX "idx_invoices_firm_type" ON "public"."invoices" USING "btree" ("firm_type");



CREATE INDEX "idx_invoices_posted_date" ON "public"."invoices" USING "btree" ("posted_date");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_koseki_images_case" ON "public"."koseki_images" USING "btree" ("case_id", "target_person", "sort_order");



CREATE INDEX "idx_koseki_images_request" ON "public"."koseki_images" USING "btree" ("koseki_request_id");



CREATE INDEX "idx_koseki_plans_case_id" ON "public"."koseki_plans" USING "btree" ("case_id");



CREATE INDEX "idx_koseki_requests_case" ON "public"."koseki_requests" USING "btree" ("case_id");



CREATE INDEX "idx_koseki_requests_kind" ON "public"."koseki_requests" USING "btree" ("case_id", "request_kind");



CREATE INDEX "idx_manual_steps_order" ON "public"."manual_steps" USING "btree" ("chapter", "sort_order");



CREATE INDEX "idx_meeting_memos_case" ON "public"."meeting_memos" USING "btree" ("case_id", "section", "sort_order");



CREATE INDEX "idx_member_targets_member" ON "public"."member_targets" USING "btree" ("member_id");



CREATE INDEX "idx_member_targets_ym" ON "public"."member_targets" USING "btree" ("ym");



CREATE INDEX "idx_members_is_touki_team" ON "public"."members" USING "btree" ("is_touki_team");



CREATE INDEX "idx_members_primary_role" ON "public"."members" USING "btree" ("primary_role");



CREATE INDEX "idx_members_team" ON "public"."members" USING "btree" ("team_id");



CREATE INDEX "idx_notifications_member" ON "public"."notifications" USING "btree" ("member_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_payment_check_requests_kind_status" ON "public"."payment_check_requests" USING "btree" ("kind", "status", "requested_date" DESC);



CREATE INDEX "idx_payments_invoice" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_pcr_approval_status" ON "public"."payment_check_requests" USING "btree" ("approval_status") WHERE ("approval_status" IS NOT NULL);



CREATE INDEX "idx_pcr_confirmer" ON "public"."payment_check_requests" USING "btree" ("confirmer_id");



CREATE INDEX "idx_pcr_invoice" ON "public"."payment_check_requests" USING "btree" ("invoice_id");



CREATE INDEX "idx_pcr_requester" ON "public"."payment_check_requests" USING "btree" ("requester_id");



CREATE INDEX "idx_progress_reports_case" ON "public"."progress_reports" USING "btree" ("case_id");



CREATE INDEX "idx_progress_reports_confirmer" ON "public"."progress_reports" USING "btree" ("confirmer_id");



CREATE INDEX "idx_progress_reports_kind" ON "public"."progress_reports" USING "btree" ("kind");



CREATE INDEX "idx_progress_reports_status" ON "public"."progress_reports" USING "btree" ("status");



CREATE INDEX "idx_re_acquisitions_kind" ON "public"."real_estate_acquisitions" USING "btree" ("case_id", "request_kind");



CREATE INDEX "idx_real_estate_acquisitions_case" ON "public"."real_estate_acquisitions" USING "btree" ("case_id");



CREATE INDEX "idx_real_estate_case" ON "public"."real_estate_properties" USING "btree" ("case_id");



CREATE INDEX "idx_real_estate_properties_appraisal_status" ON "public"."real_estate_properties" USING "btree" ("appraisal_status") WHERE ("appraisal_status" IS NOT NULL);



CREATE INDEX "idx_real_estate_properties_rank" ON "public"."real_estate_properties" USING "btree" ("rank") WHERE ("rank" IS NOT NULL);



CREATE INDEX "idx_referral_sources_route" ON "public"."referral_sources" USING "btree" ("route");



CREATE INDEX "idx_reward_items_case" ON "public"."reward_items" USING "btree" ("case_id", "shigyo", "sort_order");



CREATE INDEX "idx_sagyo_documents_case" ON "public"."sagyo_documents" USING "btree" ("case_id");



CREATE INDEX "idx_sagyo_documents_receipt" ON "public"."sagyo_documents" USING "btree" ("receipt_id");



CREATE INDEX "idx_sagyo_documents_sagyo" ON "public"."sagyo_documents" USING "btree" ("case_id", "gyomu", "sagyou");



CREATE INDEX "idx_sales_targets_ym" ON "public"."sales_targets" USING "btree" ("ym");



CREATE INDEX "idx_securities_holdings_asset" ON "public"."securities_holdings" USING "btree" ("financial_asset_id", "sort_order");



CREATE INDEX "idx_securities_holdings_case" ON "public"."securities_holdings" USING "btree" ("case_id");



CREATE INDEX "idx_settlement_expense_case" ON "public"."settlement_expense_items" USING "btree" ("case_id", "sort_order");



CREATE INDEX "idx_settlement_income_case" ON "public"."settlement_income_items" USING "btree" ("case_id", "sort_order");



CREATE INDEX "idx_task_assignees_member" ON "public"."task_assignees" USING "btree" ("member_id");



CREATE INDEX "idx_task_assignees_task" ON "public"."task_assignees" USING "btree" ("task_id");



CREATE INDEX "idx_task_deps_case" ON "public"."task_dependencies" USING "btree" ("case_id");



CREATE INDEX "idx_task_deps_from" ON "public"."task_dependencies" USING "btree" ("from_task_id");



CREATE INDEX "idx_task_deps_to" ON "public"."task_dependencies" USING "btree" ("to_task_id");



CREATE INDEX "idx_task_reviews_member" ON "public"."task_reviews" USING "btree" ("reviewed_member_id", "gyomu");



CREATE INDEX "idx_tasks_case" ON "public"."tasks" USING "btree" ("case_id");



CREATE INDEX "idx_tasks_client_communication" ON "public"."tasks" USING "btree" ("client_communication_id") WHERE ("client_communication_id" IS NOT NULL);



CREATE INDEX "idx_tasks_kind" ON "public"."tasks" USING "btree" ("task_kind");



CREATE INDEX "idx_tasks_phase" ON "public"."tasks" USING "btree" ("phase");



CREATE INDEX "idx_tasks_source_rid" ON "public"."tasks" USING "btree" ("case_id", "source_rid");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_tasks_team" ON "public"."tasks" USING "btree" ("team_id");



CREATE INDEX "idx_tasks_work_role" ON "public"."tasks" USING "btree" ("work_role");



CREATE INDEX "idx_unmatched_deposits_status" ON "public"."unmatched_deposits" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "progress_summaries_case_scope" ON "public"."progress_summaries" USING "btree" ("case_id", "scope_key");



CREATE UNIQUE INDEX "task_reviews_pair_uniq" ON "public"."task_reviews" USING "btree" ("reviewer_task_id", "reviewed_task_id");



CREATE UNIQUE INDEX "uidx_unmatched_deposits_dedup" ON "public"."unmatched_deposits" USING "btree" ("dedup_key") WHERE ("dedup_key" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_progress_open" ON "public"."progress_reports" USING "btree" ("case_id") WHERE ("status" = '依頼中'::"text");



CREATE OR REPLACE TRIGGER "agreement_dispatches_updated_at" BEFORE UPDATE ON "public"."agreement_dispatches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "case_clients_updated_at" BEFORE UPDATE ON "public"."case_clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "case_documents_updated_at" BEFORE UPDATE ON "public"."case_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_document_dispatches_updated_at"();



CREATE OR REPLACE TRIGGER "case_members_log_change" AFTER INSERT OR DELETE ON "public"."case_members" FOR EACH ROW EXECUTE FUNCTION "public"."log_case_member_change"();



CREATE OR REPLACE TRIGGER "case_members_sync_system_tasks" AFTER INSERT ON "public"."case_members" FOR EACH ROW EXECUTE FUNCTION "public"."sync_system_tasks_on_member_add"();



CREATE OR REPLACE TRIGGER "case_members_updated_at" BEFORE UPDATE ON "public"."case_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "case_referrals_updated_at" BEFORE UPDATE ON "public"."case_referrals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "cases_generate_system_tasks" AFTER UPDATE OF "status" ON "public"."cases" FOR EACH ROW EXECUTE FUNCTION "public"."generate_system_tasks_on_status_change"();



CREATE OR REPLACE TRIGGER "cases_generate_system_tasks_insert" AFTER INSERT ON "public"."cases" FOR EACH ROW EXECUTE FUNCTION "public"."generate_system_tasks_on_status_change"();



CREATE OR REPLACE TRIGGER "cases_set_management_started" BEFORE INSERT OR UPDATE OF "status" ON "public"."cases" FOR EACH ROW EXECUTE FUNCTION "public"."set_management_started_at"();



CREATE OR REPLACE TRIGGER "cases_status_change_log" AFTER UPDATE OF "status" ON "public"."cases" FOR EACH ROW EXECUTE FUNCTION "public"."log_case_status_change"();



CREATE OR REPLACE TRIGGER "cases_sync_review_task_due" AFTER UPDATE OF "client_response_due_date" ON "public"."cases" FOR EACH ROW EXECUTE FUNCTION "public"."sync_review_task_due_on_response_date"();



CREATE OR REPLACE TRIGGER "cases_updated_at" BEFORE UPDATE ON "public"."cases" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "contract_documents_updated_at" BEFORE UPDATE ON "public"."contract_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "heirs_updated_at" BEFORE UPDATE ON "public"."heirs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "invoices_sync_advance_payment_due" AFTER INSERT OR UPDATE OF "due_date", "invoice_type" ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."sync_advance_payment_due"();



CREATE OR REPLACE TRIGGER "invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "koseki_requests_updated_at" BEFORE UPDATE ON "public"."koseki_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "manual_chapters_updated_at" BEFORE UPDATE ON "public"."manual_chapters" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "manual_steps_updated_at" BEFORE UPDATE ON "public"."manual_steps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "payment_check_requests_updated_at" BEFORE UPDATE ON "public"."payment_check_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "progress_reports_updated_at" BEFORE UPDATE ON "public"."progress_reports" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "real_estate_acquisitions_updated_at" BEFORE UPDATE ON "public"."real_estate_acquisitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "tasks_generate_thanks_on_payment" AFTER UPDATE OF "status" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."generate_thanks_task_on_payment_confirm"();



CREATE OR REPLACE TRIGGER "tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_add_progress_memo_on_task_complete" AFTER UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."add_progress_memo_on_task_complete"();



CREATE OR REPLACE TRIGGER "trg_assign_document_receipt_sequence" BEFORE INSERT ON "public"."document_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."assign_document_receipt_sequence"();



CREATE OR REPLACE TRIGGER "trg_auto_set_case_completion_date" AFTER UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_case_completion_date"();



CREATE OR REPLACE TRIGGER "trg_case_complaints_sync" AFTER INSERT OR DELETE OR UPDATE ON "public"."case_complaints" FOR EACH ROW EXECUTE FUNCTION "public"."sync_case_has_complaint"();



CREATE OR REPLACE TRIGGER "trg_client_communications_updated_at" BEFORE UPDATE ON "public"."client_communications" FOR EACH ROW EXECUTE FUNCTION "public"."update_client_communications_updated_at"();



CREATE OR REPLACE TRIGGER "trg_dept_targets_updated_at" BEFORE UPDATE ON "public"."dept_targets" FOR EACH ROW EXECUTE FUNCTION "public"."update_dept_targets_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_receipts_updated_at" BEFORE UPDATE ON "public"."document_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."update_document_receipts_updated_at"();



CREATE OR REPLACE TRIGGER "trg_member_targets_updated_at" BEFORE UPDATE ON "public"."member_targets" FOR EACH ROW EXECUTE FUNCTION "public"."update_member_targets_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sagyo_documents_updated_at" BEFORE UPDATE ON "public"."sagyo_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_sagyo_documents_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sales_targets_updated_at" BEFORE UPDATE ON "public"."sales_targets" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_targets_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_task_completed_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_task_completed_at"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."agreement_dispatches"
    ADD CONSTRAINT "agreement_dispatches_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agreement_dispatches"
    ADD CONSTRAINT "agreement_dispatches_heir_id_fkey" FOREIGN KEY ("heir_id") REFERENCES "public"."heirs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_inventory"
    ADD CONSTRAINT "asset_inventory_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_inventory"
    ADD CONSTRAINT "asset_inventory_payer_heir_id_fkey" FOREIGN KEY ("payer_heir_id") REFERENCES "public"."heirs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_expense_items"
    ADD CONSTRAINT "billing_expense_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_activities"
    ADD CONSTRAINT "case_activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_activities"
    ADD CONSTRAINT "case_activities_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."case_activities"
    ADD CONSTRAINT "case_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."case_clients"
    ADD CONSTRAINT "case_clients_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_complaints"
    ADD CONSTRAINT "case_complaints_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_complaints"
    ADD CONSTRAINT "case_complaints_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_complaints"
    ADD CONSTRAINT "case_complaints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_complaints"
    ADD CONSTRAINT "case_complaints_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_files"
    ADD CONSTRAINT "case_files_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_files"
    ADD CONSTRAINT "case_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_members"
    ADD CONSTRAINT "case_members_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_members"
    ADD CONSTRAINT "case_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_other_assets"
    ADD CONSTRAINT "case_other_assets_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_other_assets"
    ADD CONSTRAINT "case_other_assets_payer_heir_id_fkey" FOREIGN KEY ("payer_heir_id") REFERENCES "public"."heirs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."case_referrals"
    ADD CONSTRAINT "case_referrals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_reports"
    ADD CONSTRAINT "case_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_reports"
    ADD CONSTRAINT "case_reports_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_reports"
    ADD CONSTRAINT "case_reports_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."case_reports"
    ADD CONSTRAINT "case_reports_reviewing_by_fkey" FOREIGN KEY ("reviewing_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_accounting_memo_updated_by_fkey" FOREIGN KEY ("accounting_memo_updated_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_meeting_owner_id_fkey" FOREIGN KEY ("meeting_owner_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_order_sheet_finalized_by_fkey" FOREIGN KEY ("order_sheet_finalized_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_referral_destination_id_fkey" FOREIGN KEY ("referral_destination_id") REFERENCES "public"."referral_destinations"("id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_work_prep_advanced_by_fkey" FOREIGN KEY ("work_prep_advanced_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_work_start_ok_by_fkey" FOREIGN KEY ("work_start_ok_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_communications"
    ADD CONSTRAINT "client_communications_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."confirm_events"
    ADD CONSTRAINT "confirm_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."confirm_events"
    ADD CONSTRAINT "confirm_events_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."confirm_events"
    ADD CONSTRAINT "confirm_events_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contract_documents"
    ADD CONSTRAINT "contract_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_documents"
    ADD CONSTRAINT "contract_documents_delivery_check_by_fkey" FOREIGN KEY ("delivery_check_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."contract_documents"
    ADD CONSTRAINT "contract_documents_delivery_recipient_heir_id_fkey" FOREIGN KEY ("delivery_recipient_heir_id") REFERENCES "public"."heirs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard_team_members"
    ADD CONSTRAINT "dashboard_team_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard_team_members"
    ADD CONSTRAINT "dashboard_team_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_team_members"
    ADD CONSTRAINT "dashboard_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."division_details"
    ADD CONSTRAINT "division_details_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_documents"
    ADD CONSTRAINT "document_dispatches_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."case_documents"
    ADD CONSTRAINT "document_dispatches_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_receipt_item_tasks"
    ADD CONSTRAINT "document_receipt_item_tasks_receipt_item_id_fkey" FOREIGN KEY ("receipt_item_id") REFERENCES "public"."document_receipt_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_receipt_item_tasks"
    ADD CONSTRAINT "document_receipt_item_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_receipt_items"
    ADD CONSTRAINT "document_receipt_items_case_document_id_fkey" FOREIGN KEY ("case_document_id") REFERENCES "public"."case_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_receipt_items"
    ADD CONSTRAINT "document_receipt_items_delivery_check_by_fkey" FOREIGN KEY ("delivery_check_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."document_receipt_items"
    ADD CONSTRAINT "document_receipt_items_delivery_recipient_heir_id_fkey" FOREIGN KEY ("delivery_recipient_heir_id") REFERENCES "public"."heirs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_receipt_items"
    ADD CONSTRAINT "document_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."document_receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_dual_check_member_id_fkey" FOREIGN KEY ("dual_check_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_started_by_member_id_fkey" FOREIGN KEY ("started_by_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_started_task_id_fkey" FOREIGN KEY ("started_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_receipts"
    ADD CONSTRAINT "document_receipts_storage_team_id_fkey" FOREIGN KEY ("storage_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_billed_invoice_id_fkey" FOREIGN KEY ("billed_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_related_task_id_fkey" FOREIGN KEY ("related_task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."financial_assets"
    ADD CONSTRAINT "financial_assets_balance_confirm_requested_by_fkey" FOREIGN KEY ("balance_confirm_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_assets"
    ADD CONSTRAINT "financial_assets_balance_confirmed_by_fkey" FOREIGN KEY ("balance_confirmed_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_assets"
    ADD CONSTRAINT "financial_assets_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_assets"
    ADD CONSTRAINT "financial_assets_freeze_confirm_requested_by_fkey" FOREIGN KEY ("freeze_confirm_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_assets"
    ADD CONSTRAINT "financial_assets_freeze_confirmed_by_fkey" FOREIGN KEY ("freeze_confirmed_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."heirs"
    ADD CONSTRAINT "heirs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."heirs"
    ADD CONSTRAINT "heirs_other_parent_heir_id_fkey" FOREIGN KEY ("other_parent_heir_id") REFERENCES "public"."heirs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."instruction_items"
    ADD CONSTRAINT "instruction_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instruction_items"
    ADD CONSTRAINT "instruction_items_heir_id_fkey" FOREIGN KEY ("heir_id") REFERENCES "public"."heirs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."koseki_images"
    ADD CONSTRAINT "koseki_images_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."koseki_images"
    ADD CONSTRAINT "koseki_images_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_images"
    ADD CONSTRAINT "koseki_images_koseki_request_id_fkey" FOREIGN KEY ("koseki_request_id") REFERENCES "public"."koseki_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_plans"
    ADD CONSTRAINT "koseki_plans_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_additional_approved_by_fkey" FOREIGN KEY ("additional_approved_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_receipt_check_by_fkey" FOREIGN KEY ("receipt_check_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_receipt_check_requested_by_fkey" FOREIGN KEY ("receipt_check_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_receipt_done_by_fkey" FOREIGN KEY ("receipt_done_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_request_check_by_fkey" FOREIGN KEY ("request_check_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_request_check_requested_by_fkey" FOREIGN KEY ("request_check_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."koseki_requests"
    ADD CONSTRAINT "koseki_requests_request_done_by_fkey" FOREIGN KEY ("request_done_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manual_steps"
    ADD CONSTRAINT "manual_steps_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_memos"
    ADD CONSTRAINT "meeting_memos_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_memos"
    ADD CONSTRAINT "meeting_memos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_roles"
    ADD CONSTRAINT "member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_targets"
    ADD CONSTRAINT "member_targets_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_leader_approver_id_fkey" FOREIGN KEY ("leader_approver_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."payment_check_requests"
    ADD CONSTRAINT "payment_check_requests_sales_approver_id_fkey" FOREIGN KEY ("sales_approver_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_reports"
    ADD CONSTRAINT "progress_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_reports"
    ADD CONSTRAINT "progress_reports_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."progress_reports"
    ADD CONSTRAINT "progress_reports_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."progress_summaries"
    ADD CONSTRAINT "progress_summaries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_summaries"
    ADD CONSTRAINT "progress_summaries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_additional_approved_by_fkey" FOREIGN KEY ("additional_approved_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_contract_document_id_fkey" FOREIGN KEY ("contract_document_id") REFERENCES "public"."contract_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_receipt_check_by_fkey" FOREIGN KEY ("receipt_check_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_receipt_check_requested_by_fkey" FOREIGN KEY ("receipt_check_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_receipt_done_by_fkey" FOREIGN KEY ("receipt_done_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_request_check_by_fkey" FOREIGN KEY ("request_check_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_request_check_requested_by_fkey" FOREIGN KEY ("request_check_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_request_done_by_fkey" FOREIGN KEY ("request_done_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_acquisitions"
    ADD CONSTRAINT "real_estate_acquisitions_target_property_id_fkey" FOREIGN KEY ("target_property_id") REFERENCES "public"."real_estate_properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_properties"
    ADD CONSTRAINT "real_estate_properties_additional_approved_by_fkey" FOREIGN KEY ("additional_approved_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_properties"
    ADD CONSTRAINT "real_estate_properties_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."real_estate_properties"
    ADD CONSTRAINT "real_estate_properties_confirm_requested_by_fkey" FOREIGN KEY ("confirm_requested_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."real_estate_properties"
    ADD CONSTRAINT "real_estate_properties_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reward_items"
    ADD CONSTRAINT "reward_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sagyo_documents"
    ADD CONSTRAINT "sagyo_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sagyo_documents"
    ADD CONSTRAINT "sagyo_documents_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."document_receipts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."securities_holdings"
    ADD CONSTRAINT "securities_holdings_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."securities_holdings"
    ADD CONSTRAINT "securities_holdings_financial_asset_id_fkey" FOREIGN KEY ("financial_asset_id") REFERENCES "public"."financial_assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlement_expense_items"
    ADD CONSTRAINT "settlement_expense_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlement_income_items"
    ADD CONSTRAINT "settlement_income_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_from_task_id_fkey" FOREIGN KEY ("from_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_to_task_id_fkey" FOREIGN KEY ("to_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_reviews"
    ADD CONSTRAINT "task_reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_reviews"
    ADD CONSTRAINT "task_reviews_reviewed_member_id_fkey" FOREIGN KEY ("reviewed_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_reviews"
    ADD CONSTRAINT "task_reviews_reviewed_task_id_fkey" FOREIGN KEY ("reviewed_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_reviews"
    ADD CONSTRAINT "task_reviews_reviewer_member_id_fkey" FOREIGN KEY ("reviewer_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_reviews"
    ADD CONSTRAINT "task_reviews_reviewer_task_id_fkey" FOREIGN KEY ("reviewer_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_client_communication_id_fkey" FOREIGN KEY ("client_communication_id") REFERENCES "public"."client_communications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_wcheck_by_fkey" FOREIGN KEY ("wcheck_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."unmatched_deposits"
    ADD CONSTRAINT "unmatched_deposits_linked_invoice_id_fkey" FOREIGN KEY ("linked_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."unmatched_deposits"
    ADD CONSTRAINT "unmatched_deposits_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_log_insert" ON "public"."activity_log" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "activity_log_select" ON "public"."activity_log" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."agreement_dispatches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agreement_dispatches_all" ON "public"."agreement_dispatches" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."asset_inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_inventory_all" ON "public"."asset_inventory" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."billing_expense_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_expense_items_all" ON "public"."billing_expense_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."case_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_clients_all" ON "public"."case_clients" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."case_complaints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_complaints_all" ON "public"."case_complaints" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."case_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_documents_modify" ON "public"."case_documents" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "case_documents_select" ON "public"."case_documents" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."case_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_files_all" ON "public"."case_files" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."case_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_members_all" ON "public"."case_members" TO "authenticated" USING (true);



ALTER TABLE "public"."case_other_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_other_assets_all" ON "public"."case_other_assets" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."case_referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_referrals_all" ON "public"."case_referrals" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."case_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "case_reports_all" ON "public"."case_reports" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cases_delete" ON "public"."cases" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "cases_insert" ON "public"."cases" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "cases_select" ON "public"."cases" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cases_update" ON "public"."cases" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."client_communications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_communications_modify_authenticated" ON "public"."client_communications" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "client_communications_select_authenticated" ON "public"."client_communications" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_all" ON "public"."clients" TO "authenticated" USING (true);



ALTER TABLE "public"."confirm_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "confirm_events_all" ON "public"."confirm_events" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."contract_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contract_documents_all" ON "public"."contract_documents" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."dashboard_team_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dashboard_team_members_all" ON "public"."dashboard_team_members" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."dept_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dept_targets_modify_authenticated" ON "public"."dept_targets" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "dept_targets_select_authenticated" ON "public"."dept_targets" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."document_receipt_item_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_receipt_item_tasks_all" ON "public"."document_receipt_item_tasks" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."document_receipt_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_receipt_items_modify_authenticated" ON "public"."document_receipt_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "document_receipt_items_select_authenticated" ON "public"."document_receipt_items" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."document_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_receipts_modify_authenticated" ON "public"."document_receipts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "document_receipts_select_authenticated" ON "public"."document_receipts" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_delete" ON "public"."documents" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "documents_insert" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "documents_select" ON "public"."documents" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "documents_update" ON "public"."documents" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_all" ON "public"."events" TO "authenticated" USING (true);



ALTER TABLE "public"."instruction_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "instruction_items_all" ON "public"."instruction_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_all" ON "public"."invoices" TO "authenticated" USING (true);



ALTER TABLE "public"."koseki_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "koseki_images_all" ON "public"."koseki_images" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."koseki_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "koseki_plans_all" ON "public"."koseki_plans" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."koseki_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "koseki_requests_all" ON "public"."koseki_requests" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."manual_chapters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manual_chapters_all" ON "public"."manual_chapters" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."manual_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manual_steps_all" ON "public"."manual_steps" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."meeting_memos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meeting_memos_all" ON "public"."meeting_memos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."member_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_roles_all" ON "public"."member_roles" TO "authenticated" USING (true);



CREATE POLICY "member_roles_select" ON "public"."member_roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."member_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_targets_modify_authenticated" ON "public"."member_targets" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "member_targets_select_authenticated" ON "public"."member_targets" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_insert" ON "public"."members" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "members_select" ON "public"."members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "members_update" ON "public"."members" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_all" ON "public"."notifications" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "partners_all" ON "public"."partners" TO "authenticated" USING (true);



ALTER TABLE "public"."payment_check_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_check_requests_all" ON "public"."payment_check_requests" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_all" ON "public"."payments" TO "authenticated" USING (true);



ALTER TABLE "public"."phases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "phases_select" ON "public"."phases" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."progress_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_reports_all" ON "public"."progress_reports" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."progress_summaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_summaries_all" ON "public"."progress_summaries" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."real_estate_acquisitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "real_estate_acquisitions_all" ON "public"."real_estate_acquisitions" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."referral_destinations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_destinations_all" ON "public"."referral_destinations" TO "authenticated" USING (true);



ALTER TABLE "public"."referral_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_sources_all" ON "public"."referral_sources" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."reward_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reward_items_all" ON "public"."reward_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_select" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."sagyo_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sagyo_documents_modify_authenticated" ON "public"."sagyo_documents" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "sagyo_documents_select_authenticated" ON "public"."sagyo_documents" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."sales_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_targets_modify_authenticated" ON "public"."sales_targets" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "sales_targets_select_authenticated" ON "public"."sales_targets" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."securities_holdings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "securities_holdings_all" ON "public"."securities_holdings" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."settlement_expense_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_expense_items_all" ON "public"."settlement_expense_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."settlement_income_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_income_items_all" ON "public"."settlement_income_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."status_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "status_definitions_select" ON "public"."status_definitions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."status_transitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "status_transitions_select" ON "public"."status_transitions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_assignees_all" ON "public"."task_assignees" TO "authenticated" USING (true);



ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_comments_all" ON "public"."task_comments" TO "authenticated" USING (true);



ALTER TABLE "public"."task_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_reviews_all" ON "public"."task_reviews" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."task_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_templates_select" ON "public"."task_templates" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete" ON "public"."tasks" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "tasks_insert" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tasks_select" ON "public"."tasks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tasks_update" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_modify_authenticated" ON "public"."teams" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "teams_select_authenticated" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."unmatched_deposits" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."add_progress_memo_on_task_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_progress_memo_on_task_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_progress_memo_on_task_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_document_receipt_sequence"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_document_receipt_sequence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_document_receipt_sequence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_set_case_completion_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_set_case_completion_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_set_case_completion_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date", "p_assign_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date", "p_assign_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_system_task"("p_case_id" "uuid", "p_template_key" "text", "p_category" "text", "p_title" "text", "p_procedure" "text", "p_work_role" "text", "p_due_date" "date", "p_assign_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_manager_assign_tasks"("p_case_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_manager_assign_tasks"("p_case_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_manager_assign_tasks"("p_case_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_case_alert_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_case_alert_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_case_alert_tasks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_system_tasks_on_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_system_tasks_on_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_system_tasks_on_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_thanks_task_on_payment_confirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_thanks_task_on_payment_confirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_thanks_task_on_payment_confirm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_case_member_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_case_member_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_case_member_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_case_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_case_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_case_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_periodic_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_periodic_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_periodic_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_management_started_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_management_started_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_management_started_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_task_completed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_task_completed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_task_completed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_advance_payment_due"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_advance_payment_due"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_advance_payment_due"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_case_has_complaint"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_case_has_complaint"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_case_has_complaint"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_review_task_due_on_response_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_review_task_due_on_response_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_review_task_due_on_response_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_system_tasks_on_member_add"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_system_tasks_on_member_add"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_system_tasks_on_member_add"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_client_communications_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_client_communications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_client_communications_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_dept_targets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dept_targets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dept_targets_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_document_dispatches_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_document_dispatches_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_document_dispatches_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_document_receipts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_document_receipts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_document_receipts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_member_targets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_targets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_targets_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sagyo_documents_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sagyo_documents_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sagyo_documents_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sales_targets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sales_targets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sales_targets_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."agreement_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."agreement_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."agreement_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."asset_inventory" TO "anon";
GRANT ALL ON TABLE "public"."asset_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."billing_expense_items" TO "anon";
GRANT ALL ON TABLE "public"."billing_expense_items" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_expense_items" TO "service_role";



GRANT ALL ON TABLE "public"."case_activities" TO "anon";
GRANT ALL ON TABLE "public"."case_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."case_activities" TO "service_role";



GRANT ALL ON TABLE "public"."case_clients" TO "anon";
GRANT ALL ON TABLE "public"."case_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."case_clients" TO "service_role";



GRANT ALL ON TABLE "public"."case_complaints" TO "anon";
GRANT ALL ON TABLE "public"."case_complaints" TO "authenticated";
GRANT ALL ON TABLE "public"."case_complaints" TO "service_role";



GRANT ALL ON TABLE "public"."case_documents" TO "anon";
GRANT ALL ON TABLE "public"."case_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."case_documents" TO "service_role";



GRANT ALL ON TABLE "public"."case_files" TO "anon";
GRANT ALL ON TABLE "public"."case_files" TO "authenticated";
GRANT ALL ON TABLE "public"."case_files" TO "service_role";



GRANT ALL ON TABLE "public"."case_members" TO "anon";
GRANT ALL ON TABLE "public"."case_members" TO "authenticated";
GRANT ALL ON TABLE "public"."case_members" TO "service_role";



GRANT ALL ON TABLE "public"."case_other_assets" TO "anon";
GRANT ALL ON TABLE "public"."case_other_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."case_other_assets" TO "service_role";



GRANT ALL ON TABLE "public"."case_referrals" TO "anon";
GRANT ALL ON TABLE "public"."case_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."case_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."case_reports" TO "anon";
GRANT ALL ON TABLE "public"."case_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."case_reports" TO "service_role";



GRANT ALL ON TABLE "public"."cases" TO "anon";
GRANT ALL ON TABLE "public"."cases" TO "authenticated";
GRANT ALL ON TABLE "public"."cases" TO "service_role";



GRANT ALL ON TABLE "public"."client_communications" TO "anon";
GRANT ALL ON TABLE "public"."client_communications" TO "authenticated";
GRANT ALL ON TABLE "public"."client_communications" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."confirm_events" TO "anon";
GRANT ALL ON TABLE "public"."confirm_events" TO "authenticated";
GRANT ALL ON TABLE "public"."confirm_events" TO "service_role";



GRANT ALL ON TABLE "public"."contract_documents" TO "anon";
GRANT ALL ON TABLE "public"."contract_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_documents" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_team_members" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_team_members" TO "service_role";



GRANT ALL ON TABLE "public"."dept_targets" TO "anon";
GRANT ALL ON TABLE "public"."dept_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."dept_targets" TO "service_role";



GRANT ALL ON TABLE "public"."division_details" TO "anon";
GRANT ALL ON TABLE "public"."division_details" TO "authenticated";
GRANT ALL ON TABLE "public"."division_details" TO "service_role";



GRANT ALL ON TABLE "public"."document_receipt_item_tasks" TO "anon";
GRANT ALL ON TABLE "public"."document_receipt_item_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."document_receipt_item_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."document_receipt_items" TO "anon";
GRANT ALL ON TABLE "public"."document_receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."document_receipt_items" TO "service_role";



GRANT ALL ON TABLE "public"."document_receipts" TO "anon";
GRANT ALL ON TABLE "public"."document_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."document_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."financial_assets" TO "anon";
GRANT ALL ON TABLE "public"."financial_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_assets" TO "service_role";



GRANT ALL ON TABLE "public"."heirs" TO "anon";
GRANT ALL ON TABLE "public"."heirs" TO "authenticated";
GRANT ALL ON TABLE "public"."heirs" TO "service_role";



GRANT ALL ON TABLE "public"."instruction_items" TO "anon";
GRANT ALL ON TABLE "public"."instruction_items" TO "authenticated";
GRANT ALL ON TABLE "public"."instruction_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."koseki_images" TO "anon";
GRANT ALL ON TABLE "public"."koseki_images" TO "authenticated";
GRANT ALL ON TABLE "public"."koseki_images" TO "service_role";



GRANT ALL ON TABLE "public"."koseki_plans" TO "anon";
GRANT ALL ON TABLE "public"."koseki_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."koseki_plans" TO "service_role";



GRANT ALL ON TABLE "public"."koseki_requests" TO "anon";
GRANT ALL ON TABLE "public"."koseki_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."koseki_requests" TO "service_role";



GRANT ALL ON TABLE "public"."manual_chapters" TO "anon";
GRANT ALL ON TABLE "public"."manual_chapters" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_chapters" TO "service_role";



GRANT ALL ON TABLE "public"."manual_steps" TO "anon";
GRANT ALL ON TABLE "public"."manual_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_steps" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_memos" TO "anon";
GRANT ALL ON TABLE "public"."meeting_memos" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_memos" TO "service_role";



GRANT ALL ON TABLE "public"."member_roles" TO "anon";
GRANT ALL ON TABLE "public"."member_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."member_roles" TO "service_role";



GRANT ALL ON TABLE "public"."member_targets" TO "anon";
GRANT ALL ON TABLE "public"."member_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."member_targets" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."payment_check_requests" TO "anon";
GRANT ALL ON TABLE "public"."payment_check_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_check_requests" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."phases" TO "anon";
GRANT ALL ON TABLE "public"."phases" TO "authenticated";
GRANT ALL ON TABLE "public"."phases" TO "service_role";



GRANT ALL ON TABLE "public"."progress_reports" TO "anon";
GRANT ALL ON TABLE "public"."progress_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_reports" TO "service_role";



GRANT ALL ON TABLE "public"."progress_summaries" TO "anon";
GRANT ALL ON TABLE "public"."progress_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."real_estate_acquisitions" TO "anon";
GRANT ALL ON TABLE "public"."real_estate_acquisitions" TO "authenticated";
GRANT ALL ON TABLE "public"."real_estate_acquisitions" TO "service_role";



GRANT ALL ON TABLE "public"."real_estate_properties" TO "anon";
GRANT ALL ON TABLE "public"."real_estate_properties" TO "authenticated";
GRANT ALL ON TABLE "public"."real_estate_properties" TO "service_role";



GRANT ALL ON TABLE "public"."referral_destinations" TO "anon";
GRANT ALL ON TABLE "public"."referral_destinations" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_destinations" TO "service_role";



GRANT ALL ON TABLE "public"."referral_sources" TO "anon";
GRANT ALL ON TABLE "public"."referral_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_sources" TO "service_role";



GRANT ALL ON TABLE "public"."reward_items" TO "anon";
GRANT ALL ON TABLE "public"."reward_items" TO "authenticated";
GRANT ALL ON TABLE "public"."reward_items" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sagyo_documents" TO "anon";
GRANT ALL ON TABLE "public"."sagyo_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."sagyo_documents" TO "service_role";



GRANT ALL ON TABLE "public"."sales_targets" TO "anon";
GRANT ALL ON TABLE "public"."sales_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_targets" TO "service_role";



GRANT ALL ON TABLE "public"."securities_holdings" TO "anon";
GRANT ALL ON TABLE "public"."securities_holdings" TO "authenticated";
GRANT ALL ON TABLE "public"."securities_holdings" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_expense_items" TO "anon";
GRANT ALL ON TABLE "public"."settlement_expense_items" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_expense_items" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_income_items" TO "anon";
GRANT ALL ON TABLE "public"."settlement_income_items" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_income_items" TO "service_role";



GRANT ALL ON TABLE "public"."status_definitions" TO "anon";
GRANT ALL ON TABLE "public"."status_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."status_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."status_transitions" TO "anon";
GRANT ALL ON TABLE "public"."status_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."status_transitions" TO "service_role";



GRANT ALL ON TABLE "public"."task_assignees" TO "anon";
GRANT ALL ON TABLE "public"."task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."task_comments" TO "anon";
GRANT ALL ON TABLE "public"."task_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."task_comments" TO "service_role";



GRANT ALL ON TABLE "public"."task_dependencies" TO "anon";
GRANT ALL ON TABLE "public"."task_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."task_dependencies" TO "service_role";



GRANT ALL ON TABLE "public"."task_reviews" TO "anon";
GRANT ALL ON TABLE "public"."task_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."task_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."task_templates" TO "anon";
GRANT ALL ON TABLE "public"."task_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."task_templates" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."unmatched_deposits" TO "anon";
GRANT ALL ON TABLE "public"."unmatched_deposits" TO "authenticated";
GRANT ALL ON TABLE "public"."unmatched_deposits" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































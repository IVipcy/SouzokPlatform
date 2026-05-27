-- ============================================================
-- 046_system_tasks.sql
-- システムタスクの導入
--
-- タスクは2分類:
--   - 案件タスク (task_kind='case')   : 既存。Phase別、前後関係あり、手動作成
--   - システムタスク (task_kind='system'): 案件運用前後の初期/連絡タスク。
--                                          前後関係なし、ステータス変更や日付で自動生成
--
-- このマイグレーションでは:
--   1. tasks.task_kind カラム追加
--   2. 案件ステータス変更時に各種システムタスクを自動生成する trigger
--      - status → '検討中' : 「検討状況の確認」
--      - status → '受注'   : 9つの初期システムタスク
-- ============================================================

-- 1) tasks に task_kind カラム追加
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_kind TEXT NOT NULL DEFAULT 'case'
  CHECK (task_kind IN ('case', 'system'));

CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(task_kind);

-- 2) システムタスク生成用のヘルパー関数
-- 同一案件で同じ template_key のシステムタスクが存在する場合は再生成しない
CREATE OR REPLACE FUNCTION create_system_task(
  p_case_id     UUID,
  p_template_key TEXT,
  p_category    TEXT,
  p_title       TEXT,
  p_procedure   TEXT,
  p_work_role   TEXT,
  p_due_date    DATE DEFAULT NULL
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql;

-- 3) 案件ステータス変更時のシステムタスク自動生成 trigger
CREATE OR REPLACE FUNCTION generate_system_tasks_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- ステータスが変わらないなら何もしない
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ────────────────────────────
  -- 検討中 → 「検討状況の確認」
  -- ────────────────────────────
  IF NEW.status = '検討中' THEN
    PERFORM create_system_task(
      NEW.id,
      'sys_review_status',
      '面談',
      '検討状況の確認',
      E'【作業内容】面談実施後、お客様から回答予定日に検討状況を確認する\n\n【手順】\n□ 案件詳細の回答予定日を確認\n□ お客様に連絡し、検討状況をヒアリング\n□ やり取り履歴に記録',
      'sales',
      NULL  -- 期限は回答予定日（cases に該当列がある場合は NEW から取得）
    );
  END IF;

  -- ────────────────────────────
  -- 受注 → 9つの初期システムタスク
  -- ────────────────────────────
  IF NEW.status = '受注' THEN
    PERFORM create_system_task(
      NEW.id, 'sys_contract_create', '契約',
      '契約書の作成・送付',
      E'【作業内容】案件詳細画面の内容に基づいて、契約書類を作成・送付する\n\n【手順】\n□ 面談の情報を顧客管理システムに入力\n□ 契約内容に基づき契約書・必要書類を作成\n□ お客様に送付\n\n【ポイント】\n・面談時にお渡し済の書類もあるので、何が必要か確認',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_case_handover', '契約',
      '案件内容の共有',
      E'【作業内容】受注担当者から管理担当者へ案件の引継ぎを行う\n\n【手順】\n□ 割振りされたメールを確認、管理担当者に共有',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_contract_confirm', '契約',
      '契約書の確認',
      E'【作業内容】お客様から返送された契約書を確認する\n\n【手順】\n□ 返送された契約書を確認\n\n【ポイント】\n・不備があれば即ご案内',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_advance_invoice', '初期対応',
      '前受金請求書作成・送付',
      E'【作業内容】前受金の請求書を発行しお客様に請求する\n\n【手順】\n□ 案件詳細の契約・報酬・請求タブで前受金額を入力\n□ 請求書発行ボタンで請求書を発行\n□ 発行後、ステータスを入金待ちに変更',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_advance_payment_confirm', '初期対応',
      '前受金入金の確認',
      E'【作業内容】お客様からの入金確認\n\n【手順】\n□ 経理メール / 顧客管理システムで入金ステータスを確認',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_thanks_contact', '初期対応',
      'お客様への御礼連絡',
      E'【作業内容】ご入金・書類送付の御礼連絡\n\n【手順】\n□ 契約確認 / 入金確認が完了したら御礼の連絡をする',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_received_docs_check', '初期対応',
      '送付書類の確認',
      E'【作業内容】お客様からお送りいただいた書面の確認\n\n【手順】\n□ 通数・印影・必要書類が揃っているかを確認',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_original_receipt', '初期対応',
      '原本預かり証の送付',
      E'【作業内容】お預かりした原本に対し、原本預かり証を発行・送付する\n\n【手順】\n□ 預かり書類の通数を確認\n□ 原本預かり証を発行、写しを取って原本を返送',
      'sales', NULL
    );
    PERFORM create_system_task(
      NEW.id, 'sys_initial_tasks_create', '初期対応',
      '初期タスクあげ',
      E'【作業内容】契約書返送・前金入金確認後、初期に動けるタスクを全てあげる\n\n【手順】\n□ オーダーシートを参照し、可能な案件タスクをあげる',
      'manager', NULL
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_generate_system_tasks ON cases;
CREATE TRIGGER cases_generate_system_tasks
AFTER UPDATE OF status ON cases
FOR EACH ROW EXECUTE FUNCTION generate_system_tasks_on_status_change();

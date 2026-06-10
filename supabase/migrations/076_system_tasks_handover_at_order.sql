-- ============================================================
-- 076_system_tasks_handover_at_order.sql
-- システムタスクの調整
--   1. 「案件内容の共有」(sys_case_handover) を受注時に作成する。
--      （従来は管理担当アサイン時＝実質「対応中」付近で生成されていた）
--   2. 「原本預かり証の送付」(sys_original_receipt) を廃止（優先度低）。
--      未完了の既存タスクは削除、完了済みは履歴として残す。
-- すべて関数の差し替え（CREATE OR REPLACE）＋データ整理。非破壊。
-- ============================================================

-- ── 1. 受注時の生成内容を差し替え ──
--   ・原本預かり証の送付 を削除
--   ・案件内容の共有 を追加（受注日+3日 / 受注担当）
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

    -- 案件内容の共有（受注担当）: 受注日+3日。受注担当→管理担当への引継ぎ。
    PERFORM create_system_task(
      NEW.id, 'sys_case_handover', '初期対応', '案件内容の共有',
      E'【作業内容】受注担当者から管理担当者へ案件の引継ぎを行う\n\n【手順】\n□ 割振りされたメールを確認、管理担当者に共有',
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

    -- 受注時点で既に管理担当がいる場合は、アサイン由来タスクも生成
    PERFORM ensure_manager_assign_tasks(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. 管理担当アサイン由来タスクから「案件内容の共有」を外す ──
--   案件内容の共有は受注時に生成するため、ここでは「初期タスクあげ」のみ。
CREATE OR REPLACE FUNCTION ensure_manager_assign_tasks(p_case_id UUID)
RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_assigned DATE;
BEGIN
  SELECT status INTO v_status FROM cases WHERE id = p_case_id;
  IF v_status NOT IN ('受注', '対応中', '保留・長期', '完了') THEN
    RETURN;
  END IF;

  SELECT MIN(assigned_at)::date INTO v_assigned
    FROM case_members
   WHERE case_id = p_case_id AND role = 'manager';

  IF v_assigned IS NULL THEN
    RETURN;
  END IF;

  -- 初期タスクあげ（両担当）: 管理担当アサイン日 +1日
  PERFORM create_system_task(
    p_case_id, 'sys_initial_tasks_create', '初期対応', '初期タスクあげ',
    E'【作業内容】契約書返送・前金入金確認後、初期に動けるタスクを全てあげる\n\n【手順】\n□ オーダーシートを参照し、可能な案件タスクをあげる',
    'manager', v_assigned + 1, 'both'
  );
END;
$$ LANGUAGE plpgsql;

-- ── 3. 廃止: 原本預かり証の送付（未完了のみ削除。完了済みは履歴として残す） ──
DELETE FROM tasks
 WHERE task_kind = 'system'
   AND status <> '完了'
   AND template_key = 'sys_original_receipt';

-- ── 4. 既存の受注以降案件に「案件内容の共有」をバックフィル ──
--   create_system_task の重複ガードで、既にある案件は作り直さない。
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT id, COALESCE(order_received_date, CURRENT_DATE) AS od
      FROM cases
     WHERE status IN ('受注', '対応中', '保留・長期', '完了')
  LOOP
    PERFORM create_system_task(
      c.id, 'sys_case_handover', '初期対応', '案件内容の共有',
      E'【作業内容】受注担当者から管理担当者へ案件の引継ぎを行う\n\n【手順】\n□ 割振りされたメールを確認、管理担当者に共有',
      'sales', c.od + 3, 'sales'
    );
  END LOOP;
END $$;

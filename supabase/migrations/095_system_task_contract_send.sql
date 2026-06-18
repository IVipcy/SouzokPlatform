-- ============================================================
-- 095_system_task_contract_send.sql
-- 初期システムタスクに「契約書・委任状の送付」(sys_contract_send) を追加。
--   契約書をその場で受け取れず、オーシャンが契約書・委任状をお客様へ郵送→返送してもらう運用のため、
--   その「送付」作業を初期タスク化する（返送物の受領は到着物受信簿で管理するためタスク化しない）。
--   生成タイミング: 検討中（契約書待ち） / 受注。
-- 関数 generate_system_tasks_on_status_change() を差し替え（追加のみ・非破壊）。
-- create_system_task の重複ガードにより、検討中（契約書待ち）→受注 で二重生成しない。
-- ※ 初期タスク確認ポップアップ側は INITIAL_TASK_KEYS に 'sys_contract_send' を追加する。
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

  -- ── 検討中（契約書待ち） → 契約書・委任状の送付 ──
  IF NEW.status = '検討中（契約書待ち）' THEN
    PERFORM create_system_task(
      NEW.id, 'sys_contract_send', '初期対応', '契約書・委任状の送付',
      E'【作業内容】契約書・委任状をお客様へ郵送し、署名捺印して返送してもらう\n\n【手順】\n□ 契約書・委任状を準備\n□ お客様へ郵送\n□ 返送物は到着物受信簿で受領管理（タスク化不要）',
      'sales', CURRENT_DATE, 'sales'
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

    -- 契約書・委任状の送付（その場で受け取れなかった場合）受注日当日 / 受注担当
    PERFORM create_system_task(
      NEW.id, 'sys_contract_send', '初期対応', '契約書・委任状の送付',
      E'【作業内容】契約書・委任状をお客様へ郵送し、署名捺印して返送してもらう\n\n【手順】\n□ 契約書・委任状を準備\n□ お客様へ郵送\n□ 返送物は到着物受信簿で受領管理（タスク化不要）',
      'sales', v_order_date, 'sales'
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

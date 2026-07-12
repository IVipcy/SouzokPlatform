-- ============================================================
-- 163_remove_initial_response_tasks.sql
-- 「初期対応タスク」（対応中より前に自動生成される system タスク）を廃止する。
--   これらは「着手→完了」のタスク形式ではなく、アラート（右上・マイページ）で通知する運用に変更。
--   ・検討中/検討中（契約書待ち）/受注 でのシステムタスク自動生成を停止
--   ・入金確認完了時の「お客様への御礼連絡」自動生成を停止
--   ・受託→対応中のゲート（初期対応タスク全完了）はアプリ側で撤去済み
--   ・既存の未完了の初期対応タスクは削除（完了済みは履歴として残す）
--
-- ※ 対応中以降の事務管理タスク（業務=case）や、cron生成のアラート系タスク
--   （sys_assign_manager / sys_meeting_memo / sys_weekly_report）はそのまま。
-- ============================================================

-- ── 1. ステータス変更時のシステムタスク自動生成を停止（no-op 化） ──
--   INSERT トリガー（cases_generate_system_tasks_insert）も同じ関数を使うため、
--   本差し替えで検討中/受注 直接作成時の生成も止まる。
CREATE OR REPLACE FUNCTION generate_system_tasks_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- 初期対応タスクはアラート通知に移行したため、ここでは何も生成しない。
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. 入金確認完了時の「お客様への御礼連絡」自動生成を停止（no-op 化） ──
CREATE OR REPLACE FUNCTION generate_thanks_task_on_payment_confirm()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. 既存の未完了「初期対応タスク」を削除（完了済みは履歴として残す） ──
--   対象テンプレキー: 受注/検討中で生成される初期対応・検討状況確認・契約書送付 等。
DO $$
DECLARE
  v_keys TEXT[] := ARRAY[
    'sys_review_status',
    'sys_order_sheet',
    'sys_contract_send',
    'sys_contract_docs_upload',
    'sys_case_handover',
    'sys_advance_invoice',
    'sys_advance_payment_confirm',
    'sys_original_receipt',
    'sys_thanks_contact',
    'sys_initial_tasks_create'
  ];
  v_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO v_ids
    FROM tasks
   WHERE task_kind = 'system'
     AND status <> '完了'
     AND template_key = ANY(v_keys);

  IF v_ids IS NOT NULL THEN
    DELETE FROM task_assignees WHERE task_id = ANY(v_ids);
    DELETE FROM task_dependencies WHERE from_task_id = ANY(v_ids) OR to_task_id = ANY(v_ids);
    DELETE FROM tasks WHERE id = ANY(v_ids);
  END IF;
END $$;

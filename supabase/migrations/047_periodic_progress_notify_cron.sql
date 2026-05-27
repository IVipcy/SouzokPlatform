-- ============================================================
-- 047_periodic_progress_notify_cron.sql
-- 「定期進捗連絡」システムタスクの日次自動生成
--
-- 仕様:
--   - 案件運用開始後（cases.status = '対応中' or '受注'）の案件で、
--     最新の client_communications.communicated_at から 7日以上経過した
--     ケースに「定期進捗連絡」システムタスクを自動作成する。
--   - 既に未完了の同テンプレキーのシステムタスクがある場合は重複作成しない。
--
-- 実装:
--   - SQL function (notify_periodic_progress) を定義
--   - pg_cron 拡張で 1日1回実行（朝 9:00 JST = 0:00 UTC）
--
-- 注意:
--   - pg_cron は Supabase Pro 以上で有効。Free/Basic では Edge Function 経由で
--     代替する必要がある。本マイグレーションは pg_cron 前提。
--     pg_cron が無効な環境では cron.schedule 行はエラーになるので、
--     その場合はコメントアウト or Supabase Dashboard から有効化してください。
-- ============================================================

-- 1) 定期進捗連絡を必要な案件に対して生成する SQL function
CREATE OR REPLACE FUNCTION notify_periodic_progress()
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

-- 2) pg_cron で日次実行（毎日 0:00 UTC = 9:00 JST）
-- pg_cron が利用可能な場合のみ実行
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 既存ジョブがあれば一旦削除
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'periodic_progress_notify_daily';

    -- 毎日 0:00 UTC に実行
    PERFORM cron.schedule(
      'periodic_progress_notify_daily',
      '0 0 * * *',
      $cron$ SELECT notify_periodic_progress(); $cron$
    );
  END IF;
END $$;

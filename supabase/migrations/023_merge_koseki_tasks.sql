-- ============================================================
-- Migration 023: 戸籍請求書作成 + 戸籍郵送手配 を統合
-- ------------------------------------------------------------
-- koseki_request_create と koseki_mail を1つのタスクに統合する。
-- 郵送だけでなく持込もあるため、作業完了情報は
-- ext_data.submissions[] に配列で持つ（市区町村ごと）。
-- ============================================================

-- 1. koseki_request_create テンプレートのラベル・手順を刷新
UPDATE task_templates
SET
  label = '戸籍請求書作成・提出',
  procedure_text = '【作業内容】
被相続人の出生〜死亡をたどる戸籍の請求書を作成し、各市区町村役所へ提出（郵送または持込）します。

【手順】
□ 案件詳細画面の「戸籍請求関連」セクションを開く
□ 「請求書パターン」「筆頭者」「使用目的」「請求理由」を確認する
□ 共有フォルダのテンプレートを開き、案件情報を転記する
□ 特記事項（名寄帳同時請求・財産調査等）がある場合は請求書に反映する
□ 管理担当の確認を受けてから提出準備に入る
□ 各市区町村ごとに提出方法を決定（郵送 or 持込）
□ 郵送の場合: 請求書・定額小為替・返信用封筒をセットで封入
□ 持込の場合: 平日窓口に持参（運転免許等の本人確認書類必要）
□ 提出後、このタスクの「提出先」テーブルに提出先・方法・日付を記録
□ 全市区町村への提出が完了したらステータスを「完了」にする

【ポイント】
・外字がある場合は必ず確認。手書きまたはPDF添付で対応。
・筆頭者が被相続人と異なる場合がある（婚姻前の本籍地など）。
・定額小為替の金額は市区町村ごとに異なる（通常450円/通）。
・返信用封筒には差出人住所（オーシャン）を記載すること。
・持込の場合も念のため返信用封筒を持参し、即日発行されない場合に備える。'
WHERE key = 'koseki_request_create';

-- 2. 既存タスクの統合（案件ごとに）
DO $$
DECLARE
  c RECORD;
  req_task RECORD;
  mail_task RECORD;
  merged_status TEXT;
BEGIN
  FOR c IN
    SELECT DISTINCT case_id FROM tasks WHERE template_key IN ('koseki_request_create', 'koseki_mail')
  LOOP
    SELECT * INTO req_task FROM tasks WHERE case_id = c.case_id AND template_key = 'koseki_request_create' LIMIT 1;
    SELECT * INTO mail_task FROM tasks WHERE case_id = c.case_id AND template_key = 'koseki_mail' LIMIT 1;

    -- mailがなければ何もしない
    IF mail_task.id IS NULL THEN
      -- reqのタイトルだけ更新（テンプレと合わせる）
      IF req_task.id IS NOT NULL AND req_task.title = '戸籍請求書作成' THEN
        UPDATE tasks SET title = '戸籍請求書作成・提出' WHERE id = req_task.id;
      END IF;
      CONTINUE;
    END IF;

    -- reqがなく、mailだけある場合: mailをreqに昇格
    IF req_task.id IS NULL THEN
      UPDATE tasks SET
        template_key = 'koseki_request_create',
        title = '戸籍請求書作成・提出',
        sort_order = 1
      WHERE id = mail_task.id;
      CONTINUE;
    END IF;

    -- 両方存在する場合: reqに統合
    -- ステータスはより進んでいる方を採用
    -- 優先度: 完了 > 対応中/Wチェック待ち/差戻し/保留 > 着手前/未着手
    merged_status := CASE
      WHEN mail_task.status = '完了' OR req_task.status = '完了' THEN '完了'
      WHEN mail_task.status IN ('対応中','Wチェック待ち','差戻し','保留')
        OR req_task.status IN ('対応中','Wチェック待ち','差戻し','保留') THEN '対応中'
      ELSE req_task.status
    END;

    UPDATE tasks SET
      title = '戸籍請求書作成・提出',
      status = merged_status,
      priority = CASE WHEN mail_task.priority = '急ぎ' OR req_task.priority = '急ぎ' THEN '急ぎ' ELSE req_task.priority END,
      started_by = COALESCE(req_task.started_by, mail_task.started_by),
      started_at = COALESCE(req_task.started_at, mail_task.started_at),
      due_date = COALESCE(mail_task.due_date, req_task.due_date),
      work_role = COALESCE(req_task.work_role, mail_task.work_role),
      ext_data = COALESCE(req_task.ext_data, '{}'::jsonb) || COALESCE(mail_task.ext_data, '{}'::jsonb),
      notes = CONCAT_WS(E'\n---\n', NULLIF(req_task.notes, ''), NULLIF(mail_task.notes, ''))
    WHERE id = req_task.id;

    -- 担当者の移管（重複回避）
    UPDATE task_assignees ta SET task_id = req_task.id
    WHERE task_id = mail_task.id
      AND NOT EXISTS (
        SELECT 1 FROM task_assignees ta2
        WHERE ta2.task_id = req_task.id
          AND ta2.member_id = ta.member_id
          AND ta2.role = ta.role
      );

    -- ドキュメント付け替え
    UPDATE documents SET task_id = req_task.id WHERE task_id = mail_task.id;

    -- 活動履歴付け替え
    UPDATE case_activities SET task_id = req_task.id WHERE task_id = mail_task.id;

    -- mail側の依存関係を再配線してからmailを削除
    -- mailをfromとする依存: reqをfromに付け替え（重複は削除）
    DELETE FROM task_dependencies d1
    WHERE d1.from_task_id = mail_task.id
      AND EXISTS (
        SELECT 1 FROM task_dependencies d2
        WHERE d2.from_task_id = req_task.id
          AND d2.to_task_id = d1.to_task_id
          AND COALESCE(d2.checkpoint_field, '') = COALESCE(d1.checkpoint_field, '')
      );
    UPDATE task_dependencies SET from_task_id = req_task.id WHERE from_task_id = mail_task.id;

    -- mailをtoとする依存: reqをtoに付け替え
    DELETE FROM task_dependencies d1
    WHERE d1.to_task_id = mail_task.id
      AND EXISTS (
        SELECT 1 FROM task_dependencies d2
        WHERE d2.to_task_id = req_task.id
          AND d2.from_task_id = d1.from_task_id
          AND COALESCE(d2.checkpoint_field, '') = COALESCE(d1.checkpoint_field, '')
      );
    UPDATE task_dependencies SET to_task_id = req_task.id WHERE to_task_id = mail_task.id;

    -- req → req の自己参照になったものは削除
    DELETE FROM task_dependencies WHERE from_task_id = to_task_id;

    -- 残った task_assignees を削除
    DELETE FROM task_assignees WHERE task_id = mail_task.id;

    -- mailタスク本体を削除
    DELETE FROM tasks WHERE id = mail_task.id;
  END LOOP;
END $$;

-- 3. koseki_mail テンプレートを削除
DELETE FROM task_templates WHERE key = 'koseki_mail';

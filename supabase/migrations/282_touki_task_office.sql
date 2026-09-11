-- 相続登記チームのタスク（相続登記の申請／権利書の製本／不動産登記簿の申請）に法務局を持たせる（2026-09-11）
--
-- タスク詳細の「相続登記タブを開く」で、その法務局のページに着地させるため（source_rid = 'reg:{法務局}'）。
-- 法務局が無い過去のタスクは、案件の物件の管轄法務局が1つに決まるものだけ補う（複数ある案件は手で直す）。
UPDATE tasks t SET source_rid = 'reg:' || o.office
  FROM (
    SELECT case_id, min(trim(registration_office)) AS office
      FROM real_estate_properties
     WHERE registration_office IS NOT NULL AND trim(registration_office) <> ''
     GROUP BY case_id
    HAVING count(DISTINCT trim(registration_office)) = 1
  ) o
 WHERE t.case_id = o.case_id
   AND t.task_kind = 'touki_team'
   AND (t.source_rid IS NULL OR t.source_rid LIKE 'touki-seihon:%');

-- 確認：
-- SELECT title, source_rid FROM tasks WHERE task_kind = 'touki_team' ORDER BY created_at DESC LIMIT 20;

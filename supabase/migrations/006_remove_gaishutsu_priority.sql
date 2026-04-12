-- 優先度「外出タスク」を削除し、既存データを「通常」に変更
UPDATE tasks SET priority = '通常' WHERE priority = '外出タスク';

-- CHECK制約を更新
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('通常', '急ぎ'));

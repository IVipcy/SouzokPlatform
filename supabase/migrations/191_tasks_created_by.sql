-- タスクの作成者（起票者）。マイページ等のタスク一覧に「作成者」列を出すために追加。
-- 自動生成タスクは NULL（表示は「自動生成」）。手動作成時に作成メンバーを記録する。
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES members(id);

-- PostgREST schema cache をリロード
NOTIFY pgrst, 'reload schema';

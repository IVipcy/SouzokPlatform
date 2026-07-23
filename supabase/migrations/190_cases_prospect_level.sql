-- 見込み度合い（検討中の受注確度）を cases に追加。
-- 相談結果登録（アプリ／PC版）で 高／中／低／不明 を入力・保存する。日付制御はなし。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS prospect_level TEXT;

-- PostgREST schema cache をリロード
NOTIFY pgrst, 'reload schema';

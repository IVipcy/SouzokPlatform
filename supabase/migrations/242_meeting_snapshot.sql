-- 面談シートを「面談時点の記録」として固定するためのスナップショット。
--
-- 面談シートとオーダーシートは同じ列を直接読み書きしているため、受注後にオーダーシートで
-- 住所などを直すと、面談シートの表示まで変わっていた（面談で聞いた内容が残らない）。
-- 面談結果登録を保存した時点の内容をここに丸ごと保存し、面談シートはこれを表示する。
-- 取り直したいときは面談結果登録をもう一度保存すれば上書きされる。

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS meeting_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS meeting_snapshot_at timestamptz;

COMMENT ON COLUMN cases.meeting_snapshot IS '面談結果登録を保存した時点の面談シート内容（案件・依頼者・相続人・財産・メモ）';
COMMENT ON COLUMN cases.meeting_snapshot_at IS '上記を保存した日時';

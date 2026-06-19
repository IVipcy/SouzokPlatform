-- 戸籍請求に「範囲（どこからどこまでの戸籍か）」を追加。
-- 例: 出生から死亡まで / 現在戸籍 / 婚姻まで など。戸籍請求書の備考にプリセットされる。

ALTER TABLE koseki_requests
  ADD COLUMN IF NOT EXISTS range_text TEXT;

COMMENT ON COLUMN koseki_requests.range_text IS '請求する戸籍の範囲（出生から死亡まで/現在戸籍 等）';

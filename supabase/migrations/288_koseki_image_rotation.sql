-- 288: 戸籍画像の回転（2026-09-22）
-- スキャンが横向き・上下逆で入ったときに、画面上で左右90°回して保存する。
-- 元画像は書き換えず、表示のときに回す。書き込み（annotations）は回した後の向きの座標で持つ。
ALTER TABLE koseki_images ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN koseki_images.rotation IS '表示の回転（0/90/180/270。時計回り）。migration 288';

NOTIFY pgrst, 'reload schema';

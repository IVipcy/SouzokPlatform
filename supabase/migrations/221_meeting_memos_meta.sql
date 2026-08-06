-- ============================================================
-- 221_meeting_memos_meta.sql
-- 白紙メモ（面談シートの「白紙モード」）で保存する1枚画像のメタ情報。
--   meta = { "w": 900, "h": 3420, "bands": [{ "key":"clientInfo", "label":"依頼者情報", "y0":0, "y1":380 }, ...] }
-- 帯（セクション）の境界Y座標を持たせることで、原本ビューアで
-- 「このセクションへジャンプ」ができるようにする。
-- 既存の セクション別メモ（section='clientInfo' 等）は meta = NULL のまま。
-- ============================================================

ALTER TABLE meeting_memos ADD COLUMN IF NOT EXISTS meta jsonb;

COMMENT ON COLUMN meeting_memos.meta IS '白紙メモの帯境界など（{w,h,bands:[{key,label,y0,y1}]}）。セクション別メモではNULL。';

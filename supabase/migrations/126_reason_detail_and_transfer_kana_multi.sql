-- 新規案件登録の基本情報・依頼者情報まわりの追加。
-- ① 検討中・不受託理由の「その他理由詳細」フリーテキスト（検討中/不受託 共通の1列）。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS consideration_decline_reason_detail text;
COMMENT ON COLUMN cases.consideration_decline_reason_detail IS '検討中・不受託理由のその他詳細（フリーテキスト）。';

-- ② 振込名義人カナを複数（最大3つ）持てるように。1つ目=既存 transfer_name_kana。
ALTER TABLE clients ADD COLUMN IF NOT EXISTS transfer_name_kana_2 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS transfer_name_kana_3 text;
COMMENT ON COLUMN clients.transfer_name_kana_2 IS '振込名義人カナ（2つ目）。入金CSV突合キー。';
COMMENT ON COLUMN clients.transfer_name_kana_3 IS '振込名義人カナ（3つ目）。入金CSV突合キー。';

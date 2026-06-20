-- 依頼者に「振込名義人（カナ）」を追加。銀行CSV突合のマスターキー（振込人カナ＋金額）に使う。
-- 依頼者本人が振り込む場合はふりがな（カタカナ化）を自動コピーする想定。代理振込はここに代理人カナを入れる。
ALTER TABLE clients ADD COLUMN IF NOT EXISTS transfer_name_kana text;

COMMENT ON COLUMN clients.transfer_name_kana IS '振込名義人カナ（全角カタカナ推奨）。入金CSV突合の振込人キー。';

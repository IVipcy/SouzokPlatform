-- 銀行CSV突合（入金消込の自動化）。
-- payments に「誰が突合したか（AI/人）」と「突合メモ（振込人・摘要など）」を持たせ、
-- 一覧で AI判定 / 人手確認 を区別できるようにする。
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS matched_by TEXT,   -- 'ai'（CSV自動）/ 'human'（手動・確認）
  ADD COLUMN IF NOT EXISTS match_note TEXT;   -- 振込人名・摘要など突合の根拠メモ

COMMENT ON COLUMN payments.matched_by IS '突合の判定者（ai=CSV自動突合 / human=手動・人手確認）';
COMMENT ON COLUMN payments.match_note IS 'CSV突合の根拠（振込人名・摘要・取込日 等）';

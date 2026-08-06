-- ============================================================
-- 222_heirs_lived_together.sql
-- 相続人が被相続人と同居していたか。
-- 同居している相続人は「実家の書類を回収できる人」「連絡が付きやすい人」であり、
-- 誰にどう当たるかの判断に直結するため、相関図の箱にバッジで出す。
-- ============================================================

ALTER TABLE heirs ADD COLUMN IF NOT EXISTS lived_together boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN heirs.lived_together IS '被相続人と同居していたか。相関図に「同居」バッジで表示する。';

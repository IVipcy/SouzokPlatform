-- 報連相（case_reports）の種別を2つに整理する。
--   報告・連絡 → 情報共有（返信不要。見ておいてもらう）
--   相談       → 要対応（回答が無いと作業が進まない。アラートの対象）
-- あわせて、受け取った人が「確認中」で止められるようにステータスを1つ増やす。
--   依頼中（未回答）→ 確認中 → 確認済（回答済）

ALTER TABLE case_reports DROP CONSTRAINT IF EXISTS case_reports_kind_check;
UPDATE case_reports SET kind = '情報共有' WHERE kind IN ('報告', '連絡');
UPDATE case_reports SET kind = '要対応'   WHERE kind = '相談';
ALTER TABLE case_reports ADD CONSTRAINT case_reports_kind_check CHECK (kind IN ('情報共有', '要対応'));

ALTER TABLE case_reports DROP CONSTRAINT IF EXISTS case_reports_status_check;
ALTER TABLE case_reports ADD CONSTRAINT case_reports_status_check CHECK (status IN ('依頼中', '確認中', '確認済'));

-- 誰が「確認中」にしたか・いつか（未回答のまま放置されているかの判定に使う）
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS reviewing_by  uuid REFERENCES members(id);
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS reviewing_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_case_reports_kind ON case_reports(kind);

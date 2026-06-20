-- 入金期日超過の未入金について、経理担当が受注担当へ「未入金アラート」を送った日時を記録。
-- 二重送信の防止と、一覧での「連絡済」表示に使う。
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz;

COMMENT ON COLUMN invoices.overdue_notified_at IS '未入金アラートを受注担当へ送信した日時（NULL=未送信）。';

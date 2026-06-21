-- 領収書の発行日（発行＝Excel生成した瞬間に記録）。請求一覧の領収書列で発行状況を表示する。
-- 領収書の「作成・送付」作業は確定請求の入金済で自動生成されるタスク（管理担当）で管理する。
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_issued_date date;

COMMENT ON COLUMN invoices.receipt_issued_date IS '領収書を発行（生成）した日。NULL=未発行。';

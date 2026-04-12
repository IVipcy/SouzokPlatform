-- 請求タブ用カラム追加

-- G. 請求書・精算フィールド
ALTER TABLE cases ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT '下書き';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS advance_payment BIGINT DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payment_confirmed_date DATE;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS payment_amount BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS partner_compensation BIGINT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS invoice_memo TEXT;

-- H. 立替実費明細拡張
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS related_task_id UUID REFERENCES tasks(id);

-- 確定売上表の「銀行」を手動で上書きするための列。
-- 通常は payments.bank（CSV突合で入る）で自動判定するが、未入金や手動入力で銀行不明な行は
-- ユーザーが売上表画面で銀行を選択できるようにする。決定順: payments.bank → invoice.bank_override → 未振り分け。
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_override text;
COMMENT ON COLUMN invoices.bank_override IS '売上表の銀行手動指定（みずほ/きらぼし）。null=自動判定(payments.bank に従う)';

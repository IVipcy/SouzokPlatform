-- 返金をマイナスの入金(payments)として記録する。is_refund=true の行は amount がマイナス。
-- 入金純額 = Σ amount（返金で自動的に減る）。返金方法は payment_method に格納（振込/現金書留/手渡し/現金）。
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_refund boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payments.is_refund IS '返金行（amountはマイナス）。入金純額=Σamount。理由はmatch_note。';

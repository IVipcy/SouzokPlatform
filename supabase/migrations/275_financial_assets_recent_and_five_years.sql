-- オーダーシートの預金口座：残高証明「直近日」と、取引明細「相続開始日まで5年」（2026-09-09）
--
-- balance_cert_recent … 残高証明を直近日でも取る（相続開始日と併用できる）
-- tx_five_years       … 取引明細の取得期間に「相続開始日まで5年」のチェックを入れた印。
--                        入れた時点で transaction_periods に（相続開始日−5年 〜 相続開始日）を1本入れる。日付は手で直せる

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS balance_cert_recent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tx_five_years boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN financial_assets.balance_cert_recent IS '残高証明を直近日で取る（相続開始日と併用可）';
COMMENT ON COLUMN financial_assets.tx_five_years IS '取引明細の取得期間「相続開始日まで5年」のチェック';

-- 確認：
-- SELECT institution_name, account_type, balance_cert_on_death, balance_cert_recent, tx_five_years, transaction_periods FROM financial_assets ORDER BY case_id, created_at;

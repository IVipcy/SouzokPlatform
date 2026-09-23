-- 293: 紹介元の依頼者ID／使っていない貸金庫の列を廃止（2026-09-23）
-- ・過去客経由の紹介元は、面談結果登録で既存の依頼者を選んでも ID が残らず名前だけだった。
--   cases.referral_client_id に持ち、面談情報タブからも同じ選び方にする（整合監査 24）。
-- ・financial_assets.has_safe_deposit / safe_deposit_box はどの画面でも読み書きされていない。
--   貸金庫は調査先（financial_institutions.search_targets）で扱う（整合監査 26）。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS referral_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
COMMENT ON COLUMN cases.referral_client_id IS '紹介元の依頼者（受注ルート＝過去客経由のとき。migration 293）';

ALTER TABLE financial_assets DROP COLUMN IF EXISTS has_safe_deposit;
ALTER TABLE financial_assets DROP COLUMN IF EXISTS safe_deposit_box;

NOTIFY pgrst, 'reload schema';

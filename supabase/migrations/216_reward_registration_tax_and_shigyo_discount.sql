-- ============================================================
-- 216_reward_registration_tax_and_shigyo_discount.sql
-- 請求タブ 報酬内訳の再構成。
--   ・司法の報酬表に「登録免許税又は印紙税」列を追加（登免税・印紙代のみ。司法書士請求書と同じ形）。
--   ・割引/備考を「項目ごと」→「士業（司法/行政）ごとに1つ」へ。cases に士業単位の割引額・備考を持たせる。
--   ・既存の reward_items.discount（項目単位）は士業合計に寄せて移行（テストデータ）。以後は使わない。
-- ============================================================

ALTER TABLE reward_items ADD COLUMN IF NOT EXISTS registration_tax numeric NOT NULL DEFAULT 0;  -- 登録免許税又は印紙税（司法のみ）

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS reward_discount_judicial numeric NOT NULL DEFAULT 0,       -- 司法報酬の割引（1請求1つ）
  ADD COLUMN IF NOT EXISTS reward_discount_administrative numeric NOT NULL DEFAULT 0, -- 行政報酬の割引（1請求1つ）
  ADD COLUMN IF NOT EXISTS reward_note_judicial text,                                  -- 司法報酬の備考（1請求1つ）
  ADD COLUMN IF NOT EXISTS reward_note_administrative text;                            -- 行政報酬の備考（1請求1つ）

-- 既存の項目ごと割引を士業単位の割引へ寄せる（未設定=0 の案件のみ）。
UPDATE cases c SET reward_discount_judicial =
  COALESCE((SELECT SUM(r.discount) FROM reward_items r WHERE r.case_id = c.id AND r.shigyo = '司法'), 0)
  WHERE c.reward_discount_judicial = 0;
UPDATE cases c SET reward_discount_administrative =
  COALESCE((SELECT SUM(r.discount) FROM reward_items r WHERE r.case_id = c.id AND r.shigyo = '行政'), 0)
  WHERE c.reward_discount_administrative = 0;

NOTIFY pgrst, 'reload schema';

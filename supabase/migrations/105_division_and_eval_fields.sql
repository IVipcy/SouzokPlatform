-- 遺産分割・財産目録まわりをオーダーシートに合わせて整理。
-- ・不動産の評価方法（固定資産評価額/路線価）を財産調査条件に追加
-- ・分配方針の提案（有/無）
-- ・協議書の送付・調印（依頼者から各相続人へ/OCから各相続人へ/オーシャンで調印/その他）

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS real_estate_evaluation_method TEXT,  -- 不動産の評価方法（固定資産評価額/路線価）
  ADD COLUMN IF NOT EXISTS division_proposal_presence TEXT,    -- 分配方針の提案（有/無）
  ADD COLUMN IF NOT EXISTS agreement_dispatch_method TEXT;      -- 協議書の送付・調印

COMMENT ON COLUMN cases.real_estate_evaluation_method IS '不動産の評価方法（固定資産評価額/路線価）';
COMMENT ON COLUMN cases.division_proposal_presence IS '分配方針の提案 有無';
COMMENT ON COLUMN cases.agreement_dispatch_method IS '遺産分割協議書の送付・調印方法';

-- 金融調査先：手続きタブの作り直しに伴う列の追加と、凍結確認の自動化（2026-09-09）
--
-- 1. 最初の連絡（凍結・依頼書・全店調査を同じ電話で済ませる）の連絡日と相手
-- 2. 全店調査の回答「他店口座 あり／なし」
-- 3. freeze_confirmed（凍結してよいか＝管理担当の確認）は画面から外し、
--    「凍結依頼日あり、または凍結不要」から自動で立てる。解約の着手条件・確認簿・一覧の判定は
--    freeze_confirmed を読んだままでよい（値の出どころだけ変わる）。

ALTER TABLE financial_institutions
  ADD COLUMN IF NOT EXISTS first_contact_date date,
  ADD COLUMN IF NOT EXISTS first_contact_person text,
  ADD COLUMN IF NOT EXISTS search_other_accounts text;   -- あり / なし / null（未回答）

COMMENT ON COLUMN financial_institutions.first_contact_date IS '銀行への最初の連絡日。凍結依頼日・依頼書請求日・全店調査確認日の既定値';
COMMENT ON COLUMN financial_institutions.first_contact_person IS '最初の連絡の相手（金融機関の担当者名）';
COMMENT ON COLUMN financial_institutions.search_other_accounts IS '全店調査の回答：他店口座 あり／なし';

-- freeze_confirmed を凍結の事実から導く
CREATE OR REPLACE FUNCTION derive_financial_freeze_confirmed() RETURNS trigger AS $$
BEGIN
  IF (NOT NEW.freeze_required) OR NEW.freeze_date IS NOT NULL THEN
    IF NOT COALESCE(NEW.freeze_confirmed, false) THEN
      NEW.freeze_confirmed := true;
      NEW.freeze_confirmed_at := COALESCE(NEW.freeze_confirmed_at, now());
    END IF;
  ELSE
    NEW.freeze_confirmed := false;
    NEW.freeze_confirmed_at := NULL;
    NEW.freeze_confirmed_by := NULL;
    NEW.freeze_confirmed_name := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_derive_financial_freeze_confirmed ON financial_institutions;
CREATE TRIGGER trg_derive_financial_freeze_confirmed
  BEFORE INSERT OR UPDATE OF freeze_required, freeze_date ON financial_institutions
  FOR EACH ROW EXECUTE FUNCTION derive_financial_freeze_confirmed();

-- 既存行を揃える
UPDATE financial_institutions SET freeze_confirmed = true, freeze_confirmed_at = COALESCE(freeze_confirmed_at, now())
 WHERE ((NOT freeze_required) OR freeze_date IS NOT NULL) AND NOT COALESCE(freeze_confirmed, false);
UPDATE financial_institutions SET freeze_confirmed = false, freeze_confirmed_at = NULL, freeze_confirmed_by = NULL, freeze_confirmed_name = NULL
 WHERE freeze_required AND freeze_date IS NULL AND COALESCE(freeze_confirmed, false);

-- 確認：
-- SELECT name, freeze_required, freeze_date, freeze_confirmed, first_contact_date FROM financial_institutions ORDER BY case_id, sort_order;

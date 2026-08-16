-- 残高証明の取得日を複数持てるようにする。
--
-- これまでは survey_period_type（相続開始日／任意指定）＋ survey_date（1つ）だったので、
-- 「相続開始日」と「任意の日付」を併用できず、任意の日付も1つしか持てなかった。
-- 相続開始日のチェックと、任意の日付（何本でも）を別々に持たせる。

ALTER TABLE financial_assets
  ADD COLUMN IF NOT EXISTS balance_cert_on_death boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_cert_dates    jsonb   NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN financial_assets.balance_cert_on_death IS '残高証明を相続開始日で取る';
COMMENT ON COLUMN financial_assets.balance_cert_dates IS '残高証明の取得日（任意の日付。"YYYY-MM-DD" の配列）';

-- 既存の入力を引き継ぐ（survey_period_type / survey_date は消さずに残す）
UPDATE financial_assets
   SET balance_cert_on_death = true
 WHERE survey_period_type = '相続開始日';

UPDATE financial_assets
   SET balance_cert_dates = jsonb_build_array(to_char(survey_date, 'YYYY-MM-DD'))
 WHERE survey_period_type = '任意指定'
   AND survey_date IS NOT NULL;

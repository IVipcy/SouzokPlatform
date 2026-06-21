-- 「その場で受領」なのに到着日(arrival_date)が未設定の既存データを受領済に補正する。
-- 旧ロジックは到着日を入れずに登録していたため、調査タブで「未受領」と表示されていた。
-- 到着予定日があればそれを、無ければ作成日を到着日とみなす。
UPDATE contract_documents
SET arrival_date = COALESCE(expected_arrival_date, created_at::date)
WHERE status = 'その場で受領' AND arrival_date IS NULL;

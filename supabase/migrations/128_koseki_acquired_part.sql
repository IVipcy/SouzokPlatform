-- 受注区分パート制 Phase3：戸籍請求がどのパートで取得されたかを記録する。
-- 複数パート（検認→手続き一式 等）のとき、行に「検認」「手続き一式」等のバッジを表示し、
-- 前パートで取得済みの戸籍が一目で分かる（流用判断のため）。単独パートでは未使用。
ALTER TABLE koseki_requests ADD COLUMN IF NOT EXISTS acquired_part text;

COMMENT ON COLUMN koseki_requests.acquired_part IS '取得した受注区分パート（service_parts のキー。行作成時の現在パートを自動記録）。';

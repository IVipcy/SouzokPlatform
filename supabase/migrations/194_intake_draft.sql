-- 面談シート入力途中の「下書き」案件フラグ。
-- 統合入力アプリ /intake で、面談シートに最初の入力があった時点で案件を遅延作成する。
-- それまでは案件を作らない＝「開いてやめた」で無題案件が残らない。
-- 下書き(intake_draft=true)の案件は相談案件一覧・案件一覧・各種KPIから除外する。
-- ②相談結果登録を保存した時点で intake_draft=false に昇格＝正式な相談案件になる。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake_draft boolean NOT NULL DEFAULT false;

-- 一覧/KPIは「下書きでない案件」で頻繁に絞り込むため部分インデックス。
CREATE INDEX IF NOT EXISTS idx_cases_intake_draft ON cases (intake_draft) WHERE intake_draft = true;

-- 戸籍請求の初期作成は案件につき1回だけ（2026-09-10）
--
-- 案件詳細を開くたびに「依頼者の戸籍請求が無ければ空の1行を作る」処理が走っていて、
-- 一度消した行や、名前を直した人の行が「新しい請求」として何度も生えていた。
-- 初期作成が済んだ時刻を案件に残し、以後は走らせない。中身は戸籍の取得計画（koseki_plans）から作る。

ALTER TABLE cases ADD COLUMN IF NOT EXISTS koseki_seeded_at timestamptz;
COMMENT ON COLUMN cases.koseki_seeded_at IS '戸籍請求の初期行を取得計画から作った時刻（1回だけ）';

-- 既に戸籍請求が1件でもある案件は「作成済み」にしておく（開き直しで増えないように）
UPDATE cases c SET koseki_seeded_at = now()
 WHERE koseki_seeded_at IS NULL
   AND EXISTS (SELECT 1 FROM koseki_requests k WHERE k.case_id = c.id);

-- 確認：
-- SELECT id, case_number, koseki_seeded_at FROM cases ORDER BY created_at DESC LIMIT 10;

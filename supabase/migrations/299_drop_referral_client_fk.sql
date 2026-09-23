-- 299: cases.referral_client_id の外部キーを外す（2026-09-23 緊急）
--
-- 293 で cases.referral_client_id REFERENCES clients(id) を足したところ、cases → clients の外部キーが
-- client_id と referral_client_id の2本になり、PostgREST の埋め込み `cases ... clients(*)` / `clients(name)` が
-- 「どちらの関係か分からない」（300 Could not embed because more than one relationship was found）で全部失敗するようになった。
-- 面談シートの下書き作成（select('*, clients(*)')）が落ちて、追加ボタンが何も反応しない症状の原因。
-- 画面側の埋め込みは29ファイルにあるので、書き方を全部変えるより外部キーを外す方が安全。
-- 列はそのまま（紹介元の依頼者IDを持つだけ。依頼者が消えたら値が残るが、表示側は見つからなければ空で出す）。

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_referral_client_id_fkey;
COMMENT ON COLUMN cases.referral_client_id IS '紹介元の依頼者ID（受注ルート＝過去客経由のとき）。外部キーは張らない（clients への2本目のFKは PostgREST の埋め込みを壊す。migration 299）';

NOTIFY pgrst, 'reload schema';

-- 確認（1行も出なければOK）：
--   select conname from pg_constraint where conrelid = 'cases'::regclass and confrelid = 'clients'::regclass and conname <> 'cases_client_id_fkey';

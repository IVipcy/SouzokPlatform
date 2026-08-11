-- ============================================================
-- 239_client_trait_free.sql
-- 依頼者特徴の CHECK を外す。
--
-- 039 で入れた CHECK は ('smile','neutral','angry') の3値のままだったが、
-- 画面はその後「問題ない / 神経質・細かい / 短気 …」の複数選択に変わり、
-- カンマ区切りの文字列で保存するようになっていた。そのため選ぶと保存に失敗していた。
--
-- 選択肢は運用しながら増える（constants.ts の CLIENT_TRAIT_OPTIONS）ので、
-- DB 側では値を縛らない。旧3値のデータは意味が対応しないので空に戻す。
-- ============================================================

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_client_trait_check;

UPDATE cases SET client_trait = NULL WHERE client_trait IN ('smile', 'neutral', 'angry');

NOTIFY pgrst, 'reload schema';

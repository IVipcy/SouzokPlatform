-- 契約手続き書類の区分(category)を、migration203で強制した3値
--   ('お客様預かり書類','契約書類','その他')
-- から、元の意味を持つ6値 + お客様預かり書類 の合計7値に拡張し直す。
--
-- 目的:
--   migration203は「納品対象マーカー」として区分を使ったが、
--   RegistrationTab / AssetsTab / DeceasedTab はそれ以前から
--   category='登記'/'不動産'/'金融'/'戸籍' で「契約時にお客様から受領した書類」
--   を各タブに横断表示する用途に区分を使っていた。3値化でこの機能が沈黙。
--
--   → 区分は元の意味 (書類の性質: 契約/戸籍/金融/不動産/登記/その他) に戻す。
--     加えて「原本を預かってて 案件完了時に返却するもの」を表す
--     新値 'お客様預かり書類' を追加。納品タブは この値だけで候補判定する。
--
-- 既存データ (migration203で 戸籍/財産/登記/その他 が全部お客様預かり書類に潰されている) は
-- 元の値が失われているため 復元不能。ユーザーが必要に応じて手で戻す。
-- (契約書類 → 契約 だけは 1対1 なので自動で戻せる)

-- 1) 既存CHECK制約を除去
ALTER TABLE contract_documents
  DROP CONSTRAINT IF EXISTS contract_documents_category_check;

-- 2) 契約書類 → 契約 (元々1対1で潰されたので機械的に戻す)
UPDATE contract_documents SET category = '契約'
 WHERE category = '契約書類';

-- 3) 新CHECK制約: 6値 + お客様預かり書類
ALTER TABLE contract_documents
  ADD CONSTRAINT contract_documents_category_check
  CHECK (category IN ('契約','戸籍','金融','不動産','登記','その他','お客様預かり書類'));

-- index は migration203 の idx_contract_documents_category / idx_contract_documents_delivery_target
-- をそのまま維持 (再作成不要)。

-- 納品タブの下準備。
--   契約手続き書類(contract_documents)の「区分(category)」を
--   「お客様預かり書類 / 契約書類 / その他」の3値に再定義。
--   既存値(戸籍/財産/登記/契約/その他 など)は自動マッピングでどれかに寄せる。
--
--   併せて、納品対象フラグ delivery_target を contract_documents に追加。
--   デフォルト false（明示的に「対象」に切り替えないと納品タブに載せない）。
--   ただし category='お客様預かり書類' はデフォルト true にする（原本返却が基本のため）。

-- 1) contract_documents に delivery_target を追加（既定 false）
ALTER TABLE contract_documents
  ADD COLUMN IF NOT EXISTS delivery_target boolean NOT NULL DEFAULT false;

-- 2) 既存 category を新3値へ自動マッピング
--    契約 → 契約書類 / 戸籍・財産・登記・その他 → 一律「お客様預かり書類」
--    （調査で使う原本類は納品対象になるためお客様預かり側へ寄せる。実運用でユーザー側で振り分け可）
UPDATE contract_documents SET category = 'お客様預かり書類'
 WHERE category IN ('戸籍','財産','登記','その他') OR category IS NULL;
UPDATE contract_documents SET category = '契約書類'
 WHERE category = '契約';

-- 3) 契約書類/その他 以外を納品対象に自動セット（お客様預かり書類の原本は原則納品）
UPDATE contract_documents SET delivery_target = true
 WHERE category = 'お客様預かり書類' AND delivery_target = false;

-- 4) 新しいCHECK制約に置き換え（旧値のフリーテキストを許容していたため、まず既存制約を除去）
ALTER TABLE contract_documents
  DROP CONSTRAINT IF EXISTS contract_documents_category_check;
ALTER TABLE contract_documents
  ADD CONSTRAINT contract_documents_category_check
  CHECK (category IN ('お客様預かり書類','契約書類','その他'));

CREATE INDEX IF NOT EXISTS idx_contract_documents_category ON contract_documents(category);
CREATE INDEX IF NOT EXISTS idx_contract_documents_delivery_target ON contract_documents(delivery_target);

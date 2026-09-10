-- 住所を2行に分ける（2026-09-10）
--
-- 住所1（既存の address）＝都道府県〜番地まで、住所2（新設 address2）＝建物名・部屋番号。
-- 書類（戸籍請求書・委任状・契約書・封筒・原本受領証・固定資産の請求書・事件簿）は
-- 住所2があるとき2行で印字する。文字を小さくして1行に押し込まない。
-- 既存の値は住所1にそのまま残る（分けるのは手作業）。

ALTER TABLE clients ADD COLUMN IF NOT EXISTS address2 text;
ALTER TABLE heirs   ADD COLUMN IF NOT EXISTS address2 text;
ALTER TABLE cases   ADD COLUMN IF NOT EXISTS deceased_address2 text;

COMMENT ON COLUMN clients.address2 IS '住所2（建物名・部屋番号）';
COMMENT ON COLUMN heirs.address2 IS '住所2（建物名・部屋番号）';
COMMENT ON COLUMN cases.deceased_address2 IS '被相続人の最後の住所2（建物名・部屋番号）';

-- 確認：
-- SELECT name, address, address2 FROM clients WHERE address2 IS NOT NULL LIMIT 5;

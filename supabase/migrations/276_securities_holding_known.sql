-- オーダーシートの「証券・信託」区画：保有先が分かるかの3択（2026-09-09）
--
-- cases.securities_holding_known … 分かる / 分からない / 持っていない / null（未回答）
--   「分からない」→ 実務の証券・信託タブに「ほふり照会」を立てる（financial_institutions kind=ほふり を作る）
--   「分かる」「持っていない」→ ほふり照会は不要（既にあれば jasdec_company_known='調査不要'）
--
-- あわせて、証券・信託の口座行に入っていた「銘柄名」は列をやめて備考へ寄せる（列は残す。表示だけやめる）。

ALTER TABLE cases ADD COLUMN IF NOT EXISTS securities_holding_known text;
COMMENT ON COLUMN cases.securities_holding_known IS 'オーダーシート：株の保有先が分かるか（分かる／分からない／持っていない）';

UPDATE financial_assets
   SET notes = concat_ws('　', NULLIF(notes, ''), '銘柄：' || stock_name)
 WHERE asset_type IN ('証券', '信託銀行')
   AND COALESCE(stock_name, '') <> ''
   AND COALESCE(notes, '') NOT LIKE '%銘柄：' || stock_name || '%';

-- 確認：
-- SELECT id, securities_holding_known FROM cases WHERE securities_holding_known IS NOT NULL;
-- SELECT institution_name, stock_name, notes FROM financial_assets WHERE asset_type IN ('証券','信託銀行');

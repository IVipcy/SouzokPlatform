-- 272: 印鑑登録証明書の「原本所在」は選ばせず、請求の事実から出す
--
-- 271 で cases に「原本所在」のプルダウンを置いたが、これは原本の動き（銀行に出して戻る）を
-- 人が手で追いかけて選び直す欄だった。依頼者が印鑑証明を複数通取って別々の銀行へ同時に出す
-- ことも普通にあり、1つのプルダウンでは書けない。
--
-- 原本が動くのは請求のときだけなので、請求に「原本を同封した」「返却日」を持たせる。
-- 所在＝「原本を出していて、まだ返却日が無い請求」の銀行名（src/lib/financialWorkflow.ts が出す）。
--
-- 金融財産調査で使う印鑑登録証明書は依頼者（請求する相続人）1人のもの。被相続人の印鑑証明は
-- 死亡で登録が抹消されるため存在しない。相続人全員分が要るのは解約・払戻し（別の話）。

ALTER TABLE cases DROP COLUMN IF EXISTS seal_cert_original_location;
-- 受領した通数。手元に何通残っているかは「通数 − 出したまま戻っていない数」で出す
ALTER TABLE cases ADD COLUMN IF NOT EXISTS seal_cert_copies integer;
COMMENT ON COLUMN cases.seal_cert_copies IS '依頼者の印鑑登録証明書の受領通数';

ALTER TABLE financial_requests
  ADD COLUMN IF NOT EXISTS seal_original_sent boolean NOT NULL DEFAULT false,   -- 依頼者の印鑑登録証明書の原本を同封（来店なら持参）
  ADD COLUMN IF NOT EXISTS seal_original_returned_date date;                    -- 原本が戻ってきた日
COMMENT ON COLUMN financial_requests.seal_original_sent IS '依頼者の印鑑登録証明書の原本をこの請求で出した';
COMMENT ON COLUMN financial_requests.seal_original_returned_date IS '原本の返却日。空なら金融機関に出したまま';

NOTIFY pgrst, 'reload schema';

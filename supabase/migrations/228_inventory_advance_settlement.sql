-- ============================================================
-- 228_inventory_advance_settlement.sql
-- 相続債務・その他費用を「相続人間で相殺する」実務に対応する。
--
-- 何が足りなかったか：
--   目録に債務・費用を載せて負担を割り付けると、取得合計はマイナス計上されるので
--   「相殺後の取り分」は出ていた。しかし葬儀費用のように誰かが既に立て替えている場合、
--   立て替えた人へ戻す分が計算に入らず、実際に現金をいくら動かすかが出せなかった。
--
--   例）預金3,000万・葬儀費用200万（長男が立替）・相続人 長男/二男 各1/2
--       取り分は各1,400万。だが実際は 預金を長男1,600万・二男1,400万 に分けるか、
--       預金を1,500万ずつ分けて 二男→長男に100万 渡す必要がある。
--       この「100万」がシステムから出てこなかった。
--
-- 対応：
--   asset_inventory.payer_heir_id … その債務・費用を既に払った相続人（立替者）。
--     取り込み元の case_other_assets.payer_heir_id をそのまま引き継ぐ。
--     各人の 立替額 − 負担額 が過不足になり、その差し引きが相続人間の精算になる。
--   division_details.entry_kind … 協議書に載る行の種類。
--     財産（取得する）／債務（負担する）／精算（代償金・精算金を支払う）で書き方が変わるため。
-- ============================================================

ALTER TABLE asset_inventory ADD COLUMN IF NOT EXISTS payer_heir_id uuid REFERENCES heirs(id) ON DELETE SET NULL;
ALTER TABLE asset_inventory ADD COLUMN IF NOT EXISTS payer_name text;

COMMENT ON COLUMN asset_inventory.payer_heir_id IS '立替者（この債務・費用を既に払った相続人）。相続人間の精算計算に使う。';
COMMENT ON COLUMN asset_inventory.payer_name    IS '立替者の氏名（相続人一覧に無い人のフリー入力。計算対象外の参考表示）。';

ALTER TABLE division_details ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT '財産';
COMMENT ON COLUMN division_details.entry_kind IS '協議書の行種別：財産（取得する）／債務（負担する）／精算（代償金・精算金を支払う）。';

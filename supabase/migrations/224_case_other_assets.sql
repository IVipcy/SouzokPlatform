-- ============================================================
-- 224_case_other_assets.sql
-- 「その他財産 / 相続債務 / その他費用」を1テーブルで持つ。
--
-- 3つとも入力の形が同じ（項目・金額・根拠資料・備考）なので kind で分ける。
-- financial_assets に相乗りさせなかった理由：
--   ・解約手続や調査禁止期間など、無関係な列を大量に引きずる
--   ・相続債務／その他費用はマイナス計上。金融資産と同じ集計に混ぜると事故る
--
-- 符号について：
--   amount は常に正の値で保存する。マイナスかどうかは kind で決まる
--   （相続債務・その他費用がマイナス）。手入力でマイナスを付けさせると
--   入れ忘れ・二重マイナスが起きるため。
--
-- kind ごとの意味：
--   その他財産 … ゴルフ会員権・自動車など。プラス財産
--   相続債務   … 被相続人が生前に負っていた借金。相続の対象＝相続放棄の判断材料
--   その他費用 … 葬儀費用・介護施設費用など死後に発生したもの。
--                相続人が立て替えた分を遺産分割で精算する。
--                ※当社が代理で支払ったものはここではなく、遺産承継の精算書
--                  「代理支払（到着物から）」で扱う（二重計上を防ぐ）。
-- ============================================================

CREATE TABLE IF NOT EXISTS case_other_assets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('その他財産', '相続債務', 'その他費用')),
  label                text,                    -- 項目
  amount               numeric,                 -- 金額（常に正）
  -- 立替者（その他費用）。相続人一覧から選ぶのが基本だが、面談時点では相続人が
  -- 未登録のこともあるためフリー入力も許す。あとで heir_id に紐づけ直せる。
  payer_heir_id        uuid REFERENCES heirs(id) ON DELETE SET NULL,
  payer_name           text,
  settle_between_heirs boolean NOT NULL DEFAULT false,  -- 遺産分割時に相続人間で精算する
  has_evidence         boolean NOT NULL DEFAULT false,  -- 根拠資料あり
  note                 text,                    -- 備考・根拠資料
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_other_assets_case ON case_other_assets(case_id, kind, sort_order);

ALTER TABLE case_other_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_other_assets_all ON case_other_assets;
CREATE POLICY case_other_assets_all ON case_other_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE  case_other_assets IS 'その他財産／相続債務／その他費用。amount は常に正で、マイナス扱いかは kind で決まる。';
COMMENT ON COLUMN case_other_assets.payer_name IS '立替者の氏名（相続人未登録時のフリー入力。payer_heir_id が入っていればそちらが優先）';

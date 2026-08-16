-- 戸籍まわりを2階層にする。
--   オーダーシート … 「誰の、どんな戸籍が要りそうか」の見立て（1行＝1人）＝ koseki_plans
--   実務タブ       … 「依頼書1枚ぶんの請求条件」（1行＝依頼書1枚）＝ koseki_requests に条件列を追加
--
-- 業務ルール：戸籍と戸籍の附票は1枚で請求できる（同じ行）。戸籍と住民票は1枚で請求できない（行を分ける）。
-- 同じ役所・同じ人でも行が分かれるので、受信待ちの表示には種別まで出す必要がある。

-- === 実務タブ：依頼書1枚ぶんの請求条件 ===
ALTER TABLE koseki_requests
  ADD COLUMN IF NOT EXISTS request_firm   text,   -- 請求法人（行政/司法/いきいき）
  ADD COLUMN IF NOT EXISTS doc_form       text,   -- 請求の種別②（謄本/抄本。複数は「・」区切り。戸籍請求のときだけ）
  ADD COLUMN IF NOT EXISTS head_person    text,   -- 筆頭者／世帯主
  ADD COLUMN IF NOT EXISTS juminhyo_items text,   -- 住民票記載の基礎証明外事項（複数は「・」区切り）
  ADD COLUMN IF NOT EXISTS submit_to      text;   -- 提出先（既定は「依頼者に渡す」）

COMMENT ON COLUMN koseki_requests.doc_types IS '請求の種別①（戸籍/除籍/原戸籍/住民票/除票/戸籍の附票）。複数は「・」区切り';

-- === オーダーシート：人ごとの取得計画 ===
CREATE TABLE IF NOT EXISTS koseki_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  person_name  text NOT NULL,                 -- 対象者（被相続人・相続人。koseki_requests.target_person と同じ名前で対応づける）
  range_text   text,                          -- 戸籍の取得範囲（出生～死亡すべて/死亡のみ/現在戸籍/自由入力）
  address_doc  text,                          -- 住所関係書類の取得内容（住民票/戸籍の附票/自由入力）
  note         text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, person_name)
);
CREATE INDEX IF NOT EXISTS idx_koseki_plans_case_id ON koseki_plans(case_id);

ALTER TABLE koseki_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS koseki_plans_all ON koseki_plans;
CREATE POLICY koseki_plans_all ON koseki_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

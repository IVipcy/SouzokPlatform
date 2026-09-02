-- 271: 金融財産調査を「調査先／請求／口座／銘柄」の単位に分ける
--
-- いままで financial_assets（1行＝1口座）に、口座の話でないものが乗っていた。
--   ・金融機関に1回やること … 凍結、凍結確認（確認簿）、調査禁止指定
--   ・請求のこと           … 請求日、到着日、到着予定日、残高証明の取得日、取引履歴の期間
-- そのため同じ機関の口座数だけ同じ値を入れ直すことになり、
-- 「残高証明を7/14時点と8/8時点の2つで取る」が1行に入らなかった。
--
-- 本番前なので旧列は残さず落とす（並存させない）。テストデータの金融部分は作り直し。
--
-- 単位の切り方（docs: 金融財産調査システム_設計思想 2.1）
--   financial_institutions          調査先（預金／証券／株主名簿管理人／ほふり）。機関に1回のこと
--   financial_requests              請求＝金融機関へ一度に提出するまとまり
--   financial_request_items         請求明細＝書類×指定日/期間。到着・不備はここ
--   financial_request_item_accounts 明細×口座（どの口座ぶんか）＋証明書記載の金額
--   financial_request_item_holdings 明細×銘柄（株主名簿管理人への請求）
--   financial_assets                口座。支店・種別・口座番号・残高・根拠資料・解約
--   securities_holdings             銘柄。株主名簿管理人の特定まで持つ
--
-- ステータス・次の対応・対応待ちは列に持たない。入力値から src/lib/financialWorkflow.ts が出す。
-- タスクは自動生成しない（対応待ちを表示し、「担当する」を押した人だけ tasks に入る）。

-- ────────────────────────────────────────────────────────────
-- 1) 調査先
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_institutions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  -- 預金 / 証券 / 株主名簿管理人 / ほふり。業務が違うので画面も判定も分ける（共通化しすぎない）
  kind             text NOT NULL DEFAULT '預金',
  name             text NOT NULL DEFAULT '',
  branch_name      text,
  institution_code text,
  -- 自社 / 依頼者。依頼者取得の機関は請求タスクを出さない
  acquirer         text NOT NULL DEFAULT '自社',
  sort_order       integer NOT NULL DEFAULT 0,
  notes            text,

  -- 01 口座凍結（預金）／死亡連絡（証券）。株主名簿管理人は持たない
  freeze_required  boolean NOT NULL DEFAULT true,
  freeze_date      date,
  -- 凍結してよいか（確認簿の依頼→確認）。口座から引き上げた
  freeze_confirmed             boolean NOT NULL DEFAULT false,
  freeze_confirmed_by          uuid REFERENCES members(id) ON DELETE SET NULL,
  freeze_confirmed_at          timestamptz,
  freeze_confirmed_name        text,
  freeze_confirm_requested_at  timestamptz,
  freeze_confirm_requested_by  uuid REFERENCES members(id) ON DELETE SET NULL,

  -- 02 依頼書の手配
  form_required     boolean NOT NULL DEFAULT true,
  form_source       text NOT NULL DEFAULT '未確認',   -- 未確認 / 金融機関へ請求 / 社内在庫
  form_request_date date,
  form_arrival_date date,
  form_stock_date   date,

  -- 03 全店調査（預金・証券。証券は既定で不要）
  search_required            boolean NOT NULL DEFAULT false,
  search_method              text NOT NULL DEFAULT '未確認',  -- 未確認 / 電話回答 / 要原本確認 / 要請求
  search_submission_method   text NOT NULL DEFAULT '未確認',  -- 未確認 / 郵送 / 来店
  search_responder           text,          -- 電話回答のときの金融機関担当者名
  search_request_date        date,          -- 原本発送日／調査請求書発送日／原本提出日／調査請求日
  search_answer_date         date,          -- 回答日（電話回答のときは確認日）
  search_targets             text[] NOT NULL DEFAULT '{}',   -- 預金 / 投資信託 / 貸金庫 / 共済
  search_all_accounts_registered boolean NOT NULL DEFAULT false,

  -- 04 証明書発行依頼の方法。郵送か来店かで以降の工程が分かれる
  handling_method      text NOT NULL DEFAULT '未確認',  -- 未確認 / 郵送 / 来店
  method_confirm_date  date,
  visit_date           date,                            -- 来店日（予約済みの訪問日）
  visit_prep_done_at   timestamptz,                     -- 来店準備の完了（唯一の手動完了）
  visit_prep_done_by   uuid REFERENCES members(id) ON DELETE SET NULL,

  -- 調査禁止指定（お客様の「まだ調べないで」）。口座から引き上げた
  survey_prohibited_designation text,       -- 指定なし / 指定あり
  survey_prohibited_method      text,       -- 期間指定 / お客さんからの連絡待ち
  survey_prohibited_start       date,
  survey_prohibited_end         date,
  survey_prohibited_reason      text,
  prohibition_released_at       timestamptz,

  -- ほふり（kind = 'ほふり' のときだけ）
  jasdec_company_known       text,          -- 判明済み / 一部判明 / 不明 / 調査不要
  jasdec_request_date        date,
  jasdec_arrival_date        date,
  jasdec_searched_addresses  text,
  jasdec_result_institutions text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_institutions_case ON financial_institutions(case_id, sort_order);
ALTER TABLE financial_institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_institutions_all ON financial_institutions;
CREATE POLICY financial_institutions_all ON financial_institutions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS financial_institutions_updated_at ON financial_institutions;
CREATE TRIGGER financial_institutions_updated_at BEFORE UPDATE ON financial_institutions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2) 請求と明細
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES financial_institutions(id) ON DELETE CASCADE,
  -- 空＝請求準備中（来店の前に内容だけ作っておく）。入った瞬間に「請求中」
  request_date   date,
  notes          text,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_requests_inst ON financial_requests(institution_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_financial_requests_case ON financial_requests(case_id);
ALTER TABLE financial_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_requests_all ON financial_requests;
CREATE POLICY financial_requests_all ON financial_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS financial_requests_updated_at ON financial_requests;
CREATE TRIGGER financial_requests_updated_at BEFORE UPDATE ON financial_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS financial_request_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  request_id     uuid NOT NULL REFERENCES financial_requests(id) ON DELETE CASCADE,
  -- 残高証明 / 取引履歴 / 顧客勘定元帳 / 年間取引報告書 /
  -- 所有株式数証明書 / 未受領配当金明細書 / 配当金支払明細書 / 株式異動証明書
  doc_type       text NOT NULL,
  -- 残高証明：指定日。直近日（金融機関が出せる直近時点）は balance_recent=true で日付なし
  balance_date   date,
  balance_recent boolean NOT NULL DEFAULT false,
  -- 取引履歴・顧客勘定元帳：期間
  history_start  date,
  history_end    date,
  -- 到着。到着物受信簿のW-Checkで入る（手でも直せる）
  arrival_date   date,
  -- 不備。正常 / 要確認 / 再請求中
  irregular_status    text NOT NULL DEFAULT '正常',
  irregular_type      text,      -- 書類・内容不足 / 対象口座・指定日の相違 / 記載内容が不明 / その他
  irregular_note      text,      -- 確認内容・次の対応／再請求理由
  follow_up_deadline  date,      -- 要確認の確認期限
  re_request_date     date,
  re_request_deadline date,      -- 再到着予定日
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_request_items_req ON financial_request_items(request_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_financial_request_items_case ON financial_request_items(case_id);
ALTER TABLE financial_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_request_items_all ON financial_request_items;
CREATE POLICY financial_request_items_all ON financial_request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS financial_request_items_updated_at ON financial_request_items;
CREATE TRIGGER financial_request_items_updated_at BEFORE UPDATE ON financial_request_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 明細×口座。証明書に載っていた金額もここ（同じ口座でも指定日が違えば金額が違う）
CREATE TABLE IF NOT EXISTS financial_request_item_accounts (
  item_id   uuid NOT NULL REFERENCES financial_request_items(id) ON DELETE CASCADE,
  asset_id  uuid NOT NULL REFERENCES financial_assets(id) ON DELETE CASCADE,
  amount    numeric,
  PRIMARY KEY (item_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_fria_asset ON financial_request_item_accounts(asset_id);
ALTER TABLE financial_request_item_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_request_item_accounts_all ON financial_request_item_accounts;
CREATE POLICY financial_request_item_accounts_all ON financial_request_item_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 明細×銘柄（株主名簿管理人への請求の対象銘柄）
CREATE TABLE IF NOT EXISTS financial_request_item_holdings (
  item_id     uuid NOT NULL REFERENCES financial_request_items(id) ON DELETE CASCADE,
  holding_id  uuid NOT NULL REFERENCES securities_holdings(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, holding_id)
);
ALTER TABLE financial_request_item_holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_request_item_holdings_all ON financial_request_item_holdings;
CREATE POLICY financial_request_item_holdings_all ON financial_request_item_holdings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3) 口座（financial_assets）を口座の話だけにする
-- ────────────────────────────────────────────────────────────
ALTER TABLE financial_assets ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES financial_institutions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_financial_assets_inst ON financial_assets(institution_id);

-- 機関に1回のこと → financial_institutions へ
ALTER TABLE financial_assets
  DROP COLUMN IF EXISTS freeze_confirmed,
  DROP COLUMN IF EXISTS freeze_confirmed_by,
  DROP COLUMN IF EXISTS freeze_confirmed_at,
  DROP COLUMN IF EXISTS freeze_confirmed_name,
  DROP COLUMN IF EXISTS freeze_confirm_requested_at,
  DROP COLUMN IF EXISTS freeze_confirm_requested_by,
  DROP COLUMN IF EXISTS survey_prohibited_start,
  DROP COLUMN IF EXISTS survey_prohibited_end,
  DROP COLUMN IF EXISTS survey_prohibited_reason,
  DROP COLUMN IF EXISTS survey_prohibited_designation,
  DROP COLUMN IF EXISTS survey_prohibited_method,
  DROP COLUMN IF EXISTS prohibition_released_at;

-- 請求のこと → financial_requests / financial_request_items へ
ALTER TABLE financial_assets
  DROP COLUMN IF EXISTS request_date,
  DROP COLUMN IF EXISTS arrival_date,
  DROP COLUMN IF EXISTS expected_arrival_date,
  DROP COLUMN IF EXISTS balance_cert_date,
  DROP COLUMN IF EXISTS transaction_history_period;

-- institution_name / branch_name は残す。41ファイルが読んでいて、表示・並び・source_rid(fin:{機関名}) の鍵になる。
-- ただし正は financial_institutions.name。トリガーで写す（読み取り専用の複製）。
CREATE OR REPLACE FUNCTION sync_financial_asset_institution_name() RETURNS trigger AS $$
BEGIN
  IF NEW.institution_id IS NOT NULL THEN
    SELECT name INTO NEW.institution_name FROM financial_institutions WHERE id = NEW.institution_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS financial_assets_sync_inst_name ON financial_assets;
CREATE TRIGGER financial_assets_sync_inst_name BEFORE INSERT OR UPDATE OF institution_id ON financial_assets
  FOR EACH ROW EXECUTE FUNCTION sync_financial_asset_institution_name();

CREATE OR REPLACE FUNCTION cascade_financial_institution_name() RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE financial_assets SET institution_name = NEW.name WHERE institution_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS financial_institutions_cascade_name ON financial_institutions;
CREATE TRIGGER financial_institutions_cascade_name AFTER UPDATE OF name ON financial_institutions
  FOR EACH ROW EXECUTE FUNCTION cascade_financial_institution_name();

-- ────────────────────────────────────────────────────────────
-- 4) 銘柄（securities_holdings）に株主名簿管理人まで持たせる
-- ────────────────────────────────────────────────────────────
ALTER TABLE securities_holdings
  ADD COLUMN IF NOT EXISTS institution_id  uuid REFERENCES financial_institutions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS code            text,     -- 銘柄コード
  ADD COLUMN IF NOT EXISTS kind            text,     -- 国内株式 / ETF・REIT / 投資信託 / 債券 / 外国証券 / その他
  ADD COLUMN IF NOT EXISTS administrator   text,     -- 株主名簿管理人（正規化後の名称）
  ADD COLUMN IF NOT EXISTS admin_status    text NOT NULL DEFAULT '未特定',   -- 未特定 / 特定済 / 対象外
  ADD COLUMN IF NOT EXISTS request_need    text NOT NULL DEFAULT '未判断';   -- 未判断 / 請求要 / 請求不要
-- 証券会社は口座を持たない（銘柄で管理）ので、口座への紐づけは任意にする
ALTER TABLE securities_holdings ALTER COLUMN financial_asset_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_securities_holdings_inst ON securities_holdings(institution_id, sort_order);

-- ────────────────────────────────────────────────────────────
-- 5) 印鑑登録証明書は案件に1つ（原本は物理的に1通。所在で持つ）
-- ────────────────────────────────────────────────────────────
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS seal_cert_oldest_issue_date date,
  ADD COLUMN IF NOT EXISTS seal_cert_validity_months   integer,   -- 3 / 6 / NULL=個別指定
  ADD COLUMN IF NOT EXISTS seal_cert_custom_expiry     date,
  ADD COLUMN IF NOT EXISTS seal_cert_original_location text;      -- 事務所保管 / ◯◯へ提出中 / 返却済
COMMENT ON COLUMN cases.seal_cert_oldest_issue_date IS '印鑑登録証明書の最古の発行日。使用期限の起算';
COMMENT ON COLUMN cases.seal_cert_original_location IS '印鑑登録証明書の原本がいまどこにあるか';

-- ────────────────────────────────────────────────────────────
-- 6) オーダーシートで足した口座から、調査先を自動で作る
-- ────────────────────────────────────────────────────────────
-- 面談・オーダーシートは「金融機関名を打って口座を足す」だけの入力を続ける（触らない）。
-- institution_id が空で金融機関名だけある口座が入ったら、同じ案件・同じ種別・同じ名前の
-- 調査先を探し、無ければ作って紐づける。実務タブを開いたときに調査先として並ぶ。
CREATE OR REPLACE FUNCTION attach_financial_asset_institution() RETURNS trigger AS $$
DECLARE
  v_kind text;
  v_name text;
  v_id   uuid;
BEGIN
  IF NEW.institution_id IS NOT NULL THEN RETURN NEW; END IF;
  v_name := btrim(coalesce(NEW.institution_name, ''));
  IF v_name = '' THEN RETURN NEW; END IF;
  v_kind := CASE NEW.asset_type WHEN '証券' THEN '証券' WHEN '信託銀行' THEN '株主名簿管理人' ELSE '預金' END;
  SELECT id INTO v_id FROM financial_institutions WHERE case_id = NEW.case_id AND kind = v_kind AND btrim(name) = v_name LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO financial_institutions (case_id, kind, name, branch_name, acquirer, search_required, sort_order)
    VALUES (NEW.case_id, v_kind, v_name, NEW.branch_name, coalesce(NEW.acquirer, '自社'), v_kind = '預金',
            (SELECT coalesce(max(sort_order), -1) + 1 FROM financial_institutions WHERE case_id = NEW.case_id))
    RETURNING id INTO v_id;
  END IF;
  NEW.institution_id := v_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS financial_assets_attach_institution ON financial_assets;
CREATE TRIGGER financial_assets_attach_institution BEFORE INSERT OR UPDATE OF institution_name ON financial_assets
  FOR EACH ROW EXECUTE FUNCTION attach_financial_asset_institution();

NOTIFY pgrst, 'reload schema';

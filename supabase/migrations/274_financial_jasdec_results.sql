-- 証券・信託タブ：ほふり（証券保管振替機構）の開示結果を行で持つ（2026-09-09）
--
-- どこの証券会社に株があるか分からない案件は、まずほふりに開示請求する。
-- 開示結果には証券会社の取引口座と、信託銀行（株主名簿管理人）の特別口座が一緒に載る。
-- その1行1機関をここに入れ、「調査先に追加」で financial_institutions（証券／株主名簿管理人）を作って紐づける。
-- 全行に institution_id が付いたら、ほふり照会は完了（financialWorkflow.evaluateInstitution）。

CREATE TABLE IF NOT EXISTS financial_jasdec_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  jasdec_id       uuid NOT NULL REFERENCES financial_institutions(id) ON DELETE CASCADE,  -- kind='ほふり' の調査先
  name            text NOT NULL DEFAULT '',          -- 機関名（例：野村證券 横浜支店／三井住友信託銀行）
  kind            text NOT NULL DEFAULT '証券会社',   -- 証券会社 / 株主名簿管理人
  account_kind    text,                              -- 取引口座 / 特別口座 / その他
  institution_id  uuid REFERENCES financial_institutions(id) ON DELETE SET NULL,  -- 調査先に追加したらここに入る
  note            text,
  sort_order      int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_jasdec_results_case ON financial_jasdec_results(case_id, jasdec_id, sort_order);
ALTER TABLE financial_jasdec_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_jasdec_results_all ON financial_jasdec_results;
CREATE POLICY financial_jasdec_results_all ON financial_jasdec_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE financial_jasdec_results IS 'ほふり開示結果の1行1機関。調査先に追加すると institution_id が入る';

-- 確認：
-- SELECT name, kind, account_kind, institution_id IS NOT NULL AS added FROM financial_jasdec_results ORDER BY case_id, sort_order;

-- ============================================================
-- 088_case_clients_address.sql
-- 依頼者一覧(case_clients)に住所・郵便番号を追加。
--   顧客郵送先で「誰に送るか」を依頼者から選び、その人の住所を郵送先住所に
--   自動セットできるようにするため（同行者宛にも送れる）。
--   従来 cases.mailing_destination は '依頼者住所'/'その他' の enum 文字列だったが、
--   依頼者(case_clients)の id を持たせる方式に変更する。旧 '依頼者住所' は
--   メイン依頼者の case_client.id へ変換する。
-- ============================================================

ALTER TABLE case_clients ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE case_clients ADD COLUMN IF NOT EXISTS address TEXT;

-- メイン依頼者の住所/郵便番号を clients から case_clients(priority=main) へバックフィル（未設定のみ）
UPDATE case_clients cc
   SET address     = COALESCE(NULLIF(cc.address, ''), c.address),
       postal_code = COALESCE(NULLIF(cc.postal_code, ''), c.postal_code)
  FROM cases ca
  JOIN clients c ON c.id = ca.client_id
 WHERE cc.case_id = ca.id AND cc.priority = 'main';

-- 旧 mailing_destination='依頼者住所' を、その案件のメイン依頼者(case_clients)の id に変換
UPDATE cases ca
   SET mailing_destination = cc.id::text
  FROM case_clients cc
 WHERE cc.case_id = ca.id AND cc.priority = 'main'
   AND ca.mailing_destination = '依頼者住所';

-- ============================================================
-- 153_communication_contact_method.sql
-- 依頼者やり取り履歴に「連絡方法」（電話/LINE/メール/手紙）を追加。
-- クレーム案件フラグ(cases.has_complaint)は、やり取りの連絡内容が「クレーム対応」
-- の行があるかで自動判定するようになったため、手動のクレーム欄は廃止（列は残置）。
-- ============================================================
ALTER TABLE client_communications ADD COLUMN IF NOT EXISTS contact_method text;

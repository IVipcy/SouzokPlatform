-- 納品タブ拡張。原本受領証(Genpon Juryosho)生成に必要な追加列。
--
-- 目的:
--   1. 名称編集: 「名寄帳」→「令和8年度 課税説明資料(土地・家屋名寄帳)」など、
--      納品タブ限定で書類名をリネームしたい。受信簿の元名称は他タブ(実務等)にも
--      使われるので触らず、納品タブ表示専用の delivery_display_name を追加。
--   2. 権利証補足: 不動産登記権利証(お客様預かり書類)には
--      「登記識別情報通知(通知日+識別番号)」を書類実物から手入力する必要がある。
--   3. 印鑑証明書 相続人紐付: 印鑑証明書は 相続人◯名分 まとまって受領するため、
--      原本受領証には「(A様、B様、C様 各1通)」形式で列挙する。相続人名を配列で保持。
--
-- 対象テーブル:
--   両テーブルとも 納品タブに載る (契約手続き:お客様預かり書類 + 受信簿) ので
--   同一の3列を対称的に追加する。

ALTER TABLE document_receipt_items
  ADD COLUMN IF NOT EXISTS delivery_display_name text,
  ADD COLUMN IF NOT EXISTS delivery_touki_notice_date text,      -- 例: '令和8年7月9日受付' or ISO日付を手入力
  ADD COLUMN IF NOT EXISTS delivery_touki_notice_number text,    -- 例: '第29003号'
  ADD COLUMN IF NOT EXISTS delivery_inkan_client_names text[];   -- 印鑑証明書に紐付く相続人名

ALTER TABLE contract_documents
  ADD COLUMN IF NOT EXISTS delivery_display_name text,
  ADD COLUMN IF NOT EXISTS delivery_touki_notice_date text,
  ADD COLUMN IF NOT EXISTS delivery_touki_notice_number text,
  ADD COLUMN IF NOT EXISTS delivery_inkan_client_names text[];

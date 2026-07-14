-- ============================================================
-- 167_invoice_review_flag.sql
-- 銀行CSV突合の②③（要確認）用。請求書に「要確認」フラグと理由を持たせる。
--   needs_review … true=入金待ち（要確認）。②③で立てる（名義相違/金額相違）。
--   review_reason … 要確認の理由（定型ルール文をAIが下書き→人が編集可）。
-- 「未入金／未入金(期日超過)」は保存せず、status=入金待ち＋CSV該当なし＋due_dateから表示時に判定する。
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

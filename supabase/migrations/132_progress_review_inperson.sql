-- 進捗確認を「対面・本人以外が確認」モデルへ。
--   review_point   : 確認ポイント（依頼時に管理担当が記入）
--   confirm_comment: 確認コメント（確認時に確認者が記入）
--   confirmer_id   : 確認者（事前指定をやめ、確認した本人を確認時にセット）。依頼時は NULL。
ALTER TABLE progress_reports
  ADD COLUMN IF NOT EXISTS review_point text,
  ADD COLUMN IF NOT EXISTS confirm_comment text;

ALTER TABLE progress_reports ALTER COLUMN confirmer_id DROP NOT NULL;

COMMENT ON COLUMN progress_reports.review_point IS '確認ポイント（依頼時に記入）。';
COMMENT ON COLUMN progress_reports.confirm_comment IS '確認コメント（確認時に確認者が記入）。';
COMMENT ON COLUMN progress_reports.confirmer_id IS '確認者（確認した本人。確認時にセット。依頼者本人は不可）。';

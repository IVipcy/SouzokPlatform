-- ============================================================
-- 161_meeting_content_detail.sql
-- ③ 面談内容詳細（検討中/失注以外のとき、理由セレクト直下に入力）用の新カラム。
--    詳細理由(consideration_decline_reason_detail)・その他申し送り事項(meeting_other_notes)とは別欄。
-- ⑥ 検討中理由の文言変更「親族に相談したい」→「相続人・親族に相談したい」の既存データ移行も併せて実施。
-- ============================================================

-- ③ 面談内容詳細カラム
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS meeting_content_detail text;

COMMENT ON COLUMN cases.meeting_content_detail IS '面談内容詳細（面談結果が検討中/失注以外のとき。詳細理由・その他申し送り事項とは別）';

-- ⑥ 検討中理由の文言変更に伴う既存データ移行
UPDATE cases
  SET consideration_decline_reason = '【検討】相続人・親族に相談したい'
  WHERE consideration_decline_reason = '【検討】親族に相談したい';

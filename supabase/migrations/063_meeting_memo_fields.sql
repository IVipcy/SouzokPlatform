-- ============================================================
-- 063_meeting_memo_fields.sql
-- 面談情報タブ「面談内容」セクションの自由記述欄（追加のみ・非破壊）
--
--   meeting_hearing_memo : ヒアリング内容メモ（面談で聞き取った内容のメモ）
--                          ※ 相談事前情報の hearing_content（LP事前ヒアリング）とは別物
--   meeting_other_notes  : その他備考
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS meeting_hearing_memo TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS meeting_other_notes TEXT;

COMMENT ON COLUMN cases.meeting_hearing_memo IS '面談内容: ヒアリング内容メモ（面談で聞いた内容。事前情報 hearing_content とは別）';
COMMENT ON COLUMN cases.meeting_other_notes IS '面談内容: その他備考';

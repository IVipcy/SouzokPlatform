-- ============================================================
-- 125_consideration_decline_reason.sql
-- 「失注理由(lost_reason)」を廃止し、「検討中・不受託理由」項目に統合。
--
-- 新カラム: cases.consideration_decline_reason TEXT
--   選択肢は src/lib/constants.ts の CONSIDERATION_DECLINE_REASONS 参照。
--   面談結果が「検討中」または「不受託」のとき入力対象。
--   ステータス変更後も値は残す（履歴として）。
--
-- 削除カラム: cases.lost_reason
--   完全削除。データもDROPで失われる。
-- ============================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS consideration_decline_reason TEXT;
COMMENT ON COLUMN cases.consideration_decline_reason IS '検討中・不受託の理由（旧 lost_reason の置換。【検討】/【不受託】プレフィックス付き選択肢）';

ALTER TABLE cases DROP COLUMN IF EXISTS lost_reason;

-- 他事業者紹介：依頼内容のフリーテキスト詳細を追加する。
-- 税理士・不動産は依頼内容が選択肢のため、補足を自由記述できるようにする。
ALTER TABLE case_referrals ADD COLUMN IF NOT EXISTS content_detail text;

COMMENT ON COLUMN case_referrals.content_detail IS '依頼内容詳細（フリーテキスト。税理士/不動産の選択肢の補足）。';

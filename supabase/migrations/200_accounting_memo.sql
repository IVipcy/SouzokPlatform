-- 案件毎の「経理入力欄」。経理が計上/入金/返金にまつわる備忘や、受注・管理担当への確認メモを書く。
-- 経理(primary_role='accounting')＋システム管理者のみ編集、他ロールは閲覧のみ（UI側で制御）。
-- 保存時に内容が変わっていれば受注担当＋管理担当へ通知する（変更なしでは通知しない）。
ALTER TABLE cases ADD COLUMN IF NOT EXISTS accounting_memo text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS accounting_memo_updated_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS accounting_memo_updated_by uuid REFERENCES members(id);

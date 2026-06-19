-- real_estate_acquisitions（migration 102で作成）にRLSポリシーと updated_at トリガーを付与。
-- 102でポリシー未設定だったため、取得資料の追加が row-level security でブロックされていた。
-- 他の案件付随テーブル（koseki_requests 等）と同様、authenticated に全許可する。

ALTER TABLE real_estate_acquisitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS real_estate_acquisitions_all ON real_estate_acquisitions;
CREATE POLICY real_estate_acquisitions_all ON real_estate_acquisitions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS real_estate_acquisitions_updated_at ON real_estate_acquisitions;
CREATE TRIGGER real_estate_acquisitions_updated_at
  BEFORE UPDATE ON real_estate_acquisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

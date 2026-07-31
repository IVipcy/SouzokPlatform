-- 不動産の取得予定資料に「取得区分（自社取得/依頼者取得）」を追加。
--   名寄帳・法務局請求は real_estate_acquisitions（宛先=市区町村役所/法務局）に acquirer を持たせる。
--   固定資産評価証明は 物件ごと(real_estate_properties)に既に acquirer(migration 085)があるのでそれを流用。
-- 依頼者取得にした行は 以降の請求系入力を不要にする運用（UI側で非活性化）。

ALTER TABLE real_estate_acquisitions
  ADD COLUMN IF NOT EXISTS acquirer text;   -- 自社取得 / 依頼者取得（既定=自社取得扱い）

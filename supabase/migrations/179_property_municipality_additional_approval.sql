-- 不動産・市区町村の「追加」に管理担当の承認ゲートを追加。
-- 承認の目印は取得資料(real_estate_acquisitions)ではなく物件(real_estate_properties)側に持たせる。
--   取得資料の表は立替実費の集計元でもあるため、そこへ承認用の行を作ると
--   名寄帳の二重計上・足す人による不整合が起きる。物件側フラグならお金の集計に一切影響しない。
alter table real_estate_properties
  add column if not exists is_additional          boolean not null default false,
  add column if not exists additional_approved_at timestamptz,
  add column if not exists additional_approved_by uuid references members(id) on delete set null;

comment on column real_estate_properties.is_additional          is '初期生成後に事務が追加した市区町村（管理担当の承認ゲート対象）。';
comment on column real_estate_properties.additional_approved_at  is '市区町村追加の承認日時。承認まで名寄帳・登記のタスクは生成しない。';
comment on column real_estate_properties.additional_approved_by  is '市区町村追加を承認した管理担当（member_id）。';

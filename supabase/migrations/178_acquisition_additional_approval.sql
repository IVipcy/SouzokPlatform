-- 不動産・取得資料の「追加請求」に管理担当の承認ゲートを追加（戸籍 koseki_requests と同方式）。
--   is_additional        : 初期生成後に足された追加の取得資料（承認が要る）。
--   additional_reason    : 追加の理由（承認者に伝える）。
--   additional_approved_at/by : 承認の記録。承認されるまで読込タスクは作らない。
alter table real_estate_acquisitions
  add column if not exists is_additional        boolean not null default false,
  add column if not exists additional_reason    text,
  add column if not exists additional_approved_at timestamptz,
  add column if not exists additional_approved_by uuid references members(id) on delete set null;

comment on column real_estate_acquisitions.is_additional        is '初期生成後に追加された取得資料（管理担当の承認ゲート対象）。';
comment on column real_estate_acquisitions.additional_reason    is '追加請求の理由（承認者へ伝える）。';
comment on column real_estate_acquisitions.additional_approved_at is '追加請求の承認日時。承認までタスクは生成しない。';
comment on column real_estate_acquisitions.additional_approved_by is '追加請求を承認した管理担当（member_id）。';

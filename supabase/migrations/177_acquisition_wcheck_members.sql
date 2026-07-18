-- 不動産・取得資料のW-Check（ダブルチェック）を「別人チェック」として成立させるための列追加。
--   *_done_by  : 実際に作業した人（請求日/到着日を入力した人）。W-Checkの自己チェック判定に使う。
--   *_check_by : W-Checkを押した人（member_id）。従来は名前(*_check_name)のみだった。
-- 作業者＝チェック者 のときは W-Check を弾く（管理担当は例外）。戸籍(migration 176)と同じ設計。
alter table real_estate_acquisitions
  add column if not exists request_done_by  uuid references members(id) on delete set null,
  add column if not exists receipt_done_by  uuid references members(id) on delete set null,
  add column if not exists request_check_by uuid references members(id) on delete set null,
  add column if not exists receipt_check_by uuid references members(id) on delete set null;

comment on column real_estate_acquisitions.request_done_by  is '請求作業者（請求日を入力した人）。W-Checkの自己チェック判定用。';
comment on column real_estate_acquisitions.receipt_done_by  is '受信作業者（到着日を入力した人）。W-Checkの自己チェック判定用。';
comment on column real_estate_acquisitions.request_check_by is '請求時W-Checkを実施した人（member_id）。';
comment on column real_estate_acquisitions.receipt_check_by is '受信時W-Checkを実施した人（member_id）。';

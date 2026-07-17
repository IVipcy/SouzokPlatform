-- 到着物受信簿：原本（現本）の物理格納先チームを記録する。
-- 各チームの物理メールボックス（レターケース等）に紙の原本を格納した先を、
-- 受信（封筒＝document_receipts 1行）単位で保持する。teams マスタから選択。
alter table document_receipts
  add column if not exists storage_team_id uuid references teams(id) on delete set null;

comment on column document_receipts.storage_team_id is '原本（紙）の物理格納先チーム（teams.id）。各チームのメールボックスに格納した先。';

create index if not exists idx_document_receipts_storage_team
  on document_receipts (storage_team_id);

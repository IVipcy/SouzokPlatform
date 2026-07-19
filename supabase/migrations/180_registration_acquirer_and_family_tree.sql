-- 相続登記の取得者・持分（物件ごと）＋ 法定相続情報一覧図の管理項目（案件ごと）を追加。

-- 相続登記：誰がどの物件を相続するか（取得者）・持分。登記申請書に必須。
alter table real_estate_properties
  add column if not exists registration_acquirer text,   -- 取得者（相続人名）
  add column if not exists registration_share    text;   -- 持分（例: 1/2）

comment on column real_estate_properties.registration_acquirer is '相続登記の取得者（この物件を相続する相続人）。';
comment on column real_estate_properties.registration_share    is '相続登記の持分（例: 1/2、全部）。';

-- 法定相続情報一覧図：戸籍が揃ったら法務局に申出→認証付き一覧図を取得。銀行等に戸籍の束の代わりに提出。
alter table cases
  add column if not exists family_tree_apply_date  date,   -- 申出日
  add column if not exists family_tree_obtain_date date,   -- 取得日
  add column if not exists family_tree_count       integer,-- 必要枚数（何通取るか）
  add column if not exists family_tree_office       text,   -- 提出先の法務局
  add column if not exists family_tree_note         text;   -- 認証番号・備考

comment on column cases.family_tree_apply_date  is '法定相続情報一覧図の申出日。';
comment on column cases.family_tree_obtain_date is '法定相続情報一覧図の取得日。';
comment on column cases.family_tree_count       is '法定相続情報一覧図の必要枚数（何通取るか）。';
comment on column cases.family_tree_office      is '法定相続情報一覧図の提出先の法務局。';
comment on column cases.family_tree_note        is '法定相続情報一覧図の認証番号・備考。';

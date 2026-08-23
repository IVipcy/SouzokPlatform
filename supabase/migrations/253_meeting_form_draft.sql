-- 253: 面談結果登録の入力途中をDBに持つ
--
-- ②面談結果登録は「登録する」を押すまでDBに何も入らない一括保存で、
-- ブラウザの戻る・タブを閉じる・端末のスリープで入力が消えていた。
-- 直前の対応でこの端末のブラウザに控えるようにしたが、端末をまたげない
-- （スマホで面談中に入力 → 事務所のPCで続き、ができない）。
--
-- 下書きを案件に持たせて、どの端末からでも続きを書けるようにする。
-- 「登録する」が通ったら消す。案件の各列へ反映するのは従来どおり登録時だけで、
-- ここは入力途中の控えにすぎない（一覧・KPI・集計には一切出ない）。

alter table cases
  add column if not exists meeting_form_draft    jsonb,
  add column if not exists meeting_form_draft_at timestamptz;

comment on column cases.meeting_form_draft is
  '面談結果登録（②）の入力途中。登録するまでの控え。登録できたら null に戻す';
comment on column cases.meeting_form_draft_at is
  '上記を最後に控えた日時。復元するときに「いつの入力か」を出す';

-- 257: 不動産の「依頼内容」と「査定ランク」を分ける（256 の不動産版）
--
-- 税理士と同じことが不動産でも起きていた。case_referrals.content ひとつに
--   依頼内容   … 登記申請あり(OC依頼予定) / 登記申請あり(その他)
--   査定ランク … S（今すぐ売りたい…） / A（空き家…） / B / C / その他
-- の2つを入れており、画面によってどちらを指すかが違っていた。
-- さらに面談結果登録では、1つの入力欄（realEstateRegistrationType）を
-- 「不動産査定（査定ランク）」と「不動産登記（依頼内容）」の両方に結んでいたため、
-- あとから触ったほうで上書きされていた。査定ランクは独立した列に移す。

alter table case_referrals add column if not exists appraisal_rank text;

comment on column case_referrals.appraisal_rank is '不動産の査定ランク（S/A/B/C/その他）。依頼内容(content)とは別物';

-- 既存データ：content に査定ランクが入っているものを appraisal_rank へ移す
update case_referrals
   set appraisal_rank = content,
       content = null
 where partner_type = '不動産'
   and content in (
     'S（今すぐ売りたい、兄弟相続物件あり）',
     'A（空き家になっている等）',
     'B（近々空き家になる可能性等あり）',
     'C（査定のみ、地方物件、一般仲介困難等）',
     'その他（自由入力）'
   );

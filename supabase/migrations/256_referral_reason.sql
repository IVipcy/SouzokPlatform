-- 256: 他事業者紹介の「依頼内容」と「紹介理由」を分ける
--
-- 税理士の欄が、画面によって別のものを同じ列（case_referrals.content）へ入れていた。
--   面談結果登録・実務タブ … 依頼内容（相続税申告あり / 準確定申告あり など）
--   オーダーシート        … 紹介理由（通常紹介 / 相見積もり有り など）
--
-- 同じ列を取り合っていたので、オーダーシートで紹介理由を選ぶと実務タブの依頼内容が
-- 紹介理由に化け、さらに「相続税申告の有無」の判定（content に『相続税申告』を含むか）も
-- 外れていた。紹介理由は独立した列に移し、content は依頼内容だけにする。

alter table case_referrals add column if not exists referral_reason text;

comment on column case_referrals.referral_reason is '紹介理由（通常紹介／相見積もり有り／専門性高い など）。依頼内容(content)とは別物';
comment on column case_referrals.content is '依頼内容（税理士＝相続税申告あり 等／不動産＝登記申請あり 等）。紹介理由は referral_reason へ';

-- 既存データ：content に紹介理由が入っているものを referral_reason へ移す
update case_referrals
   set referral_reason = content,
       content = null
 where partner_type = '税理士'
   and content in (
     '通常紹介',
     '相見積もり有り（価格調整が対応可能な税理士検討）',
     '専門性高い（土地や資産の評価の難易度が高い）',
     '提案金額注意（自分で申告したい等の要望あり）',
     'その他（自由入力）'
   );

-- 不動産の取得資料の「取得区分」の表記ゆれを直す。
--
-- 入っている値が '自社' / '依頼者'（lib/acquirer.ts の定義）と
-- '自社取得' / '依頼者取得'（実務タブの画面だけが使っていたラベル）で混在していた。
-- 実務タブは '自社取得' と完全一致するかどうかで「自社が取るか」を判定していたので、
-- オーダーシートから作った行（'自社'）が依頼者取得の扱いになり、
-- 請求日・費用予算・返金・確定費用が「依頼者負担」表示で入力できなくなっていた。
--
-- 画面側は表記ゆれを吸収するよう直したうえで、データも '自社' / '依頼者' に寄せる。
update real_estate_acquisitions set acquirer = '自社'   where acquirer = '自社取得';
update real_estate_acquisitions set acquirer = '依頼者' where acquirer = '依頼者取得';
update real_estate_acquisitions set acquirer = '自社'   where acquirer is null or btrim(acquirer) = '';

-- 255: 事業部をアカウント一覧に合わせる
--
-- アカウント一覧（docs/アカウント一覧/ID.csv）にある2つの事業部の列を、DBの正とする。
--   members.department … 所属事業部（相続事業部 / LP事業部 など。その人がどの事業部の人か）
--   members.division   … 第一事業部 / 第二事業部（確定売上表のシートの分かれ目）
--
-- これまでは teams.division を画面（請求・入金＞確定売上表の「営業部設定（チーム別）」）で
-- 手入力していたが、アカウント一覧が正になったのでその画面は廃止し、ここで一括して入れる。

alter table members add column if not exists division text;
comment on column members.division is '第一事業部 / 第二事業部。アカウント一覧が正。確定売上表のシートはこれで分かれる';
comment on column members.department is '所属事業部（相続事業部 / LP事業部 など）。アカウント一覧が正';

-- 呼び方を「営業部」から「事業部」へ揃える（チーム側の既存の値）
update teams set division = replace(division, '営業部', '事業部') where division like '%営業部%';

-- アカウント一覧の内容を流し込む（メールアドレスで突き合わせ）
with src(email, department, division) as (values
  -- 黒田 美菜子
  ('m.kuroda@ocean.legal', '総務・経理', null),
  -- 山田 哲
  ('s.yamada@ocean.legal', '相続事業部', '第一事業部'),
  -- 山﨑 亮太郎
  ('r.yamazaki@ocean.legal', '相続事業部', '第二事業部'),
  -- 岡田 大地
  ('d.okada@ocean.legal', 'コンサル・経営企画', '第一事業部'),
  -- 五十嵐 美和
  ('m.igarashi@ocean.legal', '相続事業部', '第一事業部'),
  -- 筆野 創
  ('h.fudeno@ocean.legal', '相続事業部', '第二事業部'),
  -- 杉原 旭樹
  ('t.sugihara@ocean.legal', 'LP事業部', '第二事業部'),
  -- 新井 達也
  ('t.arai@ocean.legal', '相続事業部', '第二事業部'),
  -- 馬場 祐樹
  ('y.baba@ocean.legal', '相続事業部', '第一事業部'),
  -- 井澤 美帆
  ('m.izawa@ocean.legal', '相続事業部', '第一事業部'),
  -- 嶋津 和寿子
  ('k.shimazu@ocean.legal', '相続事業部', '第一事業部'),
  -- 星野 尚子
  ('n.hoshino@ocean.legal', '身元保証事業部', '第一事業部'),
  -- 滝澤 瑠衣子
  ('r.takizawa@ocean.legal', '総務・経理', null),
  -- 岡部 実
  ('m.okabe@ocean.legal', '相続事業部', '第二事業部'),
  -- 土屋 園美
  ('s.tsuchiya@ocean.legal', 'LP事業部', '第二事業部'),
  -- 佐藤 麻由佳
  ('m.sato@ocean.legal', '総務・経理', null),
  -- 栗田 和志
  ('k.kurita@ocean.legal', '相続事業部', '第一事業部'),
  -- 福元 大記
  ('d.fukumoto@ocean.legal', 'コンサル・経営企画', '第一事業部'),
  -- 後藤 砂英
  ('s.goto@ocean.legal', '総務・経理', null),
  -- 赤坂 歩美
  ('a.akasaka@ocean.legal', 'LP事業部', '第二事業部'),
  -- 安井 菜々美
  ('n.yasui@ocean.legal', '相続事業部', '第一事業部'),
  -- 髙井 結衣
  ('y.takai@ocean.legal', '相続事業部', '第一事業部'),
  -- 渡部 真大
  ('m.watanabe@ocean.legal', '相続事業部', '第一事業部'),
  -- 平川 知恵
  ('t.hirakawa@ocean.legal', 'LP事業部', '第二事業部'),
  -- 山﨑 健大
  ('t.yamazaki@ocean.legal', '身元保証事業部', '第一事業部'),
  -- 須田 実咲
  ('ms.suda@ocean.legal', 'LP事業部', '第二事業部'),
  -- 金森 萌花
  ('m.kanamori@ocean.legal', 'LP事業部', '第二事業部'),
  -- 菅家 しずく
  ('s.kanke@ocean.legal', 'LP事業部', '第二事業部'),
  -- 石井 菜央
  ('n.ishii@ocean.legal', 'LP事業部', '第二事業部'),
  -- 小泉 茉穂
  ('m.koizumi@ocean.legal', 'LP事業部', '第二事業部'),
  -- 上田 拓海
  ('t.ueda@ocean.legal', '相続事業部', '第一事業部'),
  -- 小川 武琉
  ('t.ogawa@ocean.legal', '相続事業部', '第一事業部'),
  -- 近藤 優衣
  ('y.kondou@ocean.legal', 'LP事業部', '第二事業部'),
  -- 森谷 英晴
  ('h.moriya@ocean.legal', '相続事業部', '第二事業部'),
  -- 渡邉 仁志
  ('h.watanabe@ocean.legal', '相続事業部', '第一事業部'),
  -- 氏家 球子
  ('m.ujiie@ocean.legal', 'LP事業部', '第二事業部'),
  -- 宮川 千怜
  ('c.miyakawa@ocean.legal', '相続事業部', '第一事業部'),
  -- 藤田 早苗
  ('s.fujita@ocean.legal', '相続事業部', '第一事業部'),
  -- 福岡 みどり
  ('m.fukuoka@ocean.jpn.com', '法人営業部', '第一事業部'),
  -- 花井 和樹
  ('k.hanai@ocean.legal', '相続事業部', '第二事業部'),
  -- 大塚 悠子
  ('y.ootsuka@ocean.legal', '身元保証事業部', '第一事業部'),
  -- 梅澤 貴
  ('t.umezawa@ocean.legal', '相続事業部', '第一事業部'),
  -- 田中 玲花
  ('r.tanaka@ocean.legal', '相続事業部', '第一事業部'),
  -- 久田 真生
  ('m.hisada@ocean.legal', '相続事業部', '第一事業部'),
  -- 根本 岳斗
  ('t.nemoto@ocean.legal', '相続事業部', '第一事業部'),
  -- 宮田 依寿
  ('y.miyata@ocean.legal', '相続事業部', '第一事業部'),
  -- 角田 幸一
  ('k.tsunoda@ocean.legal', '相続事業部', '第一事業部'),
  -- 池添 美優
  ('m.ikezoe@ocean.legal', 'LP事業部', '第二事業部'),
  -- 芹ケ野 悠里
  ('y.serigano@ocean.legal', '相続事業部', '第一事業部'),
  -- 間瀬 百菜
  ('m.mase@ocean.legal', '相続事業部', '第一事業部'),
  -- 守友 舜
  ('s.moritomo@ocean.legal', '相続事業部', '第一事業部'),
  -- 比護 葉月
  ('h.higo@ocean.legal', '相続事業部', '第二事業部'),
  -- 望月 景子
  ('k.mochizuki@ocean.legal', 'LP事業部', '第二事業部'),
  -- 外所 功太郎
  ('k.todokoro@ocean.legal', '相続事業部', '第一事業部'),
  -- 伊東 一磨
  ('k.itou@ocean.legal', 'コンサル・経営企画', '第一事業部'),
  -- 上村 寿厚
  ('k.uemura@ocean.legal', '相続事業部', '第一事業部'),
  -- 築地原 智二
  ('t.tsuichihara@ocean.legal', '身元保証事業部', '第一事業部'),
  -- 平田 源
  ('g.hirata@ocean.legal', 'コンサル・経営企画', '第一事業部'),
  -- 藤倉 悠人
  ('y.fujikura@ocean.legal', '相続事業部', '第一事業部'),
  -- 市川 あい子
  ('a.ichikawa@ocean.legal', '相続事業部', '第一事業部'),
  -- 登坂 和宗
  ('k.tosaka@ocean.legal', '相続事業部', '第二事業部'),
  -- 加藤 秀美
  ('h.kato@ocean.legal', '相続事業部', '第二事業部'),
  -- 鎌田 証志
  ('a.kamata@ocean.legal', '相続事業部', '第一事業部'),
  -- 提箸 みく
  ('m.sagehashi@ocean.legal', 'LP事業部', '第二事業部'),
  -- 宮内 咲弥
  ('s.miyauchi@ocean.legal', 'LP事業部', '第二事業部'),
  -- 山内 淑乃
  ('y.yamauchi@ocean.legal', '身元保証事業部', '第一事業部'),
  -- 森山 頌子
  ('s.moriyama@ocean.legal', 'LP事業部', '第二事業部'),
  -- 川下 明菜
  ('a.kawashita@ocean.legal', '総務・経理', null),
  -- 宮本 悠菜
  ('y.miyamoto@ocean.legal', '相続事業部', '第一事業部'),
  -- 太田 雅育
  ('n.oota@ocean.legal', '相続事業部', '第二事業部'),
  -- 中田 均
  ('hi.nakata@ocean.legal', '相続事業部', '第一事業部'),
  -- 西原 及瑛
  ('c.nishihara@ocean.legal', '相続事業部', '第二事業部'),
  -- 長谷川 愛子
  ('a.hasegawa@ocean.legal', '相続事業部', '第一事業部'),
  -- 中釜 奈緒子
  ('n.nakagama@ocean.legal', '相続事業部', '第一事業部'),
  -- 中田 遥弓
  ('h.nakata@ocean.legal', 'LP事業部', '第二事業部')
)
update members m set department = src.department, division = src.division
from src where lower(m.email) = lower(src.email);

-- チーム側にも同じ事業部を入れておく（受注担当に事業部が入っていないときの受け皿）
update teams t set division = s.division from (values
  ('LPチーム', '第二事業部'),
  ('五十嵐チーム', '第一事業部'),
  ('山田チーム', '第一事業部'),
  ('岡田チーム', '第一事業部'),
  ('新井・筆野チーム', '第二事業部'),
  ('法人営業チーム', '第一事業部'),
  ('渡邉チーム', '第一事業部'),
  ('身元保証チーム', '第一事業部'),
  ('馬場チーム', '第一事業部')
) as s(name, division) where t.name = s.name and t.division is distinct from s.division;

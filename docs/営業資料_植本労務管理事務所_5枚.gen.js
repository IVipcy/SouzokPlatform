const pptxgen = require("pptxgenjs");

// ---- CONGEN design system (LDHD deck) ---------------------------------
const INK = "23272C";   // dark ground
const INK2 = "2E343B";  // dark card
const BODY = "6E7379";  // body gray on white
const MUTE = "A7ACB2";  // muted gray on dark
const CARD = "F1F2F1";  // flat card on white
const RULE = "434A52";  // hairline on dark
const CU = "A8552A";    // copper on light
const CU2 = "D79762";   // copper on dark
const W = "FFFFFF";
const F = "Meiryo";
const P = (v) => v / 96;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
const M = 64, CW = 1280 - M * 2;

function T(s, text, x, y, w, h, o = {}) {
  s.addText(text, {
    x: P(x), y: P(y), w: P(w), h: P(h),
    fontFace: F, margin: 0, valign: o.valign || "top",
    fontSize: o.size || 9.5, color: o.color || BODY, bold: !!o.bold,
    align: o.align || "left", lineSpacingMultiple: o.lsm || 1.45,
    charSpacing: o.cs || 0,
  });
}
function box(s, x, y, w, h, fill, radius) {
  s.addShape(radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
    x: P(x), y: P(y), w: P(w), h: P(h),
    fill: { color: fill }, line: { type: "none" },
    ...(radius ? { rectRadius: P(radius) } : {}),
  });
}
function pageFoot(s, n) {
  T(s, "CONGEN Inc.", M, 688, 200, 14, { size: 8.5, color: MUTE });
  T(s, String(n), 1200, 688, 16, { size: 9, color: MUTE, align: "right" });
}

// ============ SLIDE 1 : 表紙（ダーク・LDHD表紙の型） ====================
{
  const s = pres.addSlide();
  s.background = { color: INK };

  T(s, "社会保険労務士法人 植本労務管理事務所 御中", M, 156, 900, 24, { size: 15, color: MUTE, cs: 0.4 });
  box(s, M, 236, 72, 3, CU2);
  T(s, "AI 導入のご提案", M, 258, CW, 60, { size: 38, color: W, bold: true, lsm: 1.1 });
  T(s, "紙の事務所業務を、AIでまるごとデジタルに。", M, 338, CW, 24, { size: 15, color: CU2, bold: true, lsm: 1.4 });
  T(s, "書類作成の自動化から、顧客・進捗・書類の一元管理、AIアバターの相談窓口、ホームページの作成・更新まで。日々の業務を楽にしながら、事務所の発信力も高めるご提案です。",
    M, 374, 940, 44, { size: 11.5, color: MUTE, lsm: 1.6 });

  box(s, M, 556, CW, 1, RULE);
  T(s, "株式会社 CONGEN", M, 576, 500, 22, { size: 13, color: W, bold: true });
  T(s, "AIソリューション開発／AIアバター事業", M, 604, 500, 18, { size: 10.5, color: "7C8189" });
  T(s, "2026年8月", 900, 576, CW - 836, 22, { size: 12, color: MUTE, align: "right" });
}

// ============ SLIDE 2 : できること4本柱（ホワイト） =====================
{
  const s = pres.addSlide();
  s.background = { color: W };

  T(s, "OVERVIEW / 01", M, 44, 400, 18, { size: 10.5, color: CU, bold: true, cs: 0.8 });
  T(s, "ご提案の全体像 ― AIでできる4つのこと", M, 66, CW, 40, { size: 22, color: INK, bold: true, lsm: 1.15 });
  T(s, "相続手続きの実務会社向けに内製し、いま実際に稼働している業務管理システムと、自社開発のAIアバターがベースです。同じ仕組みを、社労士業務に応用します。",
    M, 110, CW, 22, { size: 10.5, color: BODY, lsm: 1.45 });

  const CY = 152, CH = 356, GAP = 16;
  const CWD = (CW - GAP * 3) / 4;
  const pillars = [
    ["01", "書類作成を、AIで自動化", "案件情報を差し込んで、定型書類を自動作成。手打ちと転記ミスをなくします。", "相続実務では契約書・委任状・請求書など12種が稼働中。36協定・雇用契約書・各種届出書のような社労士の定型書式にも、同じ仕組みが使えます。"],
    ["02", "紙の業務を、全部デジタルに", "顧客情報・タスクと進捗・預かり書類・請求と入金消込まで、1つのシステムで管理。", "預かり書類は受信簿で「何が届いて何が未着か」を管理し、案件ごとのフォルダに電子保管。進捗はAIが要約し、聞かなくても分かる状態にします。"],
    ["03", "AIアバターの相談窓口", "事務所オリジナルのキャラクターが、チャットで相談の一次対応。", "ブラウザで動き、専用アプリは不要。人には聞きにくい労務の悩みほど、相手がアバターだと聞けます。顧問先への提供商材にもなります。"],
    ["04", "HP作成・更新も、AIで", "事務所ホームページの制作・リニューアルから、日々の更新までAIで速く回します。", "お知らせ・コラム・制度改正の解説記事などの下書きをAIが作り、確認して載せるだけに。採用や顧問先向けの情報発信を、手間なく続けられます。"],
  ];
  pillars.forEach(([n, t, lead, b], i) => {
    const x = M + i * (CWD + GAP);
    box(s, x, CY, CWD, CH, CARD, 5);
    T(s, n, x + 20, CY + 22, 60, 22, { size: 14, color: CU, bold: true });
    T(s, t, x + 20, CY + 50, CWD - 40, 66, { size: 12.5, color: INK, bold: true, lsm: 1.3 });
    T(s, lead, x + 20, CY + 126, CWD - 40, 84, { size: 10, color: INK, lsm: 1.55 });
    T(s, b, x + 20, CY + 216, CWD - 40, 130, { size: 9, color: BODY, lsm: 1.6 });
  });

  box(s, M, 540, CW, 74, INK, 5);
  T(s, [
    { text: "少人数で多くの顧問先を支える事務所ほど、効果が出ます。", options: { color: CU2, bold: true, fontSize: 12.5 } },
    { text: "　長年つみ重ねた実務ノウハウは、AIのナレッジベースとして事務所の資産に残します。", options: { color: W, fontSize: 11 } },
  ], M + 28, 540, CW - 56, 74, { valign: "middle", lsm: 1.5 });

  pageFoot(s, 2);
}

// ============ SLIDE 3 : 業務管理システム（実績・ホワイト） ==============
{
  const s = pres.addSlide();
  s.background = { color: W };

  T(s, "WORKS / 02", M, 44, 400, 18, { size: 10.5, color: CU, bold: true, cs: 0.8 });
  T(s, "AIネイティブな業務管理システム ― 相続実務で稼働中", M, 66, CW, 40, { size: 22, color: INK, bold: true, lsm: 1.15 });
  T(s, "汎用SaaSに業務を合わせるのではなく、業務にシステムを合わせた。その上でAIを、日々の入力・進捗把握・書類作成の動線そのものに組み込んでいます。業務の変化に合わせ、これまで255回作り替えてきました。",
    M, 110, CW, 34, { size: 10.5, color: BODY, lsm: 1.45 });

  const AY = 158, AH = 128, GAP = 14;
  const AW = (CW - GAP * 3) / 4;
  [
    ["手書きメモのAI反映", "タブレットの専用アプリで、面談中の手書きメモをその場でテキスト化。氏名・住所などをAIが読み取り、案件情報へ自動反映。"],
    ["AI書類作成", "案件情報を差し込んで、契約書・委任状・請求書など定型12種を自動作成。できた書類はそのまま案件に添付・保管。"],
    ["案件サマリAI", "案件を開くと、工程ごとの作業メモと実施結果をAIが要約。「いまどこまで進んでいるか」が1〜2文で分かる。"],
    ["ナレッジベース×AI", "業務ナレッジを検索付きマニュアルとしてアプリ内に集約。執筆・整理はAIがサポートし、ノウハウが個人に溜まらず残る。"],
  ].forEach(([t, b], i) => {
    const x = M + i * (AW + GAP);
    box(s, x, AY, AW, AH, CARD, 4);
    T(s, t, x + 18, AY + 16, AW - 36, 18, { size: 12, color: CU, bold: true, lsm: 1.1 });
    T(s, b, x + 18, AY + 42, AW - 36, 80, { size: 9, color: BODY, lsm: 1.5 });
  });

  const BY = 306, BH = 240;
  const RESW = 380, MAPX = M + RESW + 16, MAPW = CW - RESW - 16;

  box(s, M, BY, RESW, BH, INK, 5);
  T(s, "効果（試算）", M + 24, BY + 20, 200, 18, { size: 11.5, color: CU2, bold: true });
  s.addText([
    { text: "約10%", options: { fontSize: 30, color: CU2, bold: true } },
    { text: "  の稼働削減を見込む", options: { fontSize: 11.5, color: W } },
  ], { x: P(M + 24), y: P(BY + 44), w: P(RESW - 48), h: P(44), fontFace: F, margin: 0, valign: "top", lineSpacingMultiple: 1.0 });
  T(s, "従来100人体制での試算・目標値です。", M + 24, BY + 92, RESW - 48, 16, { size: 9, color: MUTE, lsm: 1.3 });
  T(s, "実測値ではありません。", M + 24, BY + 108, RESW - 48, 16, { size: 9, color: MUTE, lsm: 1.3 });
  T(s, [{ text: "消えるのは　", options: { color: CU2, bold: true } },
        { text: "面談メモの清書と転記／同じ情報の二重入力／書類の手打ち／入金消込の目視突合／進捗確認の問い合わせ／紙書類の探索と保管", options: { color: W } }],
    M + 24, BY + 134, RESW - 48, 100, { size: 10, lsm: 1.55 });

  box(s, MAPX, BY, MAPW, BH, CARD, 5);
  T(s, "社労士業務では、こう使えます", MAPX + 24, BY + 18, 400, 18, { size: 12.5, color: CU, bold: true });
  T(s, "左＝相続業務での実装（稼働中）　→　右＝社労士業務での応用イメージ（ご提案）", MAPX + 24, BY + 42, MAPW - 48, 16, { size: 9, color: BODY });
  [
    ["案件＝相続手続き1件", "顧問先ごとの手続き（入退社・算定基礎・年度更新・就業規則改定・助成金申請）"],
    ["面談メモの手書き→AI反映", "顧問先訪問・労務相談のヒアリング。その場のメモをAIが項目化"],
    ["必要書類の受領管理／期限アラート", "顧問先からの預かり書類の抜け漏れ防止。法定期限の遅延は色で把握"],
    ["書類の自動作成（12種）", "36協定・雇用契約書・就業規則の変更届・委任状などの差し込み"],
    ["請求パターン＋入金のCSV突合", "顧問料（月額）＋スポット報酬の請求と、入金消込"],
  ].forEach(([a, b], i) => {
    const y = BY + 66 + i * 34;
    T(s, a, MAPX + 24, y, 264, 16, { size: 10, color: INK, bold: true, lsm: 1.15 });
    T(s, "→", MAPX + 294, y, 20, 16, { size: 10, color: CU });
    T(s, b, MAPX + 316, y, MAPW - 340, 30, { size: 10, color: BODY, lsm: 1.2 });
  });

  T(s, "規模感：業務用のデータの入れ物 約70種／稼働環境 Azure（東京）／AIは Claude を利用", M, 566, CW, 16, { size: 9, color: "A7ACB2" });
  pageFoot(s, 3);
}

// ============ SLIDE 4 : AIアバター＋HP（ホワイト） ======================
{
  const s = pres.addSlide();
  s.background = { color: W };

  T(s, "AI AVATAR & WEB / 03", M, 44, 400, 18, { size: 10.5, color: CU, bold: true, cs: 0.8 });
  T(s, "聞きにくいことを、聞ける相手をつくる", M, 66, CW, 40, { size: 22, color: INK, bold: true, lsm: 1.15 });
  T(s, "自社開発のAIアバターを、事務所オリジナルのキャラクターで。ブラウザで動作し、専用アプリは不要。発話を感情分析し、表情と声で反応します。人には聞きにくい労務の悩みほど、相手がアバターだと聞けます。",
    M, 110, CW, 34, { size: 10.5, color: BODY, lsm: 1.45 });

  const AY = 160, AH = 196, GAP = 16;
  const AW = (CW - GAP * 2) / 3;
  [
    ["01", "顧問先の従業員向け 相談窓口", "労務の悩みを、匿名でチャット相談。上司や担当者に直接は聞きにくい話題の受け皿になり、相談は整理して社労士へつなぎます。顧問先への提供商材になります。"],
    ["02", "手続き・よくある質問の一次対応", "「この手続きに何が必要？」のような定型の質問はアバターが引き受け、職員は判断が要る相談に集中できます。事務所の受付チャットとしても使えます。"],
    ["03", "ブランドに合うオリジナルキャラクター", "事務所の雰囲気に合わせたキャラクターを制作から実装まで自社対応。短期間・低コストで、事務所の「顔」になる相談相手を用意できます。"],
  ].forEach(([n, t, b], i) => {
    const x = M + i * (AW + GAP);
    box(s, x, AY, AW, AH, CARD, 4);
    T(s, n, x + 20, AY + 18, 60, 20, { size: 13, color: CU, bold: true });
    T(s, t, x + 20, AY + 44, AW - 40, 40, { size: 12.5, color: INK, bold: true, lsm: 1.25 });
    T(s, b, x + 20, AY + 92, AW - 40, 96, { size: 9.5, color: BODY, lsm: 1.55 });
  });

  T(s, "※ AIアバターが判断・助言を確定することはありません。一次対応と案内・整理に限定し、個別の判断は社労士におつなぎする設計です。",
    M, 372, CW, 16, { size: 9, color: BODY });

  // HP作成・更新（帯）
  const HY = 412, HH = 176;
  box(s, M, HY, CW, HH, INK, 5);
  T(s, "あわせて：ホームページの作成・更新も、AIで効率化", M + 28, HY + 22, 800, 20, { size: 13, color: CU2, bold: true });
  const hw = (CW - 56 - 32) / 3;
  [
    ["制作・リニューアル", "事務所ホームページの新規制作・作り直しをAIで速く。アバター相談窓口をHPに載せることもできます。"],
    ["日々の更新を止めない", "お知らせ・コラム・制度改正の解説記事の下書きをAIが作成。確認して載せるだけにして、発信を続けられます。"],
    ["採用・顧問先獲得の入口に", "更新が続くHPは、採用応募や顧問先からの相談の入口になります。内容の相談から一緒にやります。"],
  ].forEach(([t, b], i) => {
    const x = M + 28 + i * (hw + 16);
    T(s, t, x, HY + 56, hw, 18, { size: 11, color: W, bold: true });
    T(s, b, x, HY + 80, hw, 84, { size: 9.5, color: MUTE, lsm: 1.55 });
  });

  pageFoot(s, 4);
}

// ============ SLIDE 5 : 会社概要（ダーク・締め） =========================
{
  const s = pres.addSlide();
  s.background = { color: INK };

  T(s, "ABOUT US / 04", M, 56, 400, 18, { size: 10.5, color: CU2, bold: true, cs: 0.8 });
  T(s, "AIの精鋭集団でありながら、現場に寄り添うチーム", M, 78, CW, 40, { size: 22, color: W, bold: true, lsm: 1.15 });
  T(s, "技術を納めて終わりにせず、現場の言葉と業務の流れに入り込んで一緒に作る。その進め方を、お客様に評価いただいています。",
    M, 122, CW, 22, { size: 10.5, color: MUTE, lsm: 1.45 });

  // 概要表（左）
  const TY = 172, ROWH = 56, TW = 500;
  const rows = [
    ["会社名", "株式会社CONGEN"],
    ["代表者", "福島 優（Fukushima Suguru）"],
    ["設立", "2024年12月"],
    ["事業", "AIソリューション開発／AIアバター事業"],
    ["特徴", "企業課題を解くAIを自社開発・実装"],
  ];
  rows.forEach(([a, b], i) => {
    const y = TY + i * ROWH;
    T(s, a, M, y + 8, 110, 16, { size: 10, color: MUTE });
    T(s, b, M + 120, y + 6, TW - 120, 20, { size: 13, color: W, bold: true });
    box(s, M, y + ROWH - 8, TW, 1, RULE);
  });

  // 強み3カード（右）
  const CX = M + TW + 48, CWD = CW - TW - 48;
  const cards = [
    ["01 自社開発力", "訪問介護・診療・士業の面談等で使える新AIソリューションを自社開発。用途に合わせて素早く実装します。"],
    ["02 AIアバター事業", "ブランドに合うキャラクターを低コスト×短時間で開発。行動を促す独自設計を持っています。"],
    ["03 実装実績", "大手リース会社・京セラ等との取引実績。京都市の課題解決にもAIを活用。相続実務会社の業務管理システムを内製・稼働中。"],
  ];
  cards.forEach(([t, b], i) => {
    const y = TY + i * 94;
    box(s, CX, y, CWD, 84, INK2, 5);
    T(s, t, CX + 22, y + 14, CWD - 44, 18, { size: 11.5, color: CU2, bold: true });
    T(s, b, CX + 22, y + 38, CWD - 44, 42, { size: 9.5, color: MUTE, lsm: 1.5 });
  });

  // 実績帯
  box(s, M, 500, CW, 64, INK2, 5);
  s.addText([
    { text: "創業2か月でIBMスタートアップアクセラ採択　／　IVS登壇・京セラ賞受賞　／　京都市補助金採択", options: { fontSize: 11.5, color: CU2, bold: true } },
  ], { x: P(M + 28), y: P(500), w: P(CW - 56), h: P(64), fontFace: F, margin: 0, valign: "middle" });

  T(s, "まずは、業務を見せてください。実務の手順をうかがい、AIで置き換えられる候補を並べ、効果の大きいところから小さく始めます。",
    M, 590, CW, 20, { size: 11, color: W, lsm: 1.5 });
  T(s, "株式会社 CONGEN　／　AIソリューション開発・AIアバター事業　／　2026年8月", M, 620, CW, 16, { size: 9.5, color: MUTE });
}

pres.writeFile({ fileName: process.argv[2] }).then((f) => console.log("wrote", f));

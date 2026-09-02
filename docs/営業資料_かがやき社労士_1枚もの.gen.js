const pptxgen = require("pptxgenjs");

// ---- CONGEN design system (extracted from the LDHD deck) --------------
const INK = "23272C";   // dark ground / headings on white
const BODY = "6E7379";  // body gray on white
const MUTE = "A7ACB2";  // muted gray on dark
const CARD = "F1F2F1";  // flat card fill
const RULE = "E4E5E3";  // hairline
const CU = "A8552A";    // copper on light
const CU2 = "D79762";   // copper on dark
const W = "FFFFFF";
const F = "Meiryo";

const P = (v) => v / 96; // px -> inches (1280 x 720 canvas)

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
const s = pres.addSlide();
s.background = { color: W };

const box = (x, y, w, h, fill, radius) =>
  s.addShape(radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
    x: P(x), y: P(y), w: P(w), h: P(h),
    fill: { color: fill }, line: { type: "none" },
    ...(radius ? { rectRadius: P(radius) } : {}),
  });

const T = (text, x, y, w, h, o = {}) =>
  s.addText(text, {
    x: P(x), y: P(y), w: P(w), h: P(h),
    fontFace: F, margin: 0, valign: o.valign || "top",
    fontSize: o.size || 8, color: o.color || BODY, bold: !!o.bold,
    align: o.align || "left", lineSpacingMultiple: o.lsm || 1.4,
    charSpacing: o.cs || 0,
  });

const M = 44, CW = 1192;                 // margins / content width
const RAILW = 112, CX = 168, CCW = 1068; // narrative rail + content column

// ---- HEADER : key message --------------------------------------------
box(0, 0, 1280, 138, INK);
T("かがやき社会保険労務士法人 御中", M, 20, 600, 15, { size: 10.5, color: CU2, cs: 0.6 });
T("株式会社CONGEN　／　2026年8月", 880, 21, CW - 836, 15, { size: 9.5, color: MUTE, align: "right" });
T("AIネイティブな業務管理システム", M, 40, 1000, 34, { size: 24, color: W, bold: true, lsm: 1.1 });
T(
  [
    { text: "専門業務はAIがサポートし、分業のフローはシステムが支える。", options: { color: CU2, bold: true } },
    { text: "　少ない人数のまま、多くの案件を効率的に運用管理できます。", options: { color: W } },
  ],
  M, 82, CW, 16, { size: 10.5, lsm: 1.2 }
);
T("相続手続きの実務会社が、自社の業務に合わせて内製し、いま稼働させているシステムです。汎用SaaSに業務を合わせるのではなく、業務にシステムを合わせました。",
  M, 104, CW, 16, { size: 9, color: MUTE, lsm: 1.2 });

// ---- narrative rail ---------------------------------------------------
const act = (y, no, title, gloss) => {
  T(no, M, y, 60, 20, { size: 16, color: CU, bold: true, lsm: 1.0 });
  T(title, M, y + 22, RAILW, 16, { size: 11, color: INK, bold: true, lsm: 1.0 });
  T(gloss, M, y + 42, RAILW, 28, { size: 7.5, color: BODY, lsm: 1.3 });
};
const hairline = (y) => box(M, y, CW, 1, RULE);

// ---- 01 課題 ----------------------------------------------------------
const A1 = 148;
act(A1, "01", "課題", "なぜ作ったのか");
const pw1 = (CCW - 32) / 3;
[
  ["進捗が、人の頭の中にある", "受注 → 案件管理 → 事務作業と手が渡るたび、いまどこまで進んだのかを担当者に聞かないと分からない。"],
  ["同じ情報を、何度も打ち直す", "面談メモの清書と転記、書類への手打ち。同じ内容を、場所を変えて何度も入力し直している。"],
  ["確認と探し物に、時間が溶ける", "入金の目視での突合、紙書類の探索と保管、進捗を知るための問い合わせと報告。"],
].forEach(([t, b], i) => {
  const x = CX + i * (pw1 + 16);
  box(x, A1 + 6, 4, 4, CU);
  T(t, x + 12, A1, pw1 - 12, 16, { size: 10.5, color: INK, bold: true, lsm: 1.1 });
  T(b, x + 12, A1 + 24, pw1 - 12, 54, { size: 8, color: BODY, lsm: 1.5 });
});

// ---- 02 設計思想 ------------------------------------------------------
const A2 = 250, A2H = 108;
hairline(A2 - 10);
act(A2, "02", "設計思想", "どう作ったのか");
const pw2 = (CCW - 36) / 4;
[
  ["分業フローを、システムに組み込む", "受注担当 → 案件管理担当 → 事務作業担当の業務パスをそのまま画面にした。引き継ぎで止まっていた案件が、待ちなく次の担当へ流れる。"],
  ["定型書類は、AIが案件情報から作る", "契約書・委任状・請求書など12種を、案件データの差し込みで自動作成。書類への手打ちと転記ミスをなくす。"],
  ["すべての文書を、案件に紐づける", "作った書類も預かった書類も、案件ごとのフォルダに電子保管。受信簿で、届いた書類と未着の書類まで管理する。"],
  ["柔軟に、仕様を追加できる", "業務の変化に合わせて、これまで255回の機能追加・改修。汎用SaaSと違い、システム側が業務を追いかける。"],
].forEach(([t, b], i) => {
  const x = CX + i * (pw2 + 12);
  box(x, A2, pw2, A2H, CARD, 4);
  T(t, x + 16, A2 + 14, pw2 - 32, 30, { size: 10, color: INK, bold: true, lsm: 1.15 });
  T(b, x + 16, A2 + 48, pw2 - 32, 56, { size: 7.5, color: BODY, lsm: 1.45 });
});
T([
  { text: "実装ずみの範囲　", options: { color: CU, bold: true } },
  { text: "顧客・案件情報／タスクと進捗／書類12種の自動作成／請求と入金のCSV突合／受信簿と案件フォルダの電子保管／役割別ダッシュボードと期限アラート／アプリ内ナレッジベース", options: { color: BODY } },
], CX, A2 + 118, CCW, 14, { size: 8, lsm: 1.2 });

// ---- 03 AIの実装 ------------------------------------------------------
const A3 = 392, A3H = 104;
hairline(A3 - 10);
act(A3, "03", "AIの実装", "何が自動になったか");
const pw3 = (CCW - 36) / 4;
[
  ["手書きメモのAI反映", "タブレットの専用アプリで、面談中の手書きメモをその場でテキスト化。氏名・住所などをAIが読み取り、案件情報へ自動反映する。"],
  ["AI書類作成", "案件情報を差し込んで、契約書・委任状・請求書など定型12種を自動作成。できた書類はそのまま案件に添付・保管される。"],
  ["案件サマリAI", "案件を開くと、工程ごとの作業メモと実施結果をAIが要約。「いまどこまで進んでいるか」が全体1〜2文＋工程ごと1文で分かる。"],
  ["ナレッジベース×AI", "業務ナレッジを検索付きマニュアルとしてアプリ内に集約。執筆・整理・要約はAIがサポートし、ノウハウが個人に溜まらず残る。"],
].forEach(([t, b], i) => {
  const x = CX + i * (pw3 + 12);
  box(x, A3, pw3, A3H, CARD, 4);
  T(t, x + 16, A3 + 14, pw3 - 32, 16, { size: 10.5, color: CU, bold: true, lsm: 1.1 });
  T(b, x + 16, A3 + 38, pw3 - 32, 62, { size: 7.5, color: BODY, lsm: 1.5 });
});

// ---- 04 結果と応用 ----------------------------------------------------
const A4 = 508, A4H = 112;
hairline(A4 - 10);
act(A4, "04", "結果と応用", "どうなったか");
const RESW = 400, MAPX = CX + RESW + 12, MAPW = CCW - RESW - 12;

box(CX, A4, RESW, A4H, INK, 4);
T("結果（試算）", CX + 20, A4 + 10, 200, 14, { size: 10, color: CU2, bold: true });
s.addText([
  { text: "約10%", options: { fontSize: 24, color: CU2, bold: true } },
  { text: "  の稼働削減を見込む", options: { fontSize: 10, color: W } },
], { x: P(CX + 20), y: P(A4 + 27), w: P(RESW - 40), h: P(32), fontFace: F, margin: 0, valign: "top", lineSpacingMultiple: 1.0 });
T("従来100人体制での試算・目標値です。実測値ではありません。", CX + 20, A4 + 61, RESW - 40, 12, { size: 7.5, color: MUTE, lsm: 1.2 });
T([{ text: "消えるのは　", options: { color: CU2 } },
   { text: "清書と転記／二重入力／書類の手打ち／目視での突合／進捗の問い合わせ／紙の探索", options: { color: W } }],
  CX + 20, A4 + 78, RESW - 40, 30, { size: 8, lsm: 1.35 });

box(MAPX, A4, MAPW, A4H, CARD, 4);
T("社労士事務所では、こう使えます", MAPX + 20, A4 + 12, 400, 15, { size: 10.5, color: CU, bold: true });
T("左＝相続業務での実装（稼働中）　→　右＝社労士業務での応用イメージ（ご提案）", MAPX + 20, A4 + 31, MAPW - 40, 12, { size: 7.5, color: BODY });
[
  ["案件＝相続手続き1件", "顧問先ごとの手続き（入退社・算定基礎・年度更新・就業規則改定・助成金申請）"],
  ["面談メモの手書き→AI反映", "顧問先訪問・労務相談のヒアリング。その場のメモをAIが項目化"],
  ["必要書類の受領管理／期限アラート", "顧問先からの預かり書類の抜け漏れ防止。法定期限の遅延は色で把握"],
  ["書類の自動作成（12種）", "36協定・雇用契約書・就業規則の変更届・委任状などの差し込み"],
  ["請求パターン＋入金のCSV突合", "顧問料（月額）＋スポット報酬の請求と、入金消込"],
].forEach(([a, b], i) => {
  const y = A4 + 47 + i * 12.6;
  T(a, MAPX + 20, y, 200, 12, { size: 8, color: INK, lsm: 1.0 });
  T("→", MAPX + 224, y, 16, 12, { size: 8, color: CU, lsm: 1.0 });
  T(b, MAPX + 242, y, MAPW - 262, 12, { size: 8, color: BODY, lsm: 1.0 });
});

// ---- FOOTER BAND : company -------------------------------------------
box(0, 628, 1280, 92, INK);
const pair = (label, value, last) => [
  { text: label + " ", options: { fontSize: 8, color: MUTE } },
  { text: value, options: { fontSize: 9.5, color: W } },
  ...(last ? [] : [{ text: "　｜　", options: { fontSize: 9, color: "434A52" } }]),
];
s.addText([
  { text: "会社概要　", options: { fontSize: 10, color: CU2, bold: true } },
  ...pair("会社名", "株式会社CONGEN"), ...pair("代表者", "福島 優（Fukushima Suguru）"),
  ...pair("設立", "2024年12月"), ...pair("事業", "AIソリューション開発／AIアバター事業", true),
], { x: P(M), y: P(650), w: P(CW), h: P(16), fontFace: F, margin: 0, lineSpacingMultiple: 1.1 });
s.addText([
  ...pair("特徴", "企業課題を解くAIを自社開発・実装"),
  ...pair("実装実績", "大手リース会社・京セラ等との取引実績。京都市の課題解決にもAIを活用", true),
], { x: P(M), y: P(672), w: P(CW), h: P(16), fontFace: F, margin: 0, lineSpacingMultiple: 1.1 });
T("創業2か月でIBMスタートアップアクセラ採択　／　IVS登壇・京セラ賞受賞　／　京都市補助金採択", M, 694, 780, 13, { size: 8.5, color: CU2, lsm: 1.1 });
T("稼働環境：Azure（東京）　／　AIはClaudeを利用", 860, 694, CW - 816, 13, { size: 8, color: MUTE, align: "right", lsm: 1.1 });

pres.writeFile({ fileName: process.argv[2] }).then((f) => console.log("wrote", f));

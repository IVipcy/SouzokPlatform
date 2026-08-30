/**
 * 金融機関マスタ（相続手続き）。
 *
 * docs/old/金融機関マスタ_相続手続き.xlsx を写したもの。主要18行。
 * タスクを作るときの注意喚起と、タスク詳細の案内帯に使う。
 *
 * 大事な前提：
 *   ・戸籍要件は公開情報からの下書きで、半分は「要確認」。可否を機械が決めるほど確かではない。
 *     だから止める判断には使わず、人に見せて判断してもらう材料として使う。
 *   ・18行しかない。地銀・信金の多くは載っていない。当たらないのが普通。
 *   ・実務で確かめた内容はここを直していく（行が増えたらマスタ画面＋DBへ移す）。
 *
 * 戸籍要件の凡例
 *   不要   … 戸籍が揃う前でも請求できる
 *   一部   … 死亡と相続人が分かる戸籍でよい
 *   全部   … 出生〜死亡の連続戸籍が要る（多くは法定相続情報一覧図で代替できる）
 *   要確認 … 公式に明記がない
 */

export type KosekiRequirement = {
  /** 不要 / 一部 / 全部 / 要確認 */
  level: '不要' | '一部' | '全部' | '要確認'
  /** かっこ書きの補足（範囲や例外） */
  note: string
}

export type FinancialInstitution = {
  name: string
  kind: string
  counter: string
  sendTo: string
  contact: string
  legalInfoOk: string
  formName: string
  balanceCert: KosekiRequirement
  cancel: KosekiRequirement
  leadTime: string
  online: string
  confidence: string
  sourceUrl: string
  note: string
}

export const FINANCIAL_INSTITUTIONS: FinancialInstitution[] = [
  {
    name: "三菱UFJ銀行",
    kind: "メガバンク",
    counter: "相続オフィス（テレビ窓口経由でも接続）",
    sendTo: "取引店または相続オフィス（専用郵送先は要確認）",
    contact: "相続オフィス 0120-39-1034（平日9:00-16:00）／Web受付24h",
    legalInfoOk: "可（認証文付き一覧図写しで戸籍提出は原則不要）",
    formName: "相続届／相続関係届書",
    balanceCert: { level: "要確認", note: "" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員。遺言執行者等で一部省略可" },
    leadTime: "要確認（第三者情報では2～3週間）",
    online: "あり（Web連絡24h・完結ではない）",
    confidence: "一部推定",
    sourceUrl: "https://www.bk.mufg.jp/tsukau/tetsuduki/sozoku/shorui.html\nhttps://www.bk.mufg.jp/tsukau/tetsuduki/sozoku/flow.html",
    note: "残高証明の戸籍範囲と標準日数は公式非明記のため要確認",
  },
  {
    name: "三井住友銀行",
    kind: "メガバンク",
    counter: "相続センター",
    sendTo: "取引店・最寄支店（専用郵送先は要確認）",
    contact: "相続センター 0120-506-177（平日9-17）／Web受付",
    legalInfoOk: "可（一覧図写し=作成日から1年以内）",
    formName: "相続に関する依頼書 ◯",
    balanceCert: { level: "一部", note: "死亡日基準・死亡と相続権が確認できる戸籍or一覧図＋印鑑証明。範囲詳細は要確認" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員。一覧図代替可" },
    leadTime: "要確認（残高証明の郵送は1～10日の第三者情報）",
    online: "あり（Web受付・来店予約。完結ではない）",
    confidence: "一部推定",
    sourceUrl: "https://www.smbc.co.jp/kojin/souzoku/tetsuzuki/\nhttps://www.smbc.co.jp/kojin/souzoku/",
    note: "一覧図は作成1年以内。残高証明の戸籍範囲・標準日数は公式非明記",
  },
  {
    name: "みずほ銀行",
    kind: "メガバンク",
    counter: "相続センター（取引店でも受付）",
    sendTo: "取引店・最寄店（専用郵送先は要確認）",
    contact: "相続センター（電話番号は要確認）／来店予約・WEB遺産整理",
    legalInfoOk: "可（認証文付き一覧図写しで戸籍提出は原則不要）",
    formName: "相続関係届書",
    balanceCert: { level: "一部", note: "死亡確認戸籍＋相続権利者が確認できる戸籍・審判書等。提出後約2週間で郵送" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員が原則。本文明記が限定的で要確認" },
    leadTime: "要確認（残高証明の郵送は約2週間）",
    online: "一部（WEB遺産整理・来店予約。完結ではない）",
    confidence: "一部推定",
    sourceUrl: "https://www.mizuhobank.co.jp/tetsuduki/souzoku/index.html\nhttps://www.mizuhobank.co.jp/tetsuduki/souzoku/zandaka.html",
    note: "相続センターの電話番号・解約の戸籍範囲詳細・標準日数は要確認",
  },
  {
    name: "りそな銀行",
    kind: "大手（りそなG共通）",
    counter: "相続センター（残高証明・明細は取引店対応）",
    sendTo: "取引店（依頼書を取引店へ提出/郵送・連絡から4ヶ月以内が目安）",
    contact: "相続センター（電話番号は要確認）／取引店窓口",
    legalInfoOk: "可（一覧図写しを相続手続の証明に利用可）",
    formName: "相続手続依頼書 ◯",
    balanceCert: { level: "一部", note: "死亡確認書類〈除籍謄本等〉＋手続者の相続権確認書類＋印鑑証明6ヶ月以内・実印" },
    cancel: { level: "全部", note: "除籍・出生～死亡戸籍＋相続人全員戸籍＋印鑑証明6ヶ月。一覧図代替可" },
    leadTime: "要確認",
    online: "一部（WEB含む遺産整理業務。通常は取引店提出/郵送中心）",
    confidence: "一部推定",
    sourceUrl: "https://www.resonabank.co.jp/kojin/faq/sozoku/\nhttps://www.resonabank.co.jp/kojin/isan/pdf/tetuduki.pdf",
    note: "埼玉りそな・関西みらい・みなと銀行と共通手続。残高証明は取引店対応。電話番号・標準日数は要確認",
  },
  {
    name: "三菱UFJ信託銀行",
    kind: "信託銀行",
    counter: "相続センター／相続手続きWEB受付（支店・信託窓口でも）",
    sendTo: "要確認（担当店・相続関連部署宛。一律の送付先住所は明記なし）",
    contact: "取引店・相続センターへ電話/来店 or WEB受付",
    legalInfoOk: "可（一覧図写しで全戸籍の提出は原則不要）",
    formName: "相続手続依頼書（兼同意書）◯",
    balanceCert: { level: "要確認", note: "非公式：死亡が分かる戸籍＋請求者が相続人と分かる戸籍" },
    cancel: { level: "全部", note: "出生～死亡連続。一覧図写しで代替可" },
    leadTime: "要確認（公式：全書類提出後3ヶ月程度で相続手続全体完了想定。払戻日数は明記なし）",
    online: "あり（相続手続きWEB受付・書類請求サイト）",
    confidence: "一部推定",
    sourceUrl: "https://www.tr.mufg.jp/shisan/souzoku_iroha/tetsuduki.html",
    note: "所定様式=相続手続依頼書（兼同意書）。全体完了目安=書類提出後3ヶ月程度",
  },
  {
    name: "三井住友信託銀行",
    kind: "信託銀行",
    counter: "各店舗窓口／相続WEB受付サービス",
    sendTo: "要確認（取扱店・相続関連部署宛。一律の送付先住所は明記なし）",
    contact: "店舗窓口・電話 or 相続WEB受付",
    legalInfoOk: "可（一覧図原本の提出で戸籍は原則不要）",
    formName: "相続届",
    balanceCert: { level: "要確認", note: "残高証明は財産目録・相続税申告用に店舗発行、手数料220円〜" },
    cancel: { level: "全部", note: "遺言・協議書がない場合は出生～死亡連続＋相続人全員印鑑証明。一覧図代替可" },
    leadTime: "要確認（明記なし）",
    online: "あり（相続WEB受付サービス）",
    confidence: "一部推定",
    sourceUrl: "https://www.smtb.jp/personal/procedure/inheritance",
    note: "相続方法で必要書類・相続届の署名者が異なる。全書類は原本提出",
  },
  {
    name: "みずほ信託銀行",
    kind: "信託銀行",
    counter: "相続オフィス／取引店・各支店窓口",
    sendTo: "要確認（相続オフィスから書類→返送。一律の送付先住所は明記なし）",
    contact: "取引店・支店へ電話/来店（相続WEB受付案内あり）",
    legalInfoOk: "可（認証文付き一覧図写しで全戸籍の提出は原則不要）",
    formName: "相続届兼委任状 ◯",
    balanceCert: { level: "要確認", note: "残高証明は取引店で発行、所定手数料。戸籍範囲は明記なし" },
    cancel: { level: "全部", note: "16歳〈婚姻〉～死亡戸籍＋相続関係特定の全戸籍＋相続人全員印鑑証明6ヶ月以内。一覧図代替可" },
    leadTime: "要確認（明記なし）",
    online: "一部（相続WEB受付案内。手続は郵送中心）",
    confidence: "一部推定",
    sourceUrl: "https://www.mizuho-tb.co.jp/toukousouzoku/index.html",
    note: "所定様式=相続届兼委任状。残高証明は専用の発行依頼ページあり",
  },
  {
    name: "ゆうちょ銀行",
    kind: "ゆうちょ",
    counter: "貯金窓口（実務処理は貯金事務センター）",
    sendTo: "管轄の貯金事務センター（相続確認表提出後、必要書類のご案内が郵送。書類はセンター宛に提出）",
    contact: "相続コールセンター 0120-312-279（平日9-17）／貯金窓口・相続Web案内・ゆうちょ手続きアプリ",
    legalInfoOk: "可（認証文付き一覧図写し原本を戸籍に代えて提出可）",
    formName: "相続確認表 → 貯金等相続手続請求書（払戻）／貯金残高証明請求書（残高証明）◯",
    balanceCert: { level: "要確認", note: "非公式：死亡が分かる戸籍＋請求者が相続人と分かる戸籍。手数料1,100円" },
    cancel: { level: "全部", note: "婚姻〈未婚は16歳〉～死亡の連続戸籍。一覧図写しで代替可" },
    leadTime: "要確認（公式：必要書類提出後 支払方法により1～4週間。書類案内までに提出後1～2週間）",
    online: "一部（相続Web案内・アプリで案内/書類作成可。原則2回の窓口来店）",
    confidence: "一部推定",
    sourceUrl: "https://www.jp-bank.japanpost.jp/tetuzuki/souzoku/tzk_szk_flow.html",
    note: "独自様式：相続確認表→必要書類のご案内→貯金等相続手続請求書。払戻は必要書類提出後1～4週間",
  },
  {
    name: "横浜銀行",
    kind: "地方銀行",
    counter: "相続サポートセンター／テレビ窓口設置店（神奈川・東京、予約制）",
    sendTo: "Web受付で指定した書類送付先へ当行から郵送（固定送付先は明記なし）",
    contact: "お取引店へ電話 or Web受付（24時間365日）",
    legalInfoOk: "可（一覧図の提出で手続が円滑と明記。戸籍代替可）",
    formName: "相続手続依頼書・受取書 等",
    balanceCert: { level: "一部", note: "死亡確認戸籍＋請求者が相続人等と確認できる戸籍。出生～死亡連続は残高証明のみでは必須と明記なし" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員が原則。一覧図代替可" },
    leadTime: "要確認（明記なし）",
    online: "あり（Web受付24h365日）",
    confidence: "一部推定",
    sourceUrl: "https://www.boy.co.jp/kojin/souzoku/flow.html",
    note: "地元神奈川の主力行。Web受付・一覧図の扱いは公式明記",
  },
  {
    name: "きらぼし銀行",
    kind: "地方銀行",
    counter: "遺産整理・相続窓口（相続専用ダイヤル）／Web受付",
    sendTo: "電話・Web連絡後、指定住所へ相続手続のご案内・相続届を郵送（固定送付先は明記なし）",
    contact: "相続専用ダイヤル 0120-860-984（平日9-17）／Web受付",
    legalInfoOk: "可（認証文付き一覧図写し原本を出生～死亡連続戸籍の代替に利用可と明記）",
    formName: "相続手続依頼書",
    balanceCert: { level: "要確認", note: "書類ページは解約・名義変更中心。残高証明のみの戸籍範囲は明記なし" },
    cancel: { level: "全部", note: "出生～死亡連続＋全法定相続人戸籍。一覧図写しで代替可" },
    leadTime: "要確認（明記なし）",
    online: "あり（Web受付で連絡・書類案内）",
    confidence: "一部推定",
    sourceUrl: "https://www.kiraboshibank.co.jp/sonaeru/yuigon-isan/heir/index.html",
    note: "東京の地銀。一覧図の代替可・依頼書必須は公式明記",
  },
  {
    name: "千葉銀行",
    kind: "地方銀行",
    counter: "相続オフィス（来店・WEB面談予約に対応）",
    sendTo: "取引店・相続オフィス経由（固定郵送センター住所は明記なし）",
    contact: "相続オフィス 0120-607-889／来店・WEB面談予約",
    legalInfoOk: "可（認証文付き一覧図写しで代替可。主に第三者解説・公式本文の明示は未確認）",
    formName: "相続手続依頼書",
    balanceCert: { level: "一部", note: "被相続人・相続人戸籍 or 一覧図写しで請求可。残高証明のみの必須範囲は公式明記なし=第三者情報" },
    cancel: { level: "全部", note: "出生～死亡連続除籍＋相続人全員の現在戸籍が原則" },
    leadTime: "要確認（明記なし）",
    online: "一部（WEB面談・来店予約あり。Web完結受付は公式で確認できず）",
    confidence: "一部推定",
    sourceUrl: "https://www.chibabank.co.jp/procedure/detail/inheritance/souzoku_outline",
    note: "公式ページがJS描画で本文取得できず、一部第三者解説を含む",
  },
  {
    name: "静岡銀行",
    kind: "地方銀行",
    counter: "お取引店・最寄支店（専用センター名の記載なし）",
    sendTo: "取引店・最寄支店（固定センター住所は明記なし）",
    contact: "取引店・支店へ電話（月-金9-17）",
    legalInfoOk: "可（残高証明時に認証文付き一覧図写しで戸籍代替可。主に第三者解説・公式本文の明示は未確認）",
    formName: "相続手続依頼書（指定様式）",
    balanceCert: { level: "一部", note: "相続人からの残高証明請求時は戸籍〈除籍〉謄本が必要と明記。相続人と分かる範囲" },
    cancel: { level: "全部", note: "出生～死亡連続戸籍が必須と明記" },
    leadTime: "5営業日程度（公式明記。運用商品等がある場合はさらに要する）",
    online: "なし/不明（Web受付の明記なし）",
    confidence: "公式明記",
    sourceUrl: "https://www.shizuokabank.co.jp/personal/insurance/inheritance/service/souzoku_tetsuzuki.html",
    note: "処理日数5営業日程度・残高証明の戸籍〈除籍〉謄本・連続戸籍は公式明記（今回で最も情報が明確）",
  },
  {
    name: "常陽銀行",
    kind: "地方銀行",
    counter: "手続きセンター（必要書類を郵送で受付）",
    sendTo: "常陽銀行 手続きセンター（郵送。住所は案内書類に記載。公式サイトの明記は未確認）",
    contact: "取引店への連絡／相続案内窓口（公式本文未取得・連絡方法は要確認）",
    legalInfoOk: "可（残高証明等で認証文付き一覧図写しで戸籍代替可。第三者中心・公式未確認）",
    formName: "相続手続依頼書",
    balanceCert: { level: "一部", note: "被相続人・相続人戸籍 or 一覧図写しで請求可。残高証明のみの必須範囲は公式明記なし=第三者情報" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員が原則" },
    leadTime: "約2週間（全書類提出・確認後 約2週間で入金。第三者中心）",
    online: "不明（郵送中心。Web完結の有無は公式で確認できず）",
    confidence: "一部推定",
    sourceUrl: "https://www.joyobank.co.jp/personal/souzoku/",
    note: "公式ページがWebFetch拒否で本文取得できず、第三者解説を含む。連絡先の詳細は要確認",
  },
  {
    name: "福岡銀行",
    kind: "地方銀行",
    counter: "相続センター（取引店窓口でも受付）",
    sendTo: "取引店・相続センター宛（郵送先住所は明記なし・要確認）",
    contact: "相続センター 0120-123-823（平日9:00-15:45）／来店予約Web",
    legalInfoOk: "可（残高証明で認証文付き一覧図写しが戸籍代替と明記。解約等の完全代替可否は要確認）",
    formName: "相続手続依頼書",
    balanceCert: { level: "一部", note: "請求者が相続人と確認できる戸籍。一覧図写しでも可" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員。遺言・協議書の有無で変動" },
    leadTime: "要確認（明記なし。残高証明の郵送は受付から約7～10日）",
    online: "一部（来店予約Web。書類は店頭・郵送中心）",
    confidence: "一部推定",
    sourceUrl: "https://www.fukuokabank.co.jp/personal/service/souzoku03/",
    note: "戸籍・印鑑証明は発行後6ヶ月以内。相続手続基本パック等あり。電話番号は利用前に公式で再確認",
  },
  {
    name: "京都銀行",
    kind: "地方銀行",
    counter: "相続専用ダイヤル／相続・資産承継ご相談プラザ",
    sendTo: "銀行から届く返信用封筒で送付（専用送付先は明記なし・要確認）",
    contact: "相続専用ダイヤル 075-585-5138（平日9-17）／電話・Web・来店",
    legalInfoOk: "可（戸籍謄本 or 認証文付き一覧図写しのいずれかで可と明記）",
    formName: "相続手続依頼書",
    balanceCert: { level: "要確認", note: "残高証明の戸籍範囲は公式に明記なし" },
    cancel: { level: "全部", note: "出生～死亡連続＋相続人全員。一覧図代替可" },
    leadTime: "要確認（明記なし）",
    online: "あり（相続手続きWeb受付・来店不要24h提出可と明記）",
    confidence: "一部推定",
    sourceUrl: "https://www.kyotobank.co.jp/kojin/souzoku/tetsuduki/flow/",
    note: "5ステップ（届出→書類受取→準備→提出→払戻）。Web受付・一覧図代替は公式明記",
  },
  {
    name: "広島銀行",
    kind: "地方銀行",
    counter: "相続オフィス（専用ダイヤル）",
    sendTo: "相続オフィス宛と思われるが郵送先住所は明記なし・要確認",
    contact: "相続オフィス専用ダイヤル 0120-16-1640（平日・土日9-16）",
    legalInfoOk: "可（一覧図が戸籍〈除籍〉謄本の代わりになると明記）",
    formName: "相続手続依頼書（相続人全員の連署）",
    balanceCert: { level: "要確認", note: "残高証明の戸籍範囲は公式に明記なし" },
    cancel: { level: "全部", note: "出生～死亡連続除籍＋相続人戸籍。一覧図代替可" },
    leadTime: "要確認（明記なし）",
    online: "要確認（Web完結受付は公式で確認できず。来店・電話中心）",
    confidence: "一部推定",
    sourceUrl: "https://www.hirogin.co.jp/life-event/inheritance/procedure/",
    note: "解約（現金・振込）と名義変更の2方式。土日も専用ダイヤルが受付",
  },
  {
    name: "群馬銀行",
    kind: "地方銀行",
    counter: "相続事務係／相続手続相談ダイヤル",
    sendTo: "郵送受付フォーム経由・相続事務係宛（郵送先住所は明記なし・要確認）",
    contact: "相続手続相談ダイヤル 0120-152600（平日9-17）／電話・郵送・来店",
    legalInfoOk: "可（一覧図を用意すれば戸籍謄本等は不要と明記）",
    formName: "相続手続依頼書",
    balanceCert: { level: "一部", note: "死亡確認の戸籍〈除籍〉＋申出人が相続人と確認できる戸籍" },
    cancel: { level: "全部", note: "出生～死亡連続が原則。一覧図代替可" },
    leadTime: "1～2週間（書類提出から完了まで・公式明記）",
    online: "一部（郵送受付フォーム・来店予約フォーム。Web完結は不可）",
    confidence: "一部推定",
    sourceUrl: "https://www.gunmabank.co.jp/kojin/sodan/sozoku/",
    note: "郵送の場合は指定口座への入金のみ（現金払戻不可）。処理日数1～2週間は公式明記",
  },
  {
    name: "八十二銀行",
    kind: "地方銀行",
    counter: "相続サポートセンター",
    sendTo: "相続サポートセンター宛（郵送先住所は明記なし・要確認）",
    contact: "相続サポートセンター 0120-03-9182（平日9-16）／電話・店頭〈来店予約制〉",
    legalInfoOk: "可（一覧図が戸籍謄本の代わりに利用できると明記）",
    formName: "相続に関する依頼書／相続届出書",
    balanceCert: { level: "一部", note: "死亡確認戸籍＋請求者が相続人と証明できる書類" },
    cancel: { level: "全部", note: "出生～死亡戸籍＋相続人全員。一覧図代替可" },
    leadTime: "約2週間（提出から完了の目安。一部案内では2～4週間との記載も）",
    online: "要確認（Web完結の明記なし。連絡・来店中心）",
    confidence: "一部推定",
    sourceUrl: "https://bank.82group.jp/faq/souzoku.html",
    note: "払戻手続と名義変更の2種類。残高証明は手続後おおむね1週間～10日で郵送。遺言信託あり",
  },
]

/** 表記ゆれを落とす。全角半角・空白・「株式会社」を取り除く */
const normalize = (s: string) =>
  s.normalize('NFKC').replace(/[\s\u3000]/g, '').replace(/株式会社|（株）|\(株\)/g, '')

/** 機関名らしい語。名前を引いた残りにこれが残るなら、別の機関が混ざっている */
const INSTITUTION_WORDS = /銀行|信託|証券|信用金庫|信用組合|農協|labank|ゆうちょ/i

/**
 * 案件に入力された金融機関名から、マスタの行を引く。
 *
 * 名前は自由入力なので、完全一致だけだと「みずほ銀行 渋谷支店」が引けない。
 * かといって部分一致だけにすると、「三井住友銀行信託銀行」のような打ち間違いが
 * 三井住友銀行に当たってしまう。別の機関の要件を出すのがいちばん危ない。
 *
 * そこで、名前を含んでいることに加えて「引いた残りに機関名らしい語が残らない」
 * ことを条件にする。残るときは何の機関か決められないものとして、引かない。
 */
export function matchFinancialInstitution(input: string | null | undefined): FinancialInstitution | null {
  const q = normalize((input ?? '').trim())
  if (!q) return null
  const exact = FINANCIAL_INSTITUTIONS.find(i => normalize(i.name) === q)
  if (exact) return exact
  // 長い名前から見る（「三井住友信託銀行」を「三井住友銀行」より先に当てる）
  const candidates = [...FINANCIAL_INSTITUTIONS].sort((a, b) => normalize(b.name).length - normalize(a.name).length)
  for (const i of candidates) {
    const n = normalize(i.name)
    if (!q.includes(n)) continue
    const rest = q.replace(n, '')
    if (INSTITUTION_WORDS.test(rest)) return null   // 別の機関が混ざっている＝決められない
    return i
  }
  return null
}

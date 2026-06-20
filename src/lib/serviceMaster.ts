// 自動生成（docs/業務詳細.xlsx を正規化＋既存テンプレ補完）。受注区分→業務→タスク(=作業)。
// owner 既定は全て '自社'、hint は実施者割合/備考。再生成で上書きされ得る。

import type { TabKey } from '@/components/features/cases/CaseTabs'

// 「紹介のみ」は自社手続きなしの区分（業務・作業は持たず、他事業者紹介で紹介先を埋める）。
export const ORDER_CATEGORIES = ['手続き一式','登記','遺言','信託','放棄','調停','検認','後見','契約書','執行','紹介のみ'] as const
// 自社で行う相続手続きが無い区分（業務・作業を出さず、紹介先入力に切り替える）
export const REFERRAL_ONLY_CATEGORY = '紹介のみ'
export type OrderCategory = (typeof ORDER_CATEGORIES)[number]

export const GYOMU_TAB: Record<string, TabKey | undefined> = {
  '戸籍': 'deceased',
  '相関図': 'deceased',
  '法定相続情報取得': 'deceased',
  '不動産': 'assets',
  '金融資産': 'assets',
  '目録': 'assets',
  '協議書': 'division',
  '登記': 'registration',
  '解約': 'cancellation',
  '手紙': undefined,
  '遺言作成': 'will',
  '信託契約書作成': 'trust',
  '放棄手続き': 'renunciation',
  '調停手続き': 'mediation',
  '検認手続き': 'probate',
  '後見手続き': 'guardianship',
  '契約書作成': 'contractProc',
  '執行通知': undefined,
}
export const GYOMU_ALL = ['戸籍', '相関図', '法定相続情報取得', '不動産', '金融資産', '目録', '協議書', '登記', '解約', '手紙', '遺言作成', '信託契約書作成', '放棄手続き', '調停手続き', '検認手続き', '後見手続き', '契約書作成', '執行通知']

// kind: 作業の性質。
//   'task'（既定）= やる作業＝タスクで進捗管理。
//   'doc'        = 受領する資料（到着物）＝受信簿連動で受領管理（受領自体はタスクではない）。
// オーダーシート作成時にユーザーが上書きできる前提の「初期値」。
export type ServiceKind = 'task' | 'doc'
export type ServiceRow = { category: OrderCategory; gyomu: string; task: string; owner: '自社' | '依頼者'; hint?: string; kind?: ServiceKind }

export const SERVICE_ROWS: ServiceRow[] = [
  { category: '手続き一式', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: '2/3はお客さんが広域交付制度で取得' },
  { category: '手続き一式', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: '10割オーシャン' },
  { category: '手続き一式', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '手続き一式', gyomu: '相関図', task: '相関図作成', owner: '自社', hint: '9割オーシャン' },
  { category: '手続き一式', gyomu: '法定相続情報取得', task: '法定相続情報一覧図の申出・取得', owner: '自社', hint: '9割オーシャン' },
  { category: '手続き一式', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: '9割以上オーシャンさん。 / 不動産はまとめて依頼が多い' },
  { category: '手続き一式', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: '9割以上オーシャンさん。' },
  { category: '手続き一式', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: '9割以上オーシャンさん。' },
  { category: '手続き一式', gyomu: '不動産', task: '査定・鑑定の依頼', owner: '自社' },
  { category: '手続き一式', gyomu: '不動産', task: '不動産売却サポート', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '手続き一式', gyomu: '金融資産', task: '全店調査', owner: '自社' },
  { category: '手続き一式', gyomu: '金融資産', task: '残高証明取得', owner: '自社' },
  { category: '手続き一式', gyomu: '金融資産', task: '取引履歴取得', owner: '自社' },
  { category: '手続き一式', gyomu: '金融資産', task: '証券保管振替機構照会', owner: '自社' },
  { category: '手続き一式', gyomu: '金融資産', task: '保険照会', owner: '自社' },
  { category: '手続き一式', gyomu: '金融資産', task: '年金照会', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '手続き一式', gyomu: '金融資産', task: '負債調査', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '手続き一式', gyomu: '目録', task: '財産目録の作成', owner: '自社' },
  { category: '手続き一式', gyomu: '協議書', task: '遺産分割協議書の作成', owner: '自社', hint: '10割オーシャン' },
  { category: '手続き一式', gyomu: '登記', task: '相続登記の申請', owner: '自社', hint: '10割オーシャン' },
  { category: '手続き一式', gyomu: '解約', task: '預貯金の解約', owner: '自社', hint: '半々くらい依頼者がやる' },
  { category: '手続き一式', gyomu: '解約', task: '証券の移管・売却', owner: '自社', hint: '半々くらい依頼者がやる' },
  { category: '手続き一式', gyomu: '解約', task: '投資信託の解約', owner: '自社', hint: '半々くらい依頼者がやる' },
  { category: '手続き一式', gyomu: '解約', task: '自動車名義変更', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '手続き一式', gyomu: '解約', task: '保険金請求手続き', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '手続き一式', gyomu: '手紙', task: '各相続人への通知・案内文の送付', owner: '自社' },
  { category: '登記', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: '依頼者がやることが多い / 発生することはあまりない' },
  { category: '登記', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '登記', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '登記', gyomu: '相関図', task: '相関図作成', owner: '自社', hint: '半々' },
  { category: '登記', gyomu: '不動産', task: '不動産関連書類チェック', owner: '自社', hint: '依頼者がやることが多い' },
  { category: '登記', gyomu: '協議書', task: '協議書のチェック', owner: '自社' },
  { category: '登記', gyomu: '登記', task: '相続登記の申請', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン：依頼者＝6：4、7：3' },
  { category: '遺言', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '遺言', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '金融資産', task: '金融資産資料の確認', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '遺言作成', task: '遺言文案(自筆)作成', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '遺言作成', task: '遺言文案(公正証書)作成', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '遺言作成', task: '文案確認・公証役場訪問の日程調整', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '遺言作成', task: '公証役場訪問日程の共有', owner: '自社', hint: 'オーシャン' },
  { category: '遺言', gyomu: '遺言作成', task: '公正証書遺言作成', owner: '自社', hint: '依頼者、公証人の先生' },
  { category: '信託', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン：依頼者＝6：4、7：3' },
  { category: '信託', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '信託', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '金融資産', task: '金融資産資料の確認', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '信託契約書作成', task: '信託契約書案作成', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '信託契約書作成', task: '文案確認・公証役場訪問の日程調整', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '信託契約書作成', task: '公証役場訪問日程の共有', owner: '自社', hint: 'オーシャン' },
  { category: '信託', gyomu: '信託契約書作成', task: '信託契約書作成', owner: '自社', hint: '依頼者、公証人の先生' },
  { category: '信託', gyomu: '登記', task: '信託登記', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン：依頼者＝6：4、7：3 / いきなり放棄受注ケースもあるけど、手続き一式で財産調査した結果放棄になるケースが多い。' },
  { category: '放棄', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '放棄', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '金融資産', task: '金融資産資料の確認', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '放棄手続き', task: '放棄の申述書類作成', owner: '自社', hint: 'オーシャン / 家庭裁判所に提出する書類作成して、署名捺印依頼者から' },
  { category: '放棄', gyomu: '放棄手続き', task: '家庭裁判所へ申述', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '放棄手続き', task: '申述照会書受領', owner: '自社', kind: 'doc', hint: 'オーシャン / 指定できない。どっちに届くか' },
  { category: '放棄', gyomu: '放棄手続き', task: '申述照会書記載例提案', owner: '自社', hint: 'オーシャン' },
  { category: '放棄', gyomu: '放棄手続き', task: '申述照会書提出', owner: '自社', hint: '依頼者' },
  { category: '放棄', gyomu: '放棄手続き', task: '受理通知書の受領', owner: '自社', kind: 'doc', hint: '指定できない。どっちに届くか' },
  { category: '放棄', gyomu: '放棄手続き', task: '受理証明書の取得', owner: '自社', kind: 'doc', hint: 'オーシャン' },
  { category: '調停', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン：依頼者＝6：4、7：3 / もめちゃって紛争、ほとんどやらない' },
  { category: '調停', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '調停', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '調停', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '調停', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: 'オーシャン' },
  { category: '調停', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '調停', gyomu: '金融資産', task: '金融資産資料の確認', owner: '自社', hint: 'オーシャン' },
  { category: '調停', gyomu: '調停手続き', task: '調停申し立て書類の作成', owner: '自社' },
  { category: '検認', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン：依頼者＝6：4、7：3 / 自筆証書遺言があったときに、家庭裁判所に遺言書あるよお墨付きある。検認したあとに手続き一式につながる。' },
  { category: '検認', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '検認', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '検認', gyomu: '検認手続き', task: '検認の申し立て書類作成', owner: '自社', hint: 'オーシャン / 家庭裁判所に提出する書類作成して、署名捺印依頼者から' },
  { category: '検認', gyomu: '検認手続き', task: '家庭裁判所へ検認申し立て', owner: '自社', hint: 'オーシャン' },
  { category: '検認', gyomu: '検認手続き', task: '検認期日の日程調整・同行案内', owner: '自社', hint: 'オーシャン / オーシャンさんは立ち会えないけど、一緒に行ってあげることがある' },
  { category: '検認', gyomu: '検認手続き', task: '同行', owner: '自社', hint: 'オーシャン' },
  { category: '検認', gyomu: '検認手続き', task: '検認済遺言書の受領', owner: '自社', kind: 'doc', hint: 'オーシャン' },
  { category: '後見', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン：依頼者＝6：4、7：3 / 後見単体はあまりない、判断能力のない認知症の相続人の代わりの後見人を立てる' },
  { category: '後見', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社', hint: 'オーシャン' },
  { category: '後見', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '後見', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '後見', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: 'オーシャン' },
  { category: '後見', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: 'オーシャン' },
  { category: '後見', gyomu: '金融資産', task: '金融資産資料の確認', owner: '自社', hint: 'オーシャン' },
  { category: '後見', gyomu: '後見手続き', task: '後見申し立て書類の確認・取得　※診断書、親族からの同意書、状況確認書', owner: '自社', kind: 'doc' },
  { category: '後見', gyomu: '後見手続き', task: '後見の申し立て書類作成', owner: '自社', hint: 'オーシャン' },
  { category: '後見', gyomu: '後見手続き', task: '家庭裁判所へ後見申し立て', owner: '自社', hint: 'オーシャン' },
  { category: '契約書', gyomu: '契約書作成', task: '関係書類取得', owner: '自社' },
  { category: '契約書', gyomu: '契約書作成', task: '契約書類作成', owner: '自社' },
  { category: '執行', gyomu: '戸籍', task: '戸籍収集（請求・取得）', owner: '自社', hint: 'オーシャン' },
  { category: '執行', gyomu: '戸籍', task: '戸籍到着確認・チェック', owner: '自社' },
  { category: '執行', gyomu: '戸籍', task: '追加戸籍請求', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '執行', gyomu: '執行通知', task: '執行人通知', owner: '自社', hint: '相続人住所が分かった時点で、相続人確定した時点で、執行人ですよ。通知' },
  { category: '執行', gyomu: '相関図', task: '相関図作成', owner: '自社', hint: '9割オーシャン' },
  { category: '執行', gyomu: '法定相続情報取得', task: '法定相続情報一覧図の申出・取得', owner: '自社', hint: '9割オーシャン' },
  { category: '執行', gyomu: '不動産', task: '名寄帳請求', owner: '自社', hint: '9割以上オーシャンさん。不動産はまとめて依頼が多い' },
  { category: '執行', gyomu: '不動産', task: '登記事項証明の取得', owner: '自社', hint: '9割以上オーシャンさん。不動産はまとめて依頼が多い' },
  { category: '執行', gyomu: '不動産', task: '固定資産評価証明の取得', owner: '自社', hint: '9割以上オーシャンさん。不動産はまとめて依頼が多い' },
  { category: '執行', gyomu: '不動産', task: '査定・鑑定の依頼', owner: '自社' },
  { category: '執行', gyomu: '不動産', task: '不動産売却サポート', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '執行', gyomu: '金融資産', task: '全店調査', owner: '自社' },
  { category: '執行', gyomu: '金融資産', task: '残高証明取得', owner: '自社' },
  { category: '執行', gyomu: '金融資産', task: '取引履歴取得', owner: '自社' },
  { category: '執行', gyomu: '金融資産', task: '証券保管振替機構照会', owner: '自社' },
  { category: '執行', gyomu: '金融資産', task: '保険照会', owner: '自社' },
  { category: '執行', gyomu: '金融資産', task: '年金照会', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '執行', gyomu: '金融資産', task: '負債調査', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '執行', gyomu: '目録', task: '財産目録の作成', owner: '自社' },
  { category: '執行', gyomu: '協議書', task: '遺産分割協議書の作成', owner: '自社', hint: '10割オーシャン' },
  { category: '執行', gyomu: '登記', task: '相続登記の申請', owner: '自社', hint: '10割オーシャン' },
  { category: '執行', gyomu: '解約', task: '預貯金の解約', owner: '自社', hint: '半々くらい依頼者がやる' },
  { category: '執行', gyomu: '解約', task: '証券の移管・売却', owner: '自社', hint: '半々くらい依頼者がやる' },
  { category: '執行', gyomu: '解約', task: '投資信託の解約', owner: '自社', hint: '半々くらい依頼者がやる' },
  { category: '執行', gyomu: '解約', task: '自動車名義変更', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '執行', gyomu: '解約', task: '保険金請求手続き', owner: '自社', hint: '既存テンプレより（細かい手順）' },
  { category: '執行', gyomu: '手紙', task: '各相続人への通知・案内文の送付', owner: '自社' },
]

export function gyomuFor(category: string): string[] {
  const seen = new Set<string>(); const list: string[] = []
  for (const r of SERVICE_ROWS) if (r.category === category && !seen.has(r.gyomu)) { seen.add(r.gyomu); list.push(r.gyomu) }
  return list
}
export function tasksFor(category: string, gyomu: string): ServiceRow[] {
  return SERVICE_ROWS.filter(r => r.category === category && r.gyomu === gyomu)
}

// 作業の性質（kind未指定は 'task' 既定）。
export function kindOf(row: Pick<ServiceRow, 'kind'>): ServiceKind {
  return row.kind ?? 'task'
}
// 資料（受領管理）の行だけ抽出。
export function docRowsFor(category: string, gyomu: string): ServiceRow[] {
  return tasksFor(category, gyomu).filter(r => kindOf(r) === 'doc')
}
// タスク（進捗管理）の行だけ抽出。
export function taskRowsFor(category: string, gyomu: string): ServiceRow[] {
  return tasksFor(category, gyomu).filter(r => kindOf(r) === 'task')
}

// === 複数受注区分（順番つき）対応 ===
// 検認は「検認単独」または「検認①→手続き一式②」のコンボのみ複数可（業務途中で移行するケース）。
// 検認②に手続き一式を足すと戸籍等が重複するため、重複業務は先の区分（検認）を優先し、後の区分では出さない。
export const KENIN_CATEGORY = '検認'
export const KENIN_COMBO_SECONDARY = '手続き一式'

/** 受注区分の配列（①②…順）。primary＋任意のsecondary。null/空は除外。 */
export function categoriesOf(primary: string | null | undefined, secondary: string | null | undefined): string[] {
  return [primary, secondary].filter((c): c is string => !!c)
}
/** 複数区分の業務を①②順で結合し、重複業務は先勝ちで1回だけ。 */
export function gyomuForCategories(categories: string[]): string[] {
  const seen = new Set<string>(); const list: string[] = []
  for (const c of categories) for (const g of gyomuFor(c)) if (!seen.has(g)) { seen.add(g); list.push(g) }
  return list
}
/** 業務の作業を、その業務を最初に含む区分（①優先）から取る。 */
export function tasksForCategories(categories: string[], gyomu: string): ServiceRow[] {
  for (const c of categories) { const t = tasksFor(c, gyomu); if (t.length) return t }
  return []
}
/** 複数区分から役割分担(intake_roles)の初期値を生成（全作業・担当=自社、重複業務は先勝ち）。
 *  kind（資料/タスク）の初期値もマスタから載せる（オーダーシートで上書き可）。 */
export function seedRolesForCategories(categories: string[]): { gyomu: string; sagyou: string; owner: string; note: string; kind: ServiceKind }[] {
  return gyomuForCategories(categories).flatMap(g =>
    tasksForCategories(categories, g).map(t => ({ gyomu: g, sagyou: t.task, owner: '自社', note: '', kind: kindOf(t) })),
  )
}
/** 区分×業務×作業名 から kind（資料/タスク）の初期値を引く。未知の作業は task。 */
export function kindForTask(categories: string[], gyomu: string, sagyou: string): ServiceKind {
  const row = tasksForCategories(categories, gyomu).find(t => t.task === sagyou)
  return row ? kindOf(row) : 'task'
}

// === 区分非依存の業務（経理・相続税）。受注区分に関係なく使う ===
// 旧 task_templates(DB) にしか無かった作業を作業マスタへ統合（生成元の一本化）。
// SERVICE_ROWS は受注区分(category)キーだが、経理/相続税は区分非依存のため別配列で持つ。
export const CROSS_GYOMU = ['経理', '相続税'] as const
export type CrossGyomu = (typeof CROSS_GYOMU)[number]
export type CrossServiceRow = { gyomu: CrossGyomu; task: string; owner: '自社' | '依頼者'; kind?: ServiceKind; hint?: string }

export const CROSS_SERVICE_ROWS: CrossServiceRow[] = [
  // 経理（精算・請求・入金・送金・納品・クローズ）。旧テンプレ distribution_calc 等。
  { gyomu: '経理', task: '分配金計算書作成', owner: '自社', kind: 'task' },
  { gyomu: '経理', task: '報酬請求書作成', owner: '自社', kind: 'task' },
  { gyomu: '経理', task: '入金確認', owner: '自社', kind: 'task' },
  { gyomu: '経理', task: '分配金送金実行', owner: '自社', kind: 'task' },
  { gyomu: '経理', task: '納品書類一式作成', owner: '自社', kind: 'task' },
  { gyomu: '経理', task: '案件クローズ処理', owner: '自社', kind: 'task' },
  // 相続税（税理士連携）。旧テンプレ tax_required_check 等。
  { gyomu: '相続税', task: '相続税申告要否判定', owner: '自社', kind: 'task' },
  { gyomu: '相続税', task: '相続税申告書類準備', owner: '自社', kind: 'task' },
  { gyomu: '相続税', task: '税理士への引継ぎ', owner: '自社', kind: 'task' },
]

// 作業名 → 既存タスクテンプレ(task_templates)のキー。
// 生成元は実施タスク(intake_roles)に一本化したが、手順(procedure_text)は既存テンプレ本文を流用する。
// 対応があるものだけ手順が付く（「入れられる部分だけ」）。
export const PROCEDURE_TEMPLATE_KEY: Record<string, string> = {
  '戸籍収集（請求・取得）': 'koseki_request_create',
  '戸籍到着確認・チェック': 'koseki_arrive_check',
  '法定相続情報一覧図の申出・取得': 'family_tree_create',
  '名寄帳請求': 'realestate_research',
  '登記事項証明の取得': 'realestate_research',
  '固定資産評価証明の取得': 'realestate_research',
  '査定・鑑定の依頼': 'realestate_appraisal',
  '残高証明取得': 'bank_balance_request',
  '証券保管振替機構照会': 'securities_inquiry',
  '保険照会': 'insurance_inquiry',
  '財産目録の作成': 'asset_list_create',
  '遺産分割協議書の作成': 'division_draft',
  '相続登記の申請': 'touki_submit',
  '預貯金の解約': 'bank_cancel_request',
  '証券の移管・売却': 'securities_cancel',
  // 区分非依存（経理・相続税）
  '分配金計算書作成': 'distribution_calc',
  '報酬請求書作成': 'invoice_create',
  '納品書類一式作成': 'delivery_create',
  '税理士への引継ぎ': 'tax_accountant_handoff',
}

export const CROSS_GYOMU_TAB: Record<string, TabKey | undefined> = { '経理': 'contract', '相続税': undefined }
export function crossTasksFor(gyomu: string): CrossServiceRow[] {
  return CROSS_SERVICE_ROWS.filter(r => r.gyomu === gyomu)
}
// 後方互換: 作業名の配列（CROSS_SERVICE_ROWS から導出）。
export const KEIZAI_TASKS: string[] = crossTasksFor('経理').map(r => r.task)
export const ZEIRISHI_TASKS: string[] = crossTasksFor('相続税').map(r => r.task)

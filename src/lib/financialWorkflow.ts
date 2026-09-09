// 金融財産調査の「状態」を入力値から出す。画面には書かない。
//
// 入力画面、右上の「次の対応」、対応待ち、状況（バッジ）は、ここが返す同じ判定から描く。
// 別々に条件式を持たせると必ず食い違うため（docs: 金融財産調査システム_設計思想 5）。
//
// タスクは作らない。ここが返すのは「いま社内で手をつけられること」の一覧で、DBには書かない。
// 到着待ち・回答待ちは状況として返すが、対応待ちには入れない（今やれないので）。
//
// 進捗％は出さない（工程数が郵送・来店で違い、％が実態と合わないため）。

import type {
  FinancialInstitutionRow, FinancialRequestRow, FinancialRequestItemRow, SecuritiesHoldingRow, CaseRow,
} from '@/types'

export const INSTITUTION_KINDS = ['預金', '証券', '株主名簿管理人', 'ほふり'] as const
export const FORM_SOURCES = ['未確認', '社内在庫', '金融機関へ請求', '窓口で受け取る'] as const
/** 画面の言い方（値は変えない） */
export const FORM_SOURCE_LABEL: Record<string, string> = { '未確認': '—', '社内在庫': '社内在庫あり', '金融機関へ請求': '銀行から送ってもらう', '窓口で受け取る': '窓口で受け取る' }
export const SEARCH_METHOD_LABEL: Record<string, string> = { '未確認': '—', '電話回答': '電話で回答あり', '要原本確認': '原本の提出が必要', '要請求': '調査依頼書の提出が必要' }
export const SEARCH_METHODS = ['未確認', '電話回答', '要原本確認', '要請求'] as const
export const SUBMISSION_METHODS = ['未確認', '郵送', '来店'] as const
export const HANDLING_METHODS = ['未確認', '郵送', '来店'] as const
export const SEARCH_TARGETS = ['預金', '投資信託', '貸金庫', '共済'] as const
export const IRREGULAR_STATUSES = ['正常', '要確認', '再請求中'] as const
export const IRREGULAR_TYPES = ['書類・内容不足', '対象口座・指定日の相違', '記載内容が不明', 'その他'] as const
export const JASDEC_KNOWN = ['判明済み', '一部判明', '不明', '調査不要'] as const
/** ほふり開示結果の機関の区分と口座の種類 */
export const JASDEC_RESULT_KINDS = ['証券会社', '株主名簿管理人'] as const
export const JASDEC_ACCOUNT_KINDS = ['取引口座', '特別口座', 'その他'] as const
/** よくある株主名簿管理人（入力候補）。東京証券代行・日本証券代行は三井住友信託銀行に名寄せ */
export const KNOWN_ADMINISTRATORS = ['三井住友信託銀行', '三菱UFJ信託銀行', 'みずほ信託銀行', '日本カストディ銀行', 'アイ・アールジャパン'] as const
export const HOLDING_KINDS = ['国内株式', 'ETF・REIT', '投資信託', '債券', '外国証券', 'その他'] as const
export const ADMIN_STATUSES = ['未特定', '特定済', '対象外'] as const
export const REQUEST_NEEDS = ['未判断', '請求要', '請求不要'] as const
/** 預金・証券の請求書類 */
export const DEPOSIT_DOC_TYPES = ['残高証明', '取引履歴'] as const
export const SECURITIES_DOC_TYPES = ['残高証明', '顧客勘定元帳', '年間取引報告書'] as const
/** 株主名簿管理人への請求書類 */
export const ADMIN_DOC_TYPES = ['所有株式数証明書', '未受領配当金明細書', '配当金支払明細書', '株式異動証明書'] as const

/** 株主名簿管理人の名寄せ。東京証券代行・日本証券代行は三井住友信託銀行に統合されている。 */
export function canonicalAdministratorName(value: string): string {
  const v = value.replace(/株式会社/g, '').replace(/\s/g, '').trim()
  if (v.includes('東京証券代行') || v.includes('日本証券代行')) return '三井住友信託銀行'
  return value.replace(/株式会社/g, '').replace(/（証券代行部）/g, '').trim()
}

const addMonths = (ymd: string, months: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}
const subtractDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000)

// ── 印鑑登録証明書（案件に1つ） ────────────────────────────────
export type SealStatus = { status: '未登録' | '有効' | '期限間近' | '期限切れ'; expiry: string | null; daysLeft: number | null }

export function sealCertificateStatus(c: Pick<CaseRow, 'seal_cert_oldest_issue_date' | 'seal_cert_validity_months' | 'seal_cert_custom_expiry'>, today: string): SealStatus {
  if (!c.seal_cert_oldest_issue_date) return { status: '未登録', expiry: null, daysLeft: null }
  const expiry = c.seal_cert_validity_months ? addMonths(c.seal_cert_oldest_issue_date, c.seal_cert_validity_months) : (c.seal_cert_custom_expiry ?? null)
  if (!expiry) return { status: '未登録', expiry: null, daysLeft: null }
  const daysLeft = daysBetween(today, expiry)
  return { status: daysLeft < 0 ? '期限切れ' : daysLeft <= 30 ? '期限間近' : '有効', expiry, daysLeft }
}

/** 原本の所在。「原本を出していて、まだ返却日が無い請求」の銀行名。選ばせず、請求の事実から出す */
export type SealOriginalOut = { institutionName: string; sentDate: string | null }
export function sealOriginalStatus(
  copies: number | null,
  requests: Array<Pick<FinancialRequestRow, 'institution_id' | 'request_date' | 'seal_original_sent' | 'seal_original_returned_date'>>,
  institutions: Array<Pick<FinancialInstitutionRow, 'id' | 'name'>>,
): { out: SealOriginalOut[]; inHand: number | null } {
  const nameOf = new Map(institutions.map(i => [i.id, i.name]))
  const out = requests
    .filter(r => r.seal_original_sent && !r.seal_original_returned_date)
    .map(r => ({ institutionName: nameOf.get(r.institution_id) ?? '（調査先不明）', sentDate: r.request_date }))
  return { out, inHand: copies == null ? null : Math.max(0, copies - out.length) }
}

// ── 調査禁止（お客様の「まだ調べないで」） ──────────────────────
export function isSurveyOnHold(i: Pick<FinancialInstitutionRow, 'survey_prohibited_designation' | 'survey_prohibited_method' | 'survey_prohibited_start' | 'survey_prohibited_end' | 'prohibition_released_at'>, today: string): boolean {
  if ((i.survey_prohibited_designation ?? '') !== '指定あり') return false
  if (i.prohibition_released_at) return false
  if ((i.survey_prohibited_method ?? '') === '期間指定') {
    const end = i.survey_prohibited_end ?? ''
    const start = i.survey_prohibited_start ?? ''
    if (!end && !start) return true
    if (end && today > end) return false
    if (start && today < start) return false
    return true
  }
  return true   // 連絡待ちで未解除
}

// ── 請求・明細の状況（入力値から） ───────────────────────────────
export type ItemStatus = '請求準備中' | '請求中' | '取得済' | '要確認' | '再請求中'
export type RequestStatus = ItemStatus | '一部取得'
export type AccountDocStatus = { label: '請求不要' | '未請求' | '請求準備中' | '請求中' | '一部取得' | '取得済' | '要確認' | '再請求中'; count: string }

export function itemStatus(item: FinancialRequestItemRow, request: Pick<FinancialRequestRow, 'request_date'>): ItemStatus {
  if (item.irregular_status === '再請求中') return '再請求中'
  if (item.irregular_status === '要確認') return '要確認'
  if (item.arrival_date) return '取得済'
  return request.request_date ? '請求中' : '請求準備中'
}

export function requestStatus(request: Pick<FinancialRequestRow, 'request_date'>, items: FinancialRequestItemRow[]): RequestStatus {
  if (items.some(i => i.irregular_status === '再請求中')) return '再請求中'
  if (items.some(i => i.irregular_status === '要確認')) return '要確認'
  const arrived = items.filter(i => !!i.arrival_date).length
  if (items.length > 0 && arrived === items.length) return '取得済'
  if (arrived > 0) return '一部取得'
  return request.request_date ? '請求中' : '請求準備中'
}

/** 明細の「何を・いつ時点／どの期間」 */
export function itemConditionLabel(item: Pick<FinancialRequestItemRow, 'doc_type' | 'balance_date' | 'balance_recent' | 'history_start' | 'history_end'>): string {
  const md = (d: string | null) => (d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3') : '—')
  if (item.doc_type === '残高証明') return item.balance_recent ? '直近日' : `${md(item.balance_date)}時点`
  if (item.doc_type === '取引履歴' || item.doc_type === '顧客勘定元帳') return `${md(item.history_start)}〜${md(item.history_end)}`
  return ''
}

/**
 * 口座一覧の「残高証明」「取引履歴」列。その口座を含む明細を集めて判定する。
 * needed=false（オーダーシートで不要）なら請求不要。
 */
export function accountDocStatus(
  assetId: string, docType: string, needed: boolean,
  requests: FinancialRequestRow[], items: FinancialRequestItemRow[],
): AccountDocStatus {
  const reqById = new Map(requests.map(r => [r.id, r]))
  const matching = items.filter(i => i.doc_type === docType && (i.financial_request_item_accounts ?? []).some(a => a.asset_id === assetId))
  if (matching.length === 0) return { label: needed ? '未請求' : '請求不要', count: '' }
  if (matching.some(i => i.irregular_status === '再請求中')) return { label: '再請求中', count: '' }
  if (matching.some(i => i.irregular_status === '要確認')) return { label: '要確認', count: '' }
  const arrived = matching.filter(i => !!i.arrival_date).length
  const submitted = matching.some(i => !!reqById.get(i.request_id)?.request_date)
  const count = matching.length > 1 ? `${arrived}/${matching.length}` : ''
  if (arrived === matching.length) return { label: '取得済', count }
  if (arrived > 0) return { label: '一部取得', count }
  return { label: submitted ? '請求中' : '請求準備中', count }
}

// ── 調査先の状態 ────────────────────────────────────────────────
export type InstitutionStatus = '未着手' | '対応中' | '請求中' | '要確認' | '完了' | '調査禁止中'

/** いま社内で手をつけられること。1機関につき主工程1つ＋並行（全店調査）0〜1つ。 */
export type PendingAction = {
  institutionId: string
  institutionName: string
  kind: FinancialInstitutionRow['kind']
  /** 対応待ちの種類。source_rid や「担当する」で作るタスク名の元 */
  key: string
  title: string
  detail: string
  /** 至急＝不備対応・印鑑証明の期限切れ */
  urgent: boolean
  /** 並行してやること（主の流れを止めない） */
  parallel: boolean
  /** 期限（来店準備＝来店日の前々日、など） */
  deadline: string | null
  /** 画面のどこに飛ぶか（タブ／カード） */
  target: 'procedure' | 'requests' | 'holdings' | 'jasdec'
}

export type InstitutionEvaluation = {
  status: InstitutionStatus
  /** 右上の「次の対応」。対応待ちが無ければ待ちの説明（到着待ち等）か「調査完了」 */
  next: string
  nextDeadline: string | null
  /** 並行してやること（全店調査） */
  parallelNext: string | null
  pending: PendingAction[]
  /** 到着待ち・回答待ちなど、今は手をつけられない状態の説明 */
  waiting: string | null
}

export type InstitutionInput = {
  institution: FinancialInstitutionRow
  requests: FinancialRequestRow[]
  items: FinancialRequestItemRow[]
  holdings: SecuritiesHoldingRow[]
  seal: SealStatus
  today: string
  /** ほふりのとき：開示結果の行（調査先に追加済みか）。渡さないときは旧来の文字欄で判定 */
  jasdecResults?: Array<{ institution_id: string | null }>
}

/** 依頼書が手元にあるか（到着 or 社内在庫）。「窓口で受け取る」も受け取った日＝到着日 */
export const formSecured = (i: FinancialInstitutionRow) =>
  !i.form_required || !!i.form_arrival_date || (i.form_source === '社内在庫' && !!i.form_stock_date)
/** 依頼書を頼んだ／在庫を確かめた（最初の連絡で決まる） */
export const formOrdered = (i: FinancialInstitutionRow) =>
  !i.form_required || ((i.form_source === '金融機関へ請求' || i.form_source === '窓口で受け取る') && !!i.form_request_date) || (i.form_source === '社内在庫' && !!i.form_stock_date)

/** 全店調査が終わったか。回答があり、他店口座が「あり」なら口座一覧へ登録し終えていること */
export function allBranchSearchDone(i: FinancialInstitutionRow): boolean {
  if (!i.search_required) return true
  const answered = i.search_method === '電話回答'
    ? !!i.search_answer_date
    : (i.search_method === '要原本確認' || i.search_method === '要請求') && !!i.search_answer_date
  if (!answered) return false
  if (i.search_other_accounts === 'あり') return !!i.search_all_accounts_registered
  return true
}

/** 手続きタブの工程図：いまどの丸か（1 最初の連絡／2 依頼書／3 請求方法／4 請求／5 到着・完了）。次の対応と同じ判定 */
export function procedureStage(ev: InstitutionEvaluation): 1 | 2 | 3 | 4 | 5 {
  if (ev.status === '完了') return 5
  const key = ev.pending.find(p => !p.parallel)?.key
  if (key === 'freeze-form' || key === 'form') return 1
  if (ev.waiting === '依頼書の到着待ち') return 2
  if (key === 'method' || key === 'seal' || key === 'visit-reserve' || key === 'visit-prepare') return 3
  if (key === 'submit' || key === 'register' || ev.waiting === '依頼者が取得') return 4
  return 5   // 証明書の到着待ち・要確認・銘柄登録・管理人特定
}

export function evaluateInstitution({ institution: i, requests, items, holdings, seal, today, jasdecResults }: InstitutionInput): InstitutionEvaluation {
  const pending: PendingAction[] = []
  const push = (key: string, title: string, detail: string, opt: Partial<PendingAction> = {}) =>
    pending.push({ institutionId: i.id, institutionName: i.name, kind: i.kind, key, title, detail, urgent: false, parallel: false, deadline: null, target: 'procedure', ...opt })

  // ── ほふり：案件単位の開示調査。証券会社の一種ではない ──
  if (i.kind === 'ほふり') {
    if (i.jasdec_company_known === '調査不要') return { status: '完了', next: '照会不要（保有先が判明）', nextDeadline: null, parallelNext: null, pending: [], waiting: null }
    if (!i.jasdec_request_date) {
      push('jasdec-request', 'ほふりへ開示請求', '証券保管振替機構へ登録済加入者情報の開示を請求し、開示請求日を入れる', { target: 'jasdec' })
      return { status: '未着手', next: 'ほふりへ開示請求', nextDeadline: null, parallelNext: null, pending, waiting: null }
    }
    if (!i.jasdec_arrival_date) return { status: '請求中', next: '開示結果の到着待ち', nextDeadline: null, parallelNext: null, pending: [], waiting: '開示結果の到着待ち' }
    // 開示結果の行が全部「調査先に追加」済みなら完了。行を渡されない呼び出し元（進捗一覧など）は旧来の文字欄で見る
    const rs = jasdecResults
    const registered = rs
      ? rs.length > 0 && rs.every(r => !!r.institution_id)
      : i.jasdec_company_known === '判明済み' && !!(i.jasdec_result_institutions ?? '').trim()
    if (!registered) {
      const title = rs && rs.length > 0 ? '判明した機関を調査先に追加' : '開示結果の機関を登録'
      push('jasdec-register', title, '開示結果に載っている証券会社・株主名簿管理人を表に入れ、「調査先に追加」を押す', { target: 'jasdec' })
      return { status: '対応中', next: title, nextDeadline: null, parallelNext: null, pending, waiting: null }
    }
    return { status: '完了', next: '照会完了', nextDeadline: null, parallelNext: null, pending: [], waiting: null }
  }

  // ── 調査禁止で止まっている ──
  if (isSurveyOnHold(i, today)) {
    const until = i.survey_prohibited_method === '期間指定' && i.survey_prohibited_end ? `${i.survey_prohibited_end.slice(5).replace('-', '/')}まで` : 'お客様からの連絡待ち'
    return { status: '調査禁止中', next: `調査禁止（${until}）`, nextDeadline: null, parallelNext: null, pending: [], waiting: `調査禁止（${until}）` }
  }

  const isAdmin = i.kind === '株主名簿管理人'
  const isSec = i.kind === '証券'
  const isOwn = i.acquirer !== '依頼者'
  const contactDone = isAdmin || !i.freeze_required || !!i.freeze_date
  const reqItems = (r: FinancialRequestRow) => items.filter(it => it.request_id === r.id)
  const submitted = requests.some(r => !!r.request_date)
  const prepared = requests.some(r => !r.request_date)
  const irregular = items.some(it => it.irregular_status === '要確認' || it.irregular_status === '再請求中')
  const complete = requests.length > 0 && requests.every(r => { const its = reqItems(r); return its.length > 0 && its.every(it => !!it.arrival_date) })
  const sealBlocked = seal.status === '未登録' || seal.status === '期限切れ'

  let waiting: string | null = null

  // 主工程。上から順に、最初に足りないところが「次の対応」
  if (irregular) {
    push('irregular', '要確認・再請求の対応', '到着書類の不足・不備を確認し、金融機関へ照会または再請求する', { urgent: true, target: 'requests' })
  } else if (!contactDone || !formOrdered(i)) {
    if (i.kind === '預金') push('freeze-form', '凍結連絡・依頼書の取り寄せ', '死亡連絡で口座を凍結し、残高証明・取引履歴の依頼書を取り寄せる（または社内在庫を確認する）')
    else if (isSec) push('freeze-form', '死亡連絡・依頼書の取り寄せ', '証券会社へ死亡を連絡し、残高証明書等の依頼書を取り寄せる（または社内在庫を確認する）')
    else push('form', '依頼書の取り寄せ', '所有株式数証明書等の依頼書を取り寄せる（または社内書式を確認する）')
  } else if (!formSecured(i)) {
    waiting = '依頼書の到着待ち'
  } else if (!isAdmin && i.handling_method === '未確認') {
    push('method', '対応方法の確認', '証明書発行依頼を郵送か来店のどちらで行うか、金融機関に確認する')
  } else if (sealBlocked) {
    push('seal', '印鑑登録証明書の確認', seal.status === '期限切れ' ? '使用期限を過ぎている。差し替える証明書の発行日を登録する' : '使用する印鑑登録証明書の最古の発行日を登録する', { urgent: seal.status === '期限切れ' })
  } else if (!isAdmin && i.handling_method === '来店' && !i.visit_date) {
    push('visit-reserve', '来店予約', '金融機関窓口へ来店を予約し、来店日を登録する')
  } else if (!isAdmin && i.handling_method === '来店' && i.visit_date && !i.visit_prep_done_at) {
    push('visit-prepare', '来店準備', `${i.visit_date.slice(5).replace('-', '/')}の来店に向けて、依頼書・戸籍・本人確認資料・印鑑を揃える`, { deadline: subtractDays(i.visit_date, 2) })
  } else if (!submitted) {
    if (!isOwn) waiting = '依頼者が取得'
    else if (isAdmin) push(prepared ? 'submit' : 'register', prepared ? '所有株式数証明書等の請求' : '請求内容の登録', prepared ? '登録済みの請求内容を確認し、請求日を入れる' : '対象銘柄と書類を登録する', { target: 'requests' })
    else if (i.handling_method === '来店') push('submit', isSec ? '残高証明等の請求（来店）' : '残高証明・取引履歴の請求（来店）', '来店して依頼書を提出し、来店日を請求日として入れる', { deadline: i.visit_date, target: 'requests' })
    else push('submit', isSec ? '残高証明等の請求（郵送）' : '残高証明・取引履歴の請求（郵送）', prepared ? '登録済みの請求内容を確認し、依頼書を発送した日を請求日として入れる' : '請求内容を登録して依頼書を発送し、請求日を入れる', { target: 'requests' })
  } else if (!complete) {
    waiting = '証明書の到着待ち'
  } else if (isSec && holdings.length === 0) {
    push('holdings', '銘柄登録', '届いた残高証明書から銘柄・数量・評価額を登録する', { target: 'holdings' })
  } else if (isSec && holdings.some(h => h.admin_status === '未特定')) {
    push('administrator', '株主名簿管理人の特定', '国内株式等の株主名簿管理人を調べ、銘柄に設定する', { target: 'holdings' })
  }

  // 並行：全店調査（預金・証券）。主工程を止めない
  let parallelNext: string | null = null
  if (!isAdmin && i.search_required && contactDone && !allBranchSearchDone(i)) {
    let title = '全店調査方法の確認', detail = '金融機関に確認し、電話回答・要原本確認・要請求から選ぶ'
    if (i.search_method === '電話回答') { title = '全店調査回答の登録'; detail = '確認日と回答した金融機関担当者名を登録する' }
    else if (i.search_method !== '未確認' && i.search_submission_method === '未確認') { title = '全店調査提出方法の確認'; detail = '原本または調査請求書を郵送・来店のどちらで出すか確認する' }
    else if (i.search_method !== '未確認' && !i.search_request_date) { title = '全店調査書類の提出'; detail = '原本または調査請求書を提出し、提出日を登録する' }
    else if (i.search_method !== '未確認' && i.search_request_date && !i.search_answer_date) { title = ''; }   // 回答待ち＝手をつけられない
    if (i.search_answer_date && i.search_other_accounts === 'あり' && !i.search_all_accounts_registered) { title = '判明した口座の登録'; detail = '全店調査で分かった口座を口座一覧に登録し、「登録済み」にチェックする' }
    if (title) push('search', title, detail, { parallel: true })
    parallelNext = title || '全店調査の回答待ち'
  }

  const main = pending.find(p => !p.parallel)
  const next = main?.title ?? waiting ?? '調査完了'
  const status: InstitutionStatus =
    irregular ? '要確認'
    : main ? (contactDone || formOrdered(i) || submitted ? '対応中' : '未着手')
    : waiting ? (waiting.includes('到着待ち') ? '請求中' : '対応中')
    : '完了'
  return { status, next, nextDeadline: main?.deadline ?? null, parallelNext, pending, waiting }
}

/**
 * 一覧の「いま」。右上の「次の対応」を工程名に丸めたもの（同じ判定から出す。別の条件は持たない）。
 *   不備 ／ 調査禁止 ／ 凍結・依頼書 ／ 依頼書待ち ／ 対応方法 ／ 印鑑証明 ／ 来店予約 ／ 来店準備 ／ 来店 ／ 発送 ／
 *   請求登録 ／ 到着待ち ／ 銘柄登録 ／ 管理人特定 ／ 完了 ／ 依頼者取得 ／（ほふり）開示請求・結果待ち・証券会社追加
 */
export function stageLabel(ev: InstitutionEvaluation): string {
  if (ev.status === '完了') return '完了'
  if (ev.status === '調査禁止中') return '調査禁止'
  const main = ev.pending.find(p => !p.parallel)
  if (main) {
    const m: Record<string, string> = {
      irregular: '不備', 'freeze-form': '凍結・依頼書', form: '依頼書', method: '対応方法', seal: '印鑑証明',
      'visit-reserve': '来店予約', 'visit-prepare': '来店準備', submit: '提出', register: '請求登録',
      holdings: '銘柄登録', administrator: '管理人特定', 'jasdec-request': '開示請求', 'jasdec-register': '証券会社追加',
    }
    if (main.key === 'submit') return main.title.includes('来店') ? '来店' : main.title.includes('郵送') ? '発送' : '請求'
    return m[main.key] ?? main.title
  }
  if (ev.waiting) {
    if (ev.waiting.includes('依頼書')) return '依頼書待ち'
    if (ev.waiting.includes('開示結果')) return '結果待ち'
    if (ev.waiting.includes('到着')) return '到着待ち'
    if (ev.waiting.includes('依頼者')) return '依頼者取得'
    return ev.waiting
  }
  return ev.next
}

/** 案件全体の対応待ち。至急 → 期限 → 並行でないもの、の順 */
export function collectPending(evals: InstitutionEvaluation[]): PendingAction[] {
  return evals.flatMap(e => e.pending).sort((a, b) =>
    Number(b.urgent) - Number(a.urgent)
    || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')
    || Number(a.parallel) - Number(b.parallel))
}

/** タスクにするときの source_rid。fin-wf:{機関名}:{key}。機関名で持つのは fin:/cancel: と同じ流儀で、タスク詳細からの着地も名前で解くため */
export const pendingRid = (p: PendingAction) => `fin-wf:${p.institutionName}:${p.key}`

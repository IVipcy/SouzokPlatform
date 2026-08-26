'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  categoriesOf, gyomuForCategories, CROSS_GYOMU,
} from '@/lib/serviceMaster'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { REFERRAL_TASK_LABEL } from '@/lib/constants'
import { TantoKubunBadge } from '@/components/ui/TantoKubunBadge'
import type { TaskRow, TaskTemplateRow, CaseReferralRow, KosekiRequestRow, RealEstatePropertyRow, FinancialAssetRow, HeirRow, CaseClientRow } from '@/types'
import type { RoleRow } from './ProcedureIntakeSection'

type Props = {
  caseId: string
  // 実施タスク（役割分担）。kind=task の作業がタスク生成の候補。
  intakeRoles: RoleRow[]
  serviceCategory?: string | null
  serviceCategory2?: string | null
  existingTasks: TaskRow[]
  // 手順テンプレ（task_templates）。生成元ではなく procedure_text 流用のためだけに使う。
  taskTemplates: TaskTemplateRow[]
  // 他事業者紹介で登録した業者（各業者への「依頼」タスクを候補に出す）
  caseReferrals?: CaseReferralRow[]
  // 戸籍請求（実務タブ）の請求先。戸籍収集タスクを請求先ごとに展開する。
  kosekiRequests?: KosekiRequestRow[]
  // 不動産・金融資産（左タブ単位＝市区町村/金融機関でタスクをまとめる）
  properties?: RealEstatePropertyRow[]
  financialAssets?: FinancialAssetRow[]
  /** 被相続人の氏名。戸籍請求のうち被相続人あての1本だけ「着手OK」で生成するために使う。 */
  deceasedName?: string | null
  /** 相続人。戸籍タスク名に続柄（長男 等）を出すために使う。 */
  heirs?: HeirRow[]
  /** 依頼者。戸籍タスク名に「依頼者」を出し、最初はこの人の戸籍だけを既定チェックにする。 */
  caseClients?: CaseClientRow[]
  /** 閲覧者のロール（primary_role）。管理担当は管理業務＋その他のみ、事務管理(assistant)は事務業務のみを候補にする。 */
  viewerRole?: string | null
  onSaved: () => void
}

// 生成候補：実施タスク行（roleIdx付き）or 区分非依存（経理/相続税）。
// ready=生成時に着手OK（起点タスク）／readyOnReceipt=受領次第OK（受信簿で受領したら着手OKに昇格）
type Candidate = { key: string; gyomu: string; title: string; roleIdx?: number; rid?: string; ready?: boolean; readyOnReceipt?: boolean; custom?: boolean; work?: string
  /** 開いた時点では既定でチェックを外す候補（今やらなくてよいもの）。チェックすれば生成できる。 */
  offByDefault?: boolean }

// 候補の担当区分（生成時の task_kind と同じ判定）。バッジ表示に使う。
function kindOfCandidate(c: Candidate): 'case' | 'system' | 'touki_team' {
  if (TOUKI_TEAM_TASK_TITLES.has(c.title)) return 'touki_team'
  if (c.custom || MANAGER_GYOMU.has(c.gyomu) || MANAGER_TASK_TITLES.has(c.title)) return 'system'
  return 'case'
}

// 管理担当/受注担当が担う業務（＝管理担当タスクとして生成）。
// これらの業務は task_kind='system'・work_role/assign_role='manager'・phase=業務名で生成し、
// 事務管理タスク(case)と分ける。phase を持たせることで進捗ボード／実務タブの関連タスクに集約される。
// 他事業者紹介（税理士/弁護士/不動産査定 等への引継ぎ）も紹介系タスク＝管理担当タスク。
const MANAGER_GYOMU = new Set<string>([
  '遺言作成', '信託契約書作成', '検認手続き', '後見手続き', '調停手続き',
  '精算書作成', '指図書作成', '法定相続情報取得', '他事業者紹介',
  // 手紙・執行通知・契約書作成・放棄手続き・相続税 も管理担当の持ち場（事務管理は手を動かさない）
  '手紙', '執行通知', '契約書作成', '放棄手続き', '相続税',
])

// 相続登記チームタスクとして生成する タスク名。
// task_kind='touki_team' で生成し、事務管理/受注管理どちらの一覧にも出ず、相続登記チーム専用ダッシュボードから触られる。
//   ①相続登記の申請 ③権利書の製本 ④不動産登記簿の申請 が相続登記チーム。
//   （②識別情報通知の受領 ⑤不動産登記簿の受領 は事務管理タスク=受信簿で受領）
const TOUKI_TEAM_TASK_TITLES = new Set<string>(['相続登記の申請', '権利書の製本', '不動産登記簿の申請'])

// 事務管理の業務でも、このタスク名だけは管理担当タスク(system)として生成する。
// 作るのは事務管理、最後に見るのは管理担当、という分担のため業務単位では振り分けられない。
const MANAGER_TASK_TITLES = new Set<string>([
  '相関図最終チェック', '不動産の調査結果の最終確認', '金融財産の調査結果の最終確認',
  '財産目録の最終確認', '協議書の最終確認',
])

// 業務ごとに最後へ足す「管理担当の最終確認」タスク。
// 事務管理が作ったものを管理担当が見る、という一手間が今までタスクになっておらず、
// 見落としたまま次へ進んでいた。業務をやる案件にだけ1件ずつ足す。
const MANAGER_CHECK_TASKS: Record<string, { title: string; rid: string }> = {
  '相関図':   { title: '相関図最終チェック',           rid: 'chart-check' },
  '不動産':   { title: '不動産の調査結果の最終確認',   rid: 're-check' },
  '金融資産': { title: '金融財産の調査結果の最終確認', rid: 'fin-check' },
  '目録':     { title: '財産目録の最終確認',           rid: 'inv-check' },
  '協議書':   { title: '協議書の最終確認',             rid: 'div-check' },
}

// 候補に出すときのタスク名の読み替え。
// 相関図は「一次作成（事務管理）」と「最終チェック（管理担当）」に分かれるので、
// 実施業務の名前のままだと どちらを指すのか分からなくなる。
const TITLE_REWRITE: Record<string, string> = { '相関図作成': '相関図一次作成' }

// 機関単位ではない「案件で1回」の調査（金融）。機関ごとの請求/読込（unit展開）に飲み込ませず、個別タスクとして必ず作る。
// 全店調査・残高証明・経過利息・取引履歴は銀行ごとにまとめて請求するため、機関単位の「資料請求」に内包（対象外）。
// ここに残すのは本当に案件単位のもの：ほふり照会・保険照会・年金照会・負債（信用情報）調査。
const CASE_WIDE_TASKS = ['証券保管振替機構照会', '保険照会', '年金照会', '負債調査']
// 解約のうち金融機関単位でない作業（機関ごとのunit展開に飲み込ませず個別タスクにする）。
const CANCEL_NON_UNIT_TASKS = ['自動車名義変更', '保険金請求']

/**
 * タスクの候補一覧（「タスク追加」モーダルの「この案件の候補」タブ）。
 *
 * 候補の作り方は実施タスク（intake_roles の kind=task）＋経理/相続税で、
 * 戸籍は請求先ごと、不動産は市区町村ごと、金融は機関ごとに展開する。
 * 押した1件だけを追加し、source_rid で実務タブの行に1対1リンクさせる
 * （このリンクがあるから、戸籍表や金融表の行に関連タスクが出る）。
 *
 * 以前は「◯件生成」でまとめて作っていたが、一度に大量に出るのをやめて1件ずつにした。
 */
export default function TaskCandidatePanel({ caseId, intakeRoles, serviceCategory, serviceCategory2, existingTasks, caseReferrals = [], kosekiRequests = [], properties = [], financialAssets = [], deceasedName = null, heirs = [], caseClients = [], onSaved }: Props) {
  // viewerRole は担当区分フィルタ撤廃により未使用（Props には残し、呼び出し側の互換を保つ）。
  // チェックした候補（既定は全部オフ。要るものだけ選ぶ）
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 全部生成済みの業務は畳んでおき、開いたものだけ中身を表示する（⑤）
  const [doneExpanded, setDoneExpanded] = useState<Set<string>>(new Set())

  // 戸籍タスクに出す肩書き。依頼者 ＞ 被相続人 ＞ 続柄 の順で1つだけ添える。
  // 誰の戸籍なのかが名前だけでは分からず、どれから手を付けるか毎回聞かれていた。
  // 依頼者かどうかは相続人のフラグ(heirs.is_client・migration 232)で判定する。
  // 氏名の突き合わせだと表記ゆれで外れるため、面談時に押さえたフラグを正とする
  // （フラグが1件も立っていない古い案件だけ、従来どおり case_clients の氏名と突き合わせる）。
  const key = (v: string | null | undefined) => (v ?? '').replace(/[\s　]/g, '')
  const hasClientFlag = heirs.some(h => h.is_client)
  const isClientName = useCallback((n: string) => {
    if (!n) return false
    if (hasClientFlag) return heirs.some(h => h.is_client && key(h.name) === n)
    return caseClients.some(c => key(c.name) === n)
  }, [heirs, caseClients, hasClientFlag])
  const roleOfPerson = useCallback((rawName: string): string | null => {
    const n = key(rawName)
    if (!n) return null
    if (isClientName(n)) return '依頼者'
    if (key(deceasedName) === n) return '被相続人'
    const h = heirs.find(x => key(x.name) === n)
    return h ? (h.relationship_type || h.relationship || null) : null
  }, [deceasedName, heirs, isClientName])
  /** 最初に出す戸籍タスク＝依頼者の分だけ。
   *  被相続人ほか他の人の戸籍は、依頼者の戸籍から辿って請求先が決まるので、その都度チェックして出す。 */
  const isFirstKosekiPerson = useCallback((rawName: string) => isClientName(key(rawName)), [isClientName])

  const cats = categoriesOf(serviceCategory, serviceCategory2)
  const generatedRids = useMemo(() => new Set(existingTasks.map(t => t.source_rid).filter(Boolean) as string[]), [existingTasks])

  // 候補：役割分担で定義した作業は作業区分(作業/請求・受領)を問わず全部＋経理/相続税。表示は業務グループ順。
  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = []

    // 左タブ単位（不動産/登記＝市区町村、金融資産/解約＝金融機関）でタスクをまとめるための単位一覧。
    const muniOf = (p: RealEstatePropertyRow): string => {
      const m = (p.municipality ?? '').trim()
      if (m) return m
      const a = (p.address ?? '').trim()
      const match = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
      return match ? `${match[1] ?? ''}${match[2]}` : ''
    }
    const isOwn = (a: string | null | undefined) => (a ?? '自社') !== '依頼者'  // null既定=自社
    const muniUnits = [...new Set(properties.map(muniOf).filter(Boolean))]
    const instUnits = [...new Set(financialAssets.map(a => (a.institution_name ?? '').trim()).filter(Boolean))]
    // 自社取得の単位（＝請求タスクが要る）。依頼者取得のみの単位は読込（到着確認）だけ。
    const muniOwn = new Set(properties.filter(p => isOwn(p.acquirer)).map(muniOf).filter(Boolean))
    const instOwn = new Set(financialAssets.filter(a => isOwn(a.acquirer)).map(a => (a.institution_name ?? '').trim()).filter(Boolean))
    // 銀行→口座種別リスト（普通・定期 等）。1銀行に複数口座があるとき、タスク名に併記して判別しやすく。
    const instAcctTypes = new Map<string, string[]>()
    for (const a of financialAssets) {
      const nm = (a.institution_name ?? '').trim(); const at = (a.account_type ?? '').trim()
      if (!nm || !at) continue
      const arr = instAcctTypes.get(nm) ?? []
      if (!arr.includes(at)) arr.push(at)
      instAcctTypes.set(nm, arr)
    }
    // 金融/解約タスクの銀行名に口座種別を併記（例: 三菱UFJ銀行（普通・定期））。種別未登録なら何も足さない。
    const withAcctTypes = (gyomu: string, name: string) => {
      if (gyomu !== '金融資産' && gyomu !== '解約') return name
      const types = instAcctTypes.get(name)
      return types && types.length > 0 ? `${name}（${types.join('・')}）` : name
    }
    // 単位ごとに「請求/受領」→「読込/手続き」の順で生成。請求(onlyOwn)は自社取得の単位のみ・着手OK。読込は受領次第OK。
    type UnitTask = { prefix: string; label: string; onlyOwn?: boolean; ready?: boolean; readyOnReceipt?: boolean }
    const UNIT: Record<string, { units: string[]; own: Set<string>; tasks: UnitTask[] }> = {
      // 不動産は請求先で2系統（市区町村役場＝名寄帳・評価証明／法務局＝登記・公図・地積）。どちらも市区町村単位。
      // 資料（登記/公図/地積）はまとめて請求・まとめて届くので読込も1本。資料ごとの到着状況は実務タブの表で管理。
      // 生成時に着手OKを付けるのは「被相続人の戸籍請求」だけ（下の戸籍収集の展開を参照）。
      // それ以外は何もフラグを付けず、生成後にタスクタブで人が優先度・着手フラグを調整する。
      // 読込(-read)も最初はフラグ無し。対になる請求タスクの完了モーダルで「受領次第OK」にする運用。
      '不動産': { units: muniUnits, own: muniOwn, tasks: [
        { prefix: 're-muni', label: '名寄帳・評価証明を請求', onlyOwn: true },
        { prefix: 're-muni-read', label: '名寄帳・評価証明を読込' },
        { prefix: 're-houmu', label: '登記・公図・地積を請求', onlyOwn: true },
        { prefix: 're-houmu-read', label: '登記・公図・地積を読込' },
      ] },
      // 登記は市区町村1本展開を廃止。serviceMaster の5タスク（相続登記の申請/識別情報通知の受領/
      // 権利書の製本/不動産登記簿の申請/不動産登記簿の受領）を個別生成し、担当区分(相続登記チーム/事務管理)を
      // kindOfCandidate で正しく振る。※以前は 'reg:{muni}' 1本に潰れて 全部が事務管理扱いになっていた。
      // 金融は 凍結依頼（電話）→ 資料請求 → 資料読込 の順。
      //   凍結依頼＝freeze_confirmed で着手OK（startOkSuggest）。
      // ※「凍結してよいか確認」はタスクにしない。財産調査タブと確認簿の依頼→確認で回すもので、
      //   銀行ごとにタスクが増えるわりに事務側の作業が無く、一覧を埋めるだけだった。
      '金融資産': { units: instUnits, own: instOwn, tasks: [
        { prefix: 'fin-freeze', label: '凍結依頼（電話で凍結）', onlyOwn: true },
        { prefix: 'fin', label: '資料請求（全店調査・残高・経過利息）', onlyOwn: true },
        { prefix: 'fin-read', label: '資料読込（残高・取引履歴・凍結確認等）' },
      ] },
      '解約': { units: instUnits, own: instOwn, tasks: [{ prefix: 'cancel', label: '解約手続き' }] },
    }
    const unitExpanded = new Set<string>()  // 単位展開済みの業務（個別作業はスキップ）
    const kosekiLabel = (k: KosekiRequestRow) => {
      const dest = (k.request_to ?? '').trim() || '請求先未設定'
      const person = (k.target_person ?? '').trim()
      if (!person) return dest
      const role = roleOfPerson(person)
      return `${dest}（${person}${role ? `・${role}` : ''}）`
    }

    // 実際にやる業務（最終確認タスクを足す対象）
    const activeGyomus = new Set<string>()

    intakeRoles.forEach((r, idx) => {
      if (!r.sagyou?.trim() || r.owner === '不要') return
      if (!r.custom) activeGyomus.add(r.gyomu)
      // その他（自由入力）＝名もなき業務。業務名＝タスク名、内容(note)＝作業内容。管理担当タスクとして生成。
      if (r.custom) {
        out.push({ key: `custom:${idx}`, gyomu: 'その他', title: r.sagyou, rid: `custom:${r.gyomu}`, custom: true, work: r.note })
        return
      }
      // 戸籍の「到着確認・チェック」は請求先ごとの「戸籍読込」に置き換えるためスキップ（戸籍収集の展開で生成）。
      if (r.gyomu === '戸籍' && r.sagyou.includes('到着確認')) return
      // 戸籍収集 → 請求先（役所）ごとに展開。請求グループ(自社取得のみ)の後に読込グループ(全件)。
      // 依頼者取得の戸籍は請求タスクを作らず、読込（到着確認）のみ。source_rid で1対1リンク（重複生成を防ぐ）。
      //
      // 着手OKを付けるのは「被相続人の戸籍請求」だけ。相続人の戸籍は被相続人の戸籍を読んでから
      // 請求先が決まることが多く、最初から着手OKにすると先走りの原因になる。
      const isKosekiCollect = r.gyomu === '戸籍' && r.sagyou.includes('戸籍収集')
      if (isKosekiCollect) {
        if (kosekiRequests.length > 0) {
          // 起点＝依頼者の戸籍請求。最初に出すのがこの1本なので、着手OKもここに付ける。
          kosekiRequests.filter(k => isOwn(k.acquirer)).forEach(k => out.push({ key: `koseki:${k.id}`, gyomu: '戸籍', title: `戸籍請求：${kosekiLabel(k)}`, rid: `koseki:${k.id}`, ready: isFirstKosekiPerson(k.target_person ?? ''), offByDefault: !isFirstKosekiPerson(k.target_person ?? '') }))
          kosekiRequests.forEach(k => out.push({ key: `koseki-read:${k.id}`, gyomu: '戸籍', title: `戸籍読込：${kosekiLabel(k)}`, rid: `koseki-read:${k.id}`, offByDefault: !isFirstKosekiPerson(k.target_person ?? '') }))
        } else {
          out.push({ key: r.rid ?? `role:${idx}`, gyomu: '戸籍', title: '戸籍請求', roleIdx: idx, rid: r.rid, ready: true })
        }
        return
      }
      // 機関単位ではない全体調査（全店調査/証券保管振替機構照会/保険照会/年金照会/負債調査）は、
      // unit展開（機関ごとの請求/読込）に飲み込ませず、案件に1つの個別タスクとして必ず作る。
      if (CASE_WIDE_TASKS.some(k => r.sagyou!.includes(k))) {
        out.push({ key: r.rid ?? `role:${idx}`, gyomu: r.gyomu, title: r.sagyou!, roleIdx: idx, rid: r.rid })
        return
      }
      // 解約のうち金融機関単位でない作業（自動車名義変更・保険金請求）は、機関ごとのunit展開に
      // 飲み込ませず個別タスクとして生成する（従来は展開に埋もれて生成されなかった）。
      if (r.gyomu === '解約' && CANCEL_NON_UNIT_TASKS.some(k => r.sagyou!.includes(k))) {
        out.push({ key: r.rid ?? `role:${idx}`, gyomu: r.gyomu, title: r.sagyou!, roleIdx: idx, rid: r.rid })
        return
      }
      // 法定相続情報一覧図：申出（戸籍全揃いで着手）と受領（受領次第OK）を分ける。1案件1件（cases に保存）。
      // 戸籍・不動産・金融の「請求/読込」と同じく、送る作業と受け取る作業を別タスクにして進捗を細かく管理。
      if (r.gyomu === '法定相続情報取得') {
        out.push({ key: 'family-tree', gyomu: r.gyomu, title: '法定相続情報一覧図の申出', rid: 'family-tree' })
        out.push({ key: 'family-tree-recv', gyomu: r.gyomu, title: '法定相続情報一覧図の受領', rid: 'family-tree-recv' })
        return
      }
      // 不動産/登記/金融資産/解約は左タブ単位でタスク展開。請求(onlyOwn)は自社取得の単位のみ。単位が無ければ従来どおり個別作業。
      const u = UNIT[r.gyomu]
      if (u && u.units.length > 0) {
        if (unitExpanded.has(r.gyomu)) return
        unitExpanded.add(r.gyomu)
        u.tasks.forEach(t => u.units.forEach(name => {
          if (t.onlyOwn && !u.own.has(name)) return  // 依頼者取得のみの単位は請求タスクを作らない
          // rid/key は銀行名のみ（source_rid の後方一致・ゲート判定は銀行単位）。表示title だけ口座種別を併記。
          out.push({ key: `${t.prefix}:${name}`, gyomu: r.gyomu, title: `${t.label}：${withAcctTypes(r.gyomu, name)}`, rid: `${t.prefix}:${name}`, ready: t.ready, readyOnReceipt: t.readyOnReceipt })
        }))
        return
      }
      out.push({ key: r.rid ?? `role:${idx}`, gyomu: r.gyomu, title: TITLE_REWRITE[r.sagyou] ?? r.sagyou, roleIdx: idx, rid: r.rid })
    })
    // 管理担当の最終確認（業務の最後に1件）。作った本人ではなく管理担当が見る、という手順をタスクにする。
    for (const [gyomu, t] of Object.entries(MANAGER_CHECK_TASKS)) {
      if (!activeGyomus.has(gyomu)) continue
      out.push({ key: t.rid, gyomu, title: t.title, rid: t.rid })
    }
    // 経理タスクは候補に出さない（今後アラートで対応）。
    // 他事業者紹介で登録した業者への「依頼／引継ぎ」タスク
    for (const r of caseReferrals) {
      const title = REFERRAL_TASK_LABEL[r.partner_type] ?? `${r.partner_type}依頼`
      out.push({ key: `referral:${r.id}`, gyomu: '他事業者紹介', title, rid: `referral:${r.id}` })
    }
    // 担当区分での絞り込みは撤廃：どのアカウントで開いても全区分の候補を出す。
    // どのみち全タスクが要るため、区分はバッジで判別できれば十分（ガチガチ制御しない）。
    return out
  }, [intakeRoles, caseReferrals, kosekiRequests, properties, financialAssets, roleOfPerson, isFirstKosekiPerson])

  // 戸籍収集をやる案件なのに請求先（役所）が未入力＝粗い「戸籍請求」1件になってしまう状態。
  const kosekiCoarse = useMemo(() =>
    kosekiRequests.length === 0 && intakeRoles.some(r => r.gyomu === '戸籍' && (r.sagyou ?? '').includes('戸籍収集') && r.owner !== '不要'),
    [intakeRoles, kosekiRequests])
  // 金融資産/解約をやるのに金融機関が未入力＝銀行ごとに分かれず粗い1件になる。
  const finCoarse = useMemo(() =>
    financialAssets.length === 0 && intakeRoles.some(r => (r.gyomu === '金融資産' || r.gyomu === '解約') && (r.sagyou ?? '').trim() && r.owner !== '不要'),
    [intakeRoles, financialAssets])
  // 不動産/登記をやるのに物件が未入力＝市区町村ごとに分かれない。
  const reCoarse = useMemo(() =>
    properties.length === 0 && intakeRoles.some(r => (r.gyomu === '不動産' || r.gyomu === '登記') && (r.sagyou ?? '').trim() && r.owner !== '不要'),
    [intakeRoles, properties])

  // このパネルで足したぶん。親の再取得を待たずに「追加済」へ変わるように持っておく。
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set())
  const isGenerated = (c: Candidate) => addedKeys.has(c.key) || (!!c.rid && generatedRids.has(c.rid))

  const groups = useMemo(() => {
    const order = [...gyomuForCategories(cats), ...CROSS_GYOMU]
    const seen = new Set(order)
    const extra = [...new Set(candidates.map(c => c.gyomu).filter(g => !seen.has(g)))]
    return [...order, ...extra]
      .map(gyomu => ({ gyomu, items: candidates.filter(c => c.gyomu === gyomu) }))
      .filter(g => g.items.length > 0)
  }, [candidates, cats])

  // 工程 ＞ 業務 でまとめる（工程見出し＋業務ボックス）
  const koteiGrouped = useMemo(() => {
    const m = new Map<string, typeof groups>()
    for (const g of groups) { const k = koteiOf(g.gyomu); if (!m.has(k)) m.set(k, []); m.get(k)!.push(g) }
    return [...m.entries()].sort((a, b) => koteiRank(a[0]) - koteiRank(b[0]))
  }, [groups])


  /** チェックした候補をタスクにする。チェックが1件なら1件だけ増える。 */
  const addPicked = async () => {
    const picked = candidates.filter(c => selected.has(c.key) && !isGenerated(c))
    if (picked.length === 0 || busy) return
    setBusy(true); setError('')
    const supabase = createClient()

    // 1. 実施タスク行に rid を採番（未採番のみ）→ intake_roles をまとめて更新
    const roles = [...intakeRoles]
    let rolesChanged = false
    const ridByKey: Record<string, string> = {}
    for (const c of picked) {
      if (c.roleIdx != null) {
        let rid = roles[c.roleIdx]?.rid
        if (!rid) { rid = crypto.randomUUID(); roles[c.roleIdx] = { ...roles[c.roleIdx], rid }; rolesChanged = true }
        ridByKey[c.key] = rid
      } else if (c.rid) {
        ridByKey[c.key] = c.rid
      }
    }
    if (rolesChanged) {
      const { error: e } = await supabase.from('cases').update({ intake_roles: roles }).eq('id', caseId)
      if (e) { setBusy(false); setError(`実施タスクの更新に失敗しました: ${e.message}`); return }
    }

    // 2. タスクを作る（source_rid リンク付き）。
    // 管理業務(MANAGER_GYOMU)＝管理担当タスク(system)、それ以外＝事務管理タスク(case)。
    // どちらも phase=業務名を持たせ、実務タブ／進捗ボードに業務単位で集約される。
    const rows = picked.map((c, i) => {
      const isTouki = TOUKI_TEAM_TASK_TITLES.has(c.title)
      const isManager = !isTouki && (c.custom || MANAGER_GYOMU.has(c.gyomu) || MANAGER_TASK_TITLES.has(c.title))
      const kind: 'case' | 'system' | 'touki_team' = isTouki ? 'touki_team' : isManager ? 'system' : 'case'
      return {
        case_id: caseId,
        task_kind: kind,
        title: c.title,
        // その他は業務名を phase に（業務バッジ表示用）、通常は業務名。
        phase: c.custom ? c.title : c.gyomu,
        // 管理担当タスクはカテゴリ列を持たせず、業務は phase バッジで表す（名もなきタスクと混在するため）。
        category: isManager ? null : c.gyomu,
        status: '着手前',
        priority: '通常',
        source_rid: ridByKey[c.key] ?? null,
        work_role: isTouki ? 'assistant' : isManager ? 'manager' : 'assistant',
        assign_role: isManager ? 'manager' : null,
        // その他は入力した内容を作業内容(procedure_text)に。それ以外はテンプレ流し込みなし。
        procedure_text: c.custom ? (c.work?.trim() || null) : null,
        // 請求(起点)＝着手OK／読込等＝受領次第OK。それ以外は無し。
        ext_data: c.ready ? { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' }
          : c.readyOnReceipt ? { ready_on_receipt: true }
          : null,
        sort_order: existingTasks.length + i,
      }
    })
    const { error: e2 } = await supabase.from('tasks').insert(rows)
    if (e2) { setBusy(false); setError(`追加に失敗しました: ${e2.message}`); return }

    setAddedKeys(prev => { const next = new Set(prev); picked.forEach(c => next.add(c.key)); return next })
    setSelected(new Set())
    setBusy(false)
    onSaved()
  }

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  /** 業務まるごと。全部入っていれば全解除、そうでなければ全選択。 */
  const toggleGyomu = (items: Candidate[]) => {
    const rest = items.filter(c => !isGenerated(c))
    const allOn = rest.length > 0 && rest.every(c => selected.has(c.key))
    setSelected(prev => {
      const next = new Set(prev)
      rest.forEach(c => allOn ? next.delete(c.key) : next.add(c.key))
      return next
    })
  }

  return (
    <div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {kosekiCoarse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] rounded-lg p-3 mb-4">
          <span className="font-semibold">戸籍の請求先（役所）が未入力です。</span>
          先に実務タブ＞戸籍表へ役所を入れると、<span className="font-semibold">役所ごと</span>に請求・読込の候補が分かれます。
          このままだと粗い「戸籍請求」1件になります。
        </div>
      )}
      {finCoarse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] rounded-lg p-3 mb-4">
          <span className="font-semibold">金融機関が未入力です。</span>
          先に財産調査＞金融の表へ金融機関を入れると、<span className="font-semibold">銀行ごと</span>に資料請求・読込の候補が分かれます。
        </div>
      )}
      {reCoarse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] rounded-lg p-3 mb-4">
          <span className="font-semibold">物件が未入力です。</span>
          先に財産調査＞不動産の表へ物件を入れると、<span className="font-semibold">市区町村ごと</span>に請求・読込の候補が分かれます。
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          この案件の候補がありません。<br />
          「受注内容」タブで受注区分・役割分担（実施タスク）を設定すると、ここに出ます。<br />
          <span className="text-[12px]">候補に無い作業は「新規作成」から作れます。</span>
        </p>
      ) : (
        <>
          <p className="text-[12px] text-gray-500 mb-3">
            受注内容の役割分担・戸籍・財産から出した候補です。要るものにチェックを入れて追加してください（最初は全部オフです）。
          </p>
          <div className="space-y-4">
            {koteiGrouped.map(([kotei, gyomuGroups]) => (
              <div key={kotei} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-[3px] h-3.5 bg-brand-500 rounded-[1px]" />
                  <span className="text-[13px] font-bold text-brand-800">{kotei}</span>
                </div>
                {gyomuGroups.map(group => {
                  const rest = group.items.filter(c => !isGenerated(c))
                  // 全部追加済みの業務は畳んで薄く表示（開いたら中身を見せる）
                  const allDone = rest.length === 0 && group.items.length > 0
                  if (allDone && !doneExpanded.has(group.gyomu)) {
                    return (
                      <button key={group.gyomu} onClick={() => setDoneExpanded(prev => new Set(prev).add(group.gyomu))}
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-2.5 bg-gray-50/60 opacity-70 hover:opacity-100 transition-opacity">
                        <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" strokeWidth={2.25} />
                        <span className="text-sm font-medium text-gray-600 flex-1 text-left">{group.gyomu}</span>
                        <span className="text-xs text-gray-400">すべて追加済（{group.items.length}）</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      </button>
                    )
                  }
                  return (
                    <div key={group.gyomu} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center gap-3 bg-gray-50">
                        <input type="checkbox" className="accent-brand-600 w-3.5 h-3.5"
                          checked={rest.length > 0 && rest.every(c => selected.has(c.key))}
                          disabled={rest.length === 0}
                          onChange={() => toggleGyomu(group.items)}
                          title={`${group.gyomu}の未追加ぶんをまとめて選ぶ`} />
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-brand-500" />
                        <span className="text-sm font-semibold text-gray-900 flex-1">{group.gyomu}</span>
                        <span className="text-xs text-gray-400">未追加 {rest.length} / {group.items.length}</span>
                      </div>
                      <div className="divide-y divide-gray-200">
                        {group.items.map(c => {
                          const done = isGenerated(c)
                          return (
                            <label key={c.key} className={`flex items-center gap-2 px-4 py-2 text-sm ${done ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                              <input type="checkbox" className="accent-brand-600 w-3.5 h-3.5"
                                checked={selected.has(c.key)} disabled={done} onChange={() => toggle(c.key)} />
                              <span className="flex-1 text-gray-700">{c.title}</span>
                              <TantoKubunBadge task={{ task_kind: kindOfCandidate(c), assign_role: 'manager' }} size="xs" />
                              {c.ready && !done && (
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded"
                                  title="前提が無いのですぐ取りかかれるタスクです">着手OK</span>
                              )}
                              {done && (
                                <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                                  <Check className="w-3 h-3" strokeWidth={2.5} />追加済
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* 操作バー。チェックしたぶんをまとめて追加する。 */}
          <div className="sticky bottom-0 mt-3 -mx-1 px-1 pt-2.5 pb-0.5 bg-white border-t border-gray-200 flex items-center gap-2">
            <span className="text-[12px] text-gray-500 flex-1">
              {selected.size > 0 ? `${selected.size} 件を選択中` : '追加するものにチェックを入れてください'}
            </span>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())}
                className="px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                選択を解除
              </button>
            )}
            <button type="button" onClick={addPicked} disabled={busy || selected.size === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-40 whitespace-nowrap">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />}
              {busy ? '追加中…' : `${selected.size || ''} 件を追加`.trim()}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

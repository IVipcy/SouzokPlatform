'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import {
  categoriesOf, gyomuForCategories, CROSS_GYOMU,
} from '@/lib/serviceMaster'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { REFERRAL_TASK_LABEL } from '@/lib/constants'
import type { TaskRow, TaskTemplateRow, CaseReferralRow, KosekiRequestRow, RealEstatePropertyRow, FinancialAssetRow } from '@/types'
import type { RoleRow } from './ProcedureIntakeSection'

type Props = {
  isOpen: boolean
  onClose: () => void
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
  onSaved: () => void
}

// 生成候補：実施タスク行（roleIdx付き）or 区分非依存（経理/相続税）。
// ready=生成時に着手OK（起点タスク）／readyOnReceipt=受領次第OK（受信簿で受領したら着手OKに昇格）
type Candidate = { key: string; gyomu: string; title: string; roleIdx?: number; rid?: string; ready?: boolean; readyOnReceipt?: boolean }

// 機関単位ではない「案件で1回」の調査（金融）。機関ごとの請求/読込（unit展開）に飲み込ませず、個別タスクとして必ず作る。
// 全店調査・残高証明・経過利息・取引履歴は銀行ごとにまとめて請求するため、機関単位の「資料請求」に内包（対象外）。
// ここに残すのは本当に案件単位のもの：ほふり照会・保険照会・年金照会・負債（信用情報）調査。
const CASE_WIDE_TASKS = ['証券保管振替機構照会', '保険照会', '年金照会', '負債調査']
// 解約のうち金融機関単位でない作業（機関ごとのunit展開に飲み込ませず個別タスクにする）。
const CANCEL_NON_UNIT_TASKS = ['自動車名義変更', '保険金請求']

/**
 * タスク一括生成。生成元は実施タスク（intake_roles の kind=task）＋経理/相続税。
 * 生成タスクは source_rid で実施タスク行に1対1リンク（手続き系タブ等の進捗表示と共通）。
 * 手順(procedure_text)は既存テンプレ本文を作業名→キー対応で流用（あるものだけ）。
 */
export default function BulkTaskGenerateModal({ isOpen, onClose, caseId, intakeRoles, serviceCategory, serviceCategory2, existingTasks, caseReferrals = [], kosekiRequests = [], properties = [], financialAssets = [], onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // 全部生成済みの業務は畳んでおき、開いたものだけ中身を表示する（⑤）
  const [doneExpanded, setDoneExpanded] = useState<Set<string>>(new Set())

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
      // 着手OK（起点）は「戸籍を待たずに並行請求できるもの」だけ。
      //   ・戸籍請求／名寄帳・評価証明の請求（市区町村役場）＝ヒアリング段階の情報で着手可
      //   ・登記・公図・地積（法務局）＝物件の地番が要る＝名寄帳到着後に着手
      //   ・金融の資料請求＝金融機関が戸籍を求める＝戸籍到着後に着手
      '不動産': { units: muniUnits, own: muniOwn, tasks: [
        { prefix: 're-muni', label: '名寄帳・評価証明を請求', onlyOwn: true, ready: true },
        { prefix: 're-muni-read', label: '名寄帳・評価証明を読込', readyOnReceipt: true },
        { prefix: 're-houmu', label: '登記・公図・地積を請求', onlyOwn: true },
        { prefix: 're-houmu-read', label: '登記・公図・地積を読込', readyOnReceipt: true },
      ] },
      '登記': { units: muniUnits, own: muniOwn, tasks: [{ prefix: 'reg', label: '相続登記' }] },
      '金融資産': { units: instUnits, own: instOwn, tasks: [{ prefix: 'fin', label: '資料請求（全店調査・残高・経過利息）', onlyOwn: true }, { prefix: 'fin-read', label: '資料読込（残高・取引履歴・凍結確認等）', readyOnReceipt: true }] },
      '解約': { units: instUnits, own: instOwn, tasks: [{ prefix: 'cancel', label: '解約手続き' }] },
    }
    const unitExpanded = new Set<string>()  // 単位展開済みの業務（個別作業はスキップ）
    const kosekiLabel = (k: KosekiRequestRow) => {
      const dest = (k.request_to ?? '').trim() || '請求先未設定'
      const person = (k.target_person ?? '').trim()
      return `${dest}${person ? `（${person}）` : ''}`
    }

    intakeRoles.forEach((r, idx) => {
      if (!r.sagyou?.trim() || r.owner === '不要') return
      // 戸籍の「到着確認・チェック」は請求先ごとの「戸籍読込」に置き換えるためスキップ（戸籍収集の展開で生成）。
      if (r.gyomu === '戸籍' && r.sagyou.includes('到着確認')) return
      // 戸籍収集 → 請求先（役所）ごとに展開。請求グループ(自社取得のみ・着手OK)の後に読込グループ(全件・受領次第OK)。
      // 依頼者取得の戸籍は請求タスクを作らず、読込（到着確認）のみ。source_rid で1対1リンク（重複生成を防ぐ）。
      const isKosekiCollect = r.gyomu === '戸籍' && r.sagyou.includes('戸籍収集')
      if (isKosekiCollect) {
        if (kosekiRequests.length > 0) {
          kosekiRequests.filter(k => isOwn(k.acquirer)).forEach(k => out.push({ key: `koseki:${k.id}`, gyomu: '戸籍', title: `戸籍請求：${kosekiLabel(k)}`, rid: `koseki:${k.id}`, ready: true }))
          kosekiRequests.forEach(k => out.push({ key: `koseki-read:${k.id}`, gyomu: '戸籍', title: `戸籍読込：${kosekiLabel(k)}`, rid: `koseki-read:${k.id}`, readyOnReceipt: true }))
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
        out.push({ key: 'family-tree-recv', gyomu: r.gyomu, title: '法定相続情報一覧図の受領', rid: 'family-tree-recv', readyOnReceipt: true })
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
      out.push({ key: r.rid ?? `role:${idx}`, gyomu: r.gyomu, title: r.sagyou, roleIdx: idx, rid: r.rid })
    })
    // 経理タスクは一括生成の対象外（今後アラートで対応）。
    // 他事業者紹介で登録した業者への「依頼／引継ぎ」タスク
    for (const r of caseReferrals) {
      const title = REFERRAL_TASK_LABEL[r.partner_type] ?? `${r.partner_type}依頼`
      out.push({ key: `referral:${r.id}`, gyomu: '他事業者紹介', title, rid: `referral:${r.id}` })
    }
    return out
  }, [intakeRoles, caseReferrals, kosekiRequests, properties, financialAssets])

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

  const isGenerated = (c: Candidate) => !!c.rid && generatedRids.has(c.rid)
  const selectable = candidates.filter(c => !isGenerated(c))

  // ① 開いた瞬間、未生成の候補を全部チェック済みにする（外したいものだけ外す運用）。
  useEffect(() => {
    if (isOpen) setSelected(new Set(candidates.filter(c => !isGenerated(c)).map(c => c.key)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  const toggleAll = () => setSelected(prev => prev.size === selectable.length ? new Set() : new Set(selectable.map(c => c.key)))
  const toggleGyomu = (gyomu: string) => {
    const items = selectable.filter(c => c.gyomu === gyomu)
    const allOn = items.every(c => selected.has(c.key))
    setSelected(prev => { const next = new Set(prev); items.forEach(c => allOn ? next.delete(c.key) : next.add(c.key)); return next })
  }

  const handleGenerate = async () => {
    if (selected.size === 0) return
    setSaving(true); setError('')
    const supabase = createClient()
    const picked = candidates.filter(c => selected.has(c.key))

    // 1. 実施タスク行に rid を採番（未採番のみ）→ intake_roles を更新
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
      if (e) { setSaving(false); setError(`実施タスクの更新に失敗しました: ${e.message}`); return }
    }

    // 2. タスク生成（source_rid リンク・手順は対応テンプレから流用）
    const rows = picked.map((c, i) => ({
      case_id: caseId,
      task_kind: 'case' as const,
      title: c.title,
      phase: c.gyomu,
      category: c.gyomu,
      status: '着手前',
      priority: '通常',
      source_rid: ridByKey[c.key] ?? null,
      work_role: 'assistant',
      procedure_text: null,  // テンプレの自動流し込みは廃止。作業内容は空欄から手入力。
      // 請求(起点)＝着手OK／読込等＝受領次第OK。それ以外は無し。
      ext_data: c.ready ? { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' }
        : c.readyOnReceipt ? { ready_on_receipt: true }
        : null,
      sort_order: i,
    }))
    const { error: e2 } = await supabase.from('tasks').insert(rows)
    if (e2) { setSaving(false); setError(`生成に失敗しました: ${e2.message}`); return }

    setSaving(false); setSelected(new Set()); onSaved(); onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="タスク一括生成"
      maxWidth="max-w-2xl"
      footer={
        <>
          <span className="text-sm text-gray-500 mr-auto">{selected.size} 件選択</span>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={handleGenerate} disabled={saving || selected.size === 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? '生成中...' : `${selected.size} 件生成`}
          </button>
        </>
      }
    >
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {kosekiCoarse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] rounded-lg p-3 mb-4">
          <span className="font-semibold">戸籍の請求先（役所）が未入力です。</span>
          先に実務タブ＞戸籍表へ役所を入れてから生成すると、<span className="font-semibold">役所ごと</span>に請求・読込タスクが分かれます。
          このまま生成すると粗い「戸籍請求」1件になります（あとから戸籍表で「役所ごとに展開」も可能）。
        </div>
      )}
      {finCoarse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] rounded-lg p-3 mb-4">
          <span className="font-semibold">金融機関が未入力です。</span>
          先に財産調査＞金融の表へ金融機関を入れてから生成すると、<span className="font-semibold">銀行ごと</span>に資料請求・読込タスクが分かれます。
        </div>
      )}
      {reCoarse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] rounded-lg p-3 mb-4">
          <span className="font-semibold">物件が未入力です。</span>
          先に財産調査＞不動産の表へ物件を入れてから生成すると、<span className="font-semibold">市区町村ごと</span>に請求・読込タスクが分かれます。
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          生成できる実施タスクがありません。<br />
          先に「受注内容」タブで受注区分・役割分担（実施タスク）を設定してください。
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">実施タスク（役割分担）からタスクを生成します</p>
            <button onClick={toggleAll} className="text-xs text-brand-600 font-medium hover:underline">
              {selected.size === selectable.length ? '全解除' : '全選択'}
            </button>
          </div>
          <div className="space-y-4">
            {koteiGrouped.map(([kotei, gyomuGroups]) => (
            <div key={kotei} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-[3px] h-3.5 bg-brand-500 rounded-[1px]" />
                <span className="text-[13px] font-bold text-brand-800">{kotei}</span>
              </div>
              {gyomuGroups.map(group => {
              const sel = group.items.filter(c => !isGenerated(c))
              const selectedInGyomu = sel.filter(c => selected.has(c.key)).length
              // ⑤ 全部生成済みの業務は畳んで薄く表示（開いたら中身を見せる）。
              const allDone = sel.length === 0 && group.items.length > 0
              if (allDone && !doneExpanded.has(group.gyomu)) {
                return (
                  <button key={group.gyomu} onClick={() => setDoneExpanded(prev => new Set(prev).add(group.gyomu))}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-2.5 bg-gray-50/60 opacity-70 hover:opacity-100 transition-opacity">
                    <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" strokeWidth={2.25} />
                    <span className="text-sm font-medium text-gray-600 flex-1 text-left">{group.gyomu}</span>
                    <span className="text-xs text-gray-400">すべて生成済み（{group.items.length}）</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  </button>
                )
              }
              return (
                <div key={group.gyomu} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => toggleGyomu(group.gyomu)} className="w-full px-4 py-2.5 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-brand-500" />
                    <span className="text-sm font-semibold text-gray-900 flex-1 text-left">{group.gyomu}</span>
                    <span className="text-xs text-gray-400">{selectedInGyomu}/{sel.length}</span>
                  </button>
                  <div className="divide-y divide-gray-50">
                    {group.items.map(c => {
                      const gen = isGenerated(c)
                      return (
                        <label key={c.key} className={`flex items-center gap-3 px-4 py-2 text-sm ${gen ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={selected.has(c.key)} disabled={gen} onChange={() => toggle(c.key)} className="accent-brand-600 w-3.5 h-3.5" />
                          <span className="flex-1 text-gray-700">{c.title}</span>
                          {gen && (
                            <span className="text-[12px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">生成済</span>
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
        </>
      )}
    </Modal>
  )
}

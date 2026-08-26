'use client'

// 戸籍請求（実務）：TOP（進捗サマリー＋取得状況表＋相続相関図）＋左レール（請求単位タブ）。
// 各請求はカード形式。費用（予算/返金/確定）＋ダブルチェック（自分以外）。追加請求は管理担当の承認ゲート。

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Table2, Lock, ShieldCheck, Trash2, Inbox, Split, Copy, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import { useIsManager } from '@/components/providers/AuthProvider'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { SectionHeading } from '@/components/ui/InlineFields'
import HintTip from '@/components/ui/HintTip'
import {
  KOSEKI_REQUEST_TYPES, KOSEKI_RANGES, KOSEKI_REQUEST_REASONS,
  KOSEKI_DOC_FORMS, KOSEKI_FIRMS, JUMINHYO_EXTRA_ITEMS, KOSEKI_SUBMIT_TO_DEFAULT, KOSEKI_SUBMIT_TO_OPTIONS,
  mixesKosekiAndJuminhyo, includesKoseki, includesJuminhyo,
  KOSEKI_REQUEST_KINDS, REQUEST_KIND_HELP, isMistakenRequest,
  HEIR_RELATIONSHIPS,
} from '@/lib/constants'

// 請求区分の説明（列見出しの「?」）。定義は constants.ts の1か所。
const KIND_HINT = KOSEKI_REQUEST_KINDS.map(k => `${k}：${REQUEST_KIND_HELP[k]}`).join('\n')
import ProgressSummary from './ProgressSummary'
import KosekiImagePanel from './KosekiImagePanel'
import { TxtCell, SelCell, MultiCell, DateCell, MoneyCell } from './PracticeTableCells'
import SelectOrTextField from './SelectOrTextField'
import KosekiRequestDocumentModal from './KosekiRequestDocumentModal'
import CheckRequestControl from './CheckRequestControl'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
import AnnotatedImage from './AnnotatedImage'
import KosekiImageViewer, { type ViewerImage } from './KosekiImageViewer'
import ImageAnnotator from './ImageAnnotator'
import { useKosekiImages } from '@/lib/useKosekiImages'
import type { Anno } from '@/lib/imageAnnotations'
import Modal from '@/components/ui/Modal'
import type { KosekiRequestRow, HeirRow, CaseRow, TaskRow } from '@/types'

const yen = (n: number | null) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)
const ACQUIRERS = ['自社', '依頼者']
// 確定費用（戸籍は予算−返金）
const effConfirmed = (r: KosekiRequestRow) => (r.cost_budget != null ? r.cost_budget - (r.cost_refund ?? 0) : null)
const reqLabel = (r: KosekiRequestRow) => [r.request_to, r.target_person].filter(Boolean).join('・') || '新規請求'

export default function KosekiSection({ caseId, caseData, requests: rawRequests, heirs = [], tasks = [], onRefresh }: {
  caseId: string
  caseData: CaseRow
  requests: KosekiRequestRow[]
  heirs?: HeirRow[]
  tasks?: TaskRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const isManager = useIsManager()
  // 保存できた値をサーバー再取得が返るまで重ねておく（入力してから反映されるまでのラグ対策）。
  // サーバーの値が変わったら上書きは剥がす（他の人の編集が消えないように）。
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<KosekiRequestRow>>>({})
  const [seenRaw, setSeenRaw] = useState(rawRequests)
  if (seenRaw !== rawRequests) { setSeenRaw(rawRequests); setLocalEdits({}) }
  const requests = rawRequests.map(r => (localEdits[r.id] ? { ...r, ...localEdits[r.id] } : r))
  // 戸籍画像は取得状況の表（行＝対象者）から開く。
  // 以前は TOPの右上パネル・相関図のサムネイル・対象者タブ の3か所にあり、
  // どこから開いたかで見え方が変わっていたので、表の行に一本化した。
  const { rows: kosekiImages, urls: kosekiImageUrls, setRows: setKosekiImages } = useKosekiImages(caseId)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [editImageId, setEditImageId] = useState<string | null>(null)
  const imagesByName: Record<string, typeof kosekiImages> = {}
  for (const r of kosekiImages) {
    ;(imagesByName[(r.target_person ?? '').trim()] ??= []).push(r)
  }
  // ビューアの並びは表と同じ（表の上から順に、その人の画像）。
  // 表と順番がずれると、横送りしたときにどこにいるのか分からなくなる。
  const viewerImages: ViewerImage[] = (() => {
    const seen = new Set<string>()
    const out: ViewerImage[] = []
    // 並びは「人ごと → その人の請求（役所）ごと」。パネルの仕切りと同じ順にする。
    const reqLabelOf = (id: string | null) => {
      if (!id) return null
      const rq = requests.find(x => x.id === id)
      return rq ? ((rq.request_to ?? '').trim() || '請求先未設定') : null
    }
    const push = (person: string) => {
      if (seen.has(person)) return
      seen.add(person)
      const mine = imagesByName[person] ?? []
      const order = requests.filter(r => (r.target_person ?? '').trim() === person).map(r => r.id)
      const rank = (r: { koseki_request_id: string | null }) => {
        const i = r.koseki_request_id ? order.indexOf(r.koseki_request_id) : -1
        return i < 0 ? order.length : i   // 請求 未指定は後ろ
      }
      for (const r of [...mine].sort((a, b) => rank(a) - rank(b))) {
        out.push({
          id: r.id, person, requestLabel: reqLabelOf(r.koseki_request_id),
          url: kosekiImageUrls[r.id], annos: r.annotations ?? [], fileName: r.file_name,
        })
      }
    }
    for (const r of requests) push((r.target_person ?? '').trim())
    for (const person of Object.keys(imagesByName)) push(person)   // 請求が無い人の画像も後ろに足す
    return out
  })()
  const editImage = editImageId ? kosekiImages.find(r => r.id === editImageId) ?? null : null
  const saveImageAnnotations = async (id: string, annos: Anno[]) => {
    const { error } = await supabase.from('koseki_images')
      .update({ annotations: annos, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    setKosekiImages(prev => prev.map(r => (r.id === id ? { ...r, annotations: annos } : r)))
    showToast('書き込みを保存しました', 'success')
  }
  const memberId = useCurrentMember(null)
  // タスク詳細からの着地：?focus=戸籍請求ID。該当行の対象者レールを開き、行をハイライト。
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusReq = focusId ? requests.find(r => r.id === focusId) : undefined
  const [sub, setSub] = useState<string>(focusReq ? ((focusReq.target_person ?? '').trim() || '__unset__') : 'top')
  // 戸籍の追加は2通り。何が起きるかボタン名で言い切るため、モーダルも入口で分ける。
  //   new      … 戸籍を読んで出てきた人を足す（相続人一覧にも登録される）
  //   existing … 既にいる対象者の戸籍をもう1件足す（転籍先の役所など）
  const [addTarget, setAddTarget] = useState<{ mode: 'new' } | { mode: 'existing'; person: string } | null>(null)
  // 戸籍請求書を出す行。1行＝依頼書1枚なので、その行だけを入れて出力画面を開く。
  // 戸籍請求書のモーダル。1行ぶん（表のアイコン）でも、その人の分まとめて（見出しのボタン）でも開く。
  const [docRequests, setDocRequests] = useState<KosekiRequestRow[] | null>(null)
  const [memoByName, setMemoByName] = useState<Record<string, string>>({})  // 人ごとの進捗/結果メモ（相関図ホバー用）
  const deceasedName = caseData.deceased_name


  // 人ごとの進捗/結果メモ（scope=koseki_person_<name>）を読み込み、相関図ホバーに反映。
  // 状態は廃止し請求日/到着日から自動判定。②カードはメモ専用。
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('progress_summaries').select('scope_key, body').eq('case_id', caseId).like('scope_key', 'koseki_person_%')
      if (!alive || !data) return
      const map: Record<string, string> = {}
      for (const d of data as { scope_key: string; body: string | null }[]) {
        const key = d.scope_key.replace('koseki_person_', '')
        map[key === 'unset' ? '' : key] = d.body ?? ''
      }
      setMemoByName(map)
    })()
    return () => { alive = false }
  }, [caseId, supabase, requests.length])

  // 保存したぶんを画面へ即反映する。DBに書いたあと onRefresh?.()（サーバー再取得）を待つと
  // 一拍おいて値が変わる／選び直したものが元に戻る、という見え方になっていた。
  // ここで持つのは「保存できた値」だけ。再取得が返ってきたら、そちらが新しいので上書きは剥がす。
  const applyLocal = (id: string, patch: Partial<KosekiRequestRow>) => {
    setLocalEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }
  const saveField = async (id: string, field: keyof KosekiRequestRow, value: unknown) => {
    const v = value === '' ? null : value
    applyLocal(id, { [field]: v } as Partial<KosekiRequestRow>)
    const { error } = await supabase.from('koseki_requests').update({ [field]: v }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const saveMany = async (id: string, patch: Partial<KosekiRequestRow>) => {
    applyLocal(id, patch)
    const { error } = await supabase.from('koseki_requests').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  // 戸籍の追加は1本に統一。needsApproval=true（予定外の追加）なら管理担当の承認待ち＋通知。
  // 戸籍を読むと知らない人が出てくる。その場で対象者として足せるようにし、
  // 同時に相続人一覧にも登録する（続柄は分からなければ未設定のまま。あとで直す）。
  // 相続人ではない人（被代襲者・数次相続の被相続人）も、戸籍は取るのでここに入る。
  const submitAdd = async (form: { target_person: string; request_to: string; reason: string; needsApproval: boolean; isNewPerson?: boolean; relationship?: string }) => {
    const person = (form.target_person ?? '').trim()
    // 同じ名前が既にいれば作らない（戸籍を読むと同じ人が何度も出てくるため）
    if (form.isNewPerson && person && !heirs.some(h => (h.name ?? '').trim() === person)) {
      const { error: he } = await supabase.from('heirs').insert({
        case_id: caseId, name: person,
        relationship_type: form.relationship || null,
        sort_order: heirs.length,
      })
      if (he) { showToast(`相続人一覧への追加に失敗: ${he.message}`, 'error'); return }
    }
    // オーダーシート（戸籍の取得計画）の見立てを、請求範囲の初期値にする。役所ごとに書き換えられる。
    const { data: planRow } = await supabase
      .from('koseki_plans').select('range_text').eq('case_id', caseId).eq('person_name', person).maybeSingle()
    const plan = planRow as { range_text: string | null } | null
    const { data, error } = await supabase.from('koseki_requests')
      .insert({
        case_id: caseId, sort_order: requests.length,
        is_additional: form.needsApproval,
        additional_reason: form.needsApproval ? (form.reason || null) : null,
        target_person: form.target_person || null,
        request_to: form.request_to || null,
        range_text: plan?.range_text ?? null,
        submit_to: KOSEKI_SUBMIT_TO_DEFAULT,
      })
      .select('id').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    if (form.needsApproval) {
      // 管理担当へ通知（承認依頼）
      const { data: mgrs } = await supabase.from('members').select('id').eq('primary_role', 'manager').eq('is_active', true)
      const rows = (mgrs ?? []).map(m => ({ member_id: (m as { id: string }).id, type: 'koseki_additional', case_id: caseId, title: '追加戸籍請求の承認依頼', body: `${form.target_person || '対象者未定'}／${form.request_to || '請求先未定'}：${form.reason}` }))
      if (rows.length) await supabase.from('notifications').insert(rows)
    }
    setAddTarget(null)
    setSub((form.target_person || '').trim() || '__unset__')
    showToast(form.needsApproval ? '戸籍を追加しました（要承認・管理担当へ通知）' : '戸籍を追加しました', 'success')
    onRefresh?.()
  }

  const approveAdditional = async (r: KosekiRequestRow) => {
    await saveMany(r.id, { additional_approved_by: memberId, additional_approved_at: new Date().toISOString() })
    // 承認された追加戸籍請求に、通常の戸籍と同じく紐づきタスクを自動生成（source_rid付き・既存はスキップ）。
    // これでタスク詳細から「実務タブで作業」→ 該当行にハイライト着地できる。
    const dest = (r.request_to ?? '').trim() || '請求先未設定'
    const person = (r.target_person ?? '').trim()
    const label = `${dest}${person ? `（${person}）` : ''}`
    const isOwn = (r.acquirer ?? '自社') !== '依頼者'  // 自社取得＝請求＋読込／依頼者取得＝読込のみ
    const plan: { source_rid: string; title: string; ext_data: Record<string, unknown> }[] = []
    if (isOwn) plan.push({ source_rid: `koseki:${r.id}`, title: `戸籍請求：${label}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
    plan.push({ source_rid: `koseki-read:${r.id}`, title: `戸籍読込：${label}`, ext_data: { ready_on_receipt: true } })
    const { data: existing } = await supabase.from('tasks').select('source_rid').eq('case_id', caseId).in('source_rid', plan.map(p => p.source_rid))
    const have = new Set(((existing ?? []) as { source_rid: string }[]).map(x => x.source_rid))
    const toInsert = plan.filter(p => !have.has(p.source_rid)).map((p, i) => ({
      case_id: caseId, task_kind: 'case', title: p.title, phase: '戸籍', category: '戸籍',
      status: '着手前', priority: '通常', source_rid: p.source_rid, work_role: 'assistant', ext_data: p.ext_data, sort_order: 90 + i,
    }))
    if (toInsert.length > 0) await supabase.from('tasks').insert(toInsert)
    onRefresh?.()
  }

  // 同じ条件でもう一度出す（再請求）。請求先・対象者・範囲・種別・理由だけ引き継ぎ、
  // 日付・費用・チェック・読込結果は空で作る。区分は「再請求」を初期値にする。
  const copyRequest = async (r: KosekiRequestRow) => {
    const { error } = await supabase.from('koseki_requests').insert({
      case_id: caseId,
      target_person: r.target_person,
      request_to: r.request_to,
      range_text: r.range_text,
      doc_types: r.doc_types,
      request_reason: r.request_reason,
      request_reason_other: r.request_reason_other,
      acquirer: r.acquirer,
      request_kind: '再請求',
      sort_order: (r.sort_order ?? 0) + 1,
    })
    if (error) { showToast(`コピーに失敗: ${error.message}`, 'error'); return }
    showToast('再請求の行を作りました', 'success')
    onRefresh?.()
  }

  const delRequest = async (r: KosekiRequestRow) => {
    if (!confirm(`「${reqLabel(r)}」の戸籍請求を削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().eq('id', r.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  // グループ一括削除：その人の戸籍請求をまとめて削除
  const deletePersonGroup = async (personId: string) => {
    const person = personId === '__unset__' ? '' : personId
    const targets = requests.filter(r => (r.target_person ?? '').trim() === person)
    const label = personId === '__unset__' ? '対象者 未設定' : personId
    if (targets.length === 0) return
    if (!confirm(`「${label}」の戸籍請求${targets.length}件をすべて削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().in('id', targets.map(r => r.id))
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (sub === personId) setSub('top')
    showToast(`「${label}」の戸籍請求を削除しました`, 'success')
    onRefresh?.()
  }

  const confirmedTotal = requests.reduce((s, r) => s + (effConfirmed(r) ?? 0), 0)

  // 人ごとの状態は戸籍請求の実績から自動判定（依頼→確認モデルに合わせる）。②はメモ専用。
  // 完了＝依頼者取得は到着済／自社取得は到着チェック✓済。1件でも動きあり＝対応中。
  const statusForName = (name: string) => {
    const reqs = requests.filter(r => (r.target_person ?? '').trim() === name.trim())
    if (!reqs.length) return '未着手'
    const rel = reqs.filter(r => r.acquirer !== '依頼者')
    const use = rel.length ? rel : reqs
    const allDone = use.every(r => r.acquirer === '依頼者' ? !!r.arrival_date : !!r.receipt_check_at)
    if (allDone) return '完了'
    if (use.some(r => !!r.request_date || !!r.arrival_date)) return '対応中'
    return '未着手'
  }
  // 相関図ホバー用のメモは②進捗/結果カード（koseki_person_<name>）から取得。
  const bodyForName = (name: string) => memoByName[name.trim()] ?? ''
  // 取得状況リスト：被相続人＋相続人（続柄付き）
  const peopleRows = [
    { name: deceasedName ?? '', rel: '被相続人' },
    ...heirs.map(h => ({ name: h.name, rel: (h.relationship_type || h.relationship || '').trim() || '相続人' })),
  ].filter(p => p.name.trim())
  // 相続関係説明図の枠色＋ホバー用（氏名→状態＋進捗/結果）
  const statusByName = Object.fromEntries(peopleRows.map(p => [p.name.trim(), { status: statusForName(p.name), body: bodyForName(p.name) }]))

  // 人（被相続人・相続人＝対象者）ごとにグループ化。1人の戸籍チェーン（複数役所）を1タブにまとめる。
  const personKey = (r: KosekiRequestRow) => (r.target_person ?? '').trim()
  const knownPeople = peopleRows.map(p => p.name.trim())
  // requests にあるが人リストに無い対象者も拾う（自由入力対応）
  const extraPeople = [...new Set(requests.map(personKey).filter(n => n && !knownPeople.includes(n)))]
  const people = [...peopleRows.map(p => ({ name: p.name.trim(), rel: p.rel })), ...extraPeople.map(n => ({ name: n, rel: '' }))]
  const hasUnsetPerson = requests.some(r => !personKey(r))
  const railTabs = [
    { id: 'top', label: '一覧（TOP）' },
    ...people.map(p => ({ id: p.name, label: p.rel ? `${p.name}（${p.rel}）` : p.name })),
    ...(hasUnsetPerson ? [{ id: '__unset__', label: '対象者 未設定' }] : []),
  ]
  const activePerson = sub === '__unset__' ? '' : sub
  // 左レール・見出しで使う続柄。被相続人は続柄を持たないので出さない。
  const heirByName = new Map(heirs.map(h => [(h.name ?? '').trim(), h]))
  // 続柄は新項目(relationship_type)が正だが、古い案件は旧項目(relationship)にしか入っていない。
  // 相続人一覧のバッジは両方を見ているので、ここだけ新項目だけ見ると
  // 一覧には「配偶者」と出ているのにレールは「続柄 未設定」になってしまう。
  const relOf = (name: string) => {
    const h = heirByName.get(name.trim())
    return (h?.relationship_type || h?.relationship || '').trim()
  }
  // 筆頭者／世帯主の候補。被相続人＋相続人の氏名（一覧に無い人は自由入力へ切り替える）
  const personNames = [...new Set(peopleRows.map(p => p.name.trim()).filter(Boolean))]
  const personRequests = requests.filter(r => personKey(r) === activePerson)
  // 承認待ちの追加戸籍請求（案件全体）。戸籍請求タブ上部にパネルで出し、横スクロール無しで承認できる。
  const pendingApprovals = requests.filter(r => r.is_additional && !r.additional_approved_at)

  // 請求先未入力のまま作られた「粗い戸籍請求」タスク（役所ごとに割れていない）。役所を入れた後に展開し直せる。
  const [expanding, setExpanding] = useState(false)
  const coarseKoseki = tasks.find(t => normalizeTaskStatus(t.status) !== '完了' && t.title === '戸籍請求' && !(t.source_rid ?? '').startsWith('koseki'))
  const expandCoarseKoseki = async () => {
    if (!coarseKoseki || requests.length === 0) return
    setExpanding(true)
    const isOwn = (a: string | null) => (a ?? '自社') !== '依頼者'
    const label = (r: KosekiRequestRow) => { const dest = (r.request_to ?? '').trim() || '請求先未設定'; const p = (r.target_person ?? '').trim(); return `${dest}${p ? `（${p}）` : ''}` }
    const plan: { rid: string; title: string; ext: Record<string, unknown> }[] = []
    requests.filter(r => isOwn(r.acquirer)).forEach(r => plan.push({ rid: `koseki:${r.id}`, title: `戸籍請求：${label(r)}`, ext: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } }))
    requests.forEach(r => plan.push({ rid: `koseki-read:${r.id}`, title: `戸籍読込：${label(r)}`, ext: { ready_on_receipt: true } }))
    const existing = new Set(tasks.map(t => t.source_rid).filter(Boolean) as string[])
    const rows = plan.filter(p => !existing.has(p.rid)).map((p, i) => ({
      case_id: caseId, task_kind: 'case', title: p.title, phase: '戸籍', category: '戸籍',
      status: '着手前', priority: '通常', source_rid: p.rid, work_role: 'assistant', ext_data: p.ext, sort_order: 80 + i,
    }))
    if (rows.length > 0) { const { error } = await supabase.from('tasks').insert(rows); if (error) { showToast(`展開に失敗しました: ${error.message}`, 'error'); setExpanding(false); return } }
    await supabase.from('tasks').delete().eq('id', coarseKoseki.id)   // 粗いタスクは消して二重生成を防ぐ
    showToast(`役所ごとに${rows.length}件のタスクへ展開しました`, 'success')
    setExpanding(false); onRefresh?.()
  }

  return (
    <div>
      {coarseKoseki && requests.length > 0 && (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 p-3 flex items-start gap-2 flex-wrap">
          <Split className="w-4 h-4 text-brand-700 mt-0.5 flex-none" />
          <div className="flex-1 min-w-0 text-[12.5px] text-brand-800">
            <span className="font-semibold">粗い「戸籍請求」タスクがあります。</span>
            現在の役所（{requests.length}件）ごとに、請求・読込タスクへ展開できます（元の粗いタスクは消えます）。
          </div>
          <button type="button" onClick={expandCoarseKoseki} disabled={expanding} className="flex-none inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
            <Split className="w-3.5 h-3.5" />{expanding ? '展開中…' : '役所ごとに展開'}
          </button>
        </div>
      )}
      {pendingApprovals.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800 mb-2">
            <Lock className="w-3.5 h-3.5" />承認待ちの追加戸籍請求　{pendingApprovals.length}件
          </div>
          <div className="space-y-2">
            {pendingApprovals.map(r => (
              <div key={r.id} className="bg-white border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <button type="button" onClick={() => setSub((r.target_person ?? '').trim() || '__unset__')} className="text-[12.5px] font-semibold text-gray-800 hover:text-brand-700 hover:underline">
                    {r.target_person || '対象者未定'} ／ {r.request_to || '役所未定'}
                  </button>
                  <div className="text-[12px] text-gray-600 mt-0.5">理由：{r.additional_reason || <span className="text-gray-400">（未記入）</span>}</div>
                </div>
                {isManager ? (
                  <button type="button" onClick={() => approveAdditional(r)} className="flex-none inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700">
                    <ShieldCheck className="w-3.5 h-3.5" />追加OK（承認）
                  </button>
                ) : (
                  <span className="flex-none text-[11px] text-amber-700 self-center">管理担当の承認待ち</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    <div className="flex gap-3 items-start">
      {/* 左レール（対象者＝人ごと）。案件の色が透けないよう白いカードに載せる。 */}
      <div className="flex-none w-52 flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg p-1.5 self-start">
        {railTabs.map(t => {
          const isTop = t.id === 'top'
          const person = t.id === '__unset__' ? '' : t.id
          const reqs = isTop ? [] : requests.filter(r => personKey(r) === person)
          const received = reqs.some(r => !!r.arrival_date)
          const pending = reqs.some(r => r.is_additional && !r.additional_approved_at)
          return (
            <div key={t.id} className="group/rail relative flex items-center">
              <button type="button" onClick={() => setSub(t.id)}
                className={`flex-1 min-w-0 text-left text-[12px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 ${sub === t.id ? 'bg-brand-50 text-brand-700 font-semibold shadow-[inset_2px_0_0_var(--color-brand-600)]' : 'text-gray-600 hover:bg-gray-50'}`}>
                {isTop ? <Table2 className="w-3.5 h-3.5 flex-none" /> : pending ? <Lock className="w-3 h-3 flex-none text-amber-500" /> : <span className="w-3.5 h-3.5 flex-none" />}
                <span className="flex-1 break-words leading-tight">
                  {t.label}
                  {/* 続柄は相続人だけ。被相続人は続柄を持たないので出さない
                      （相続人一覧に居ない＝被相続人か自由入力の対象者。未設定とは違う） */}
                  {!isTop && t.id !== '__unset__' && heirByName.has(t.id.trim()) && (
                    <span className={`block text-[10px] font-normal leading-tight ${relOf(t.id) ? 'text-gray-400' : 'text-amber-600'}`}>
                      {relOf(t.id) || '続柄 未設定'}
                    </span>
                  )}
                </span>
                {!isTop && <span className="text-[9px] font-semibold px-1 rounded flex-none bg-gray-100 text-gray-600">{reqs.length}</span>}
                {received && <Inbox className="w-3 h-3 flex-none text-emerald-600" aria-label="受信済あり" />}
              </button>
              {!isTop && reqs.length > 0 && (
                <button type="button" onClick={() => deletePersonGroup(t.id)} title="この人の戸籍請求を一括削除"
                  className="flex-none ml-0.5 p-1 rounded text-gray-300 opacity-0 group-hover/rail:opacity-100 hover:text-red-500 hover:bg-red-50 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        })}
        {/* 戸籍を読んで新しい人が出てきたとき。TOPを見ている最中でも押せるようにする。 */}
        <button type="button" onClick={() => setAddTarget({ mode: 'new' })}
          className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-brand-300 text-brand-700 hover:bg-brand-50 inline-flex items-start gap-1">
          <Plus className="w-3 h-3 flex-none mt-0.5" /><span className="leading-tight">対象者を新規追加して戸籍請求</span>
        </button>
      </div>

      {/* 本文 */}
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey="koseki" title="進捗/結果（戸籍調査 全体）" />
            <div>
              <SectionHeading title="戸籍の取得状況" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 620 }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600">
                      <th className="px-2.5 py-2 text-left font-semibold w-28">対象者</th>
                      <th className="px-2.5 py-2 text-left font-semibold">請求先</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">請求日</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">到着日</th>
                      <th className="px-2.5 py-2 text-left font-semibold">進捗/メモ</th>
                      <th className="px-2.5 py-2 text-right font-semibold w-28">確定費用</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-24">戸籍画像</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">戸籍請求がありません。左下の「対象者を新規追加して戸籍請求」から登録してください。</td></tr>
                    ) : requests.map((r, i) => (
                      <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub((r.target_person ?? '').trim() || '__unset__')}>
                        {/* 対象者。ホバーで出る「＋戸籍」から、その人の戸籍をもう1件足せる（人を選び直さなくていい） */}
                        <td className="px-2.5 py-2 font-medium text-gray-800 group/cell">
                          {r.target_person || <span className="text-gray-300">—</span>}
                          {r.is_additional && <span className="ml-1 text-[10px] text-amber-600">追加</span>}
                          {(r.target_person ?? '').trim() && (
                            <button type="button" title={`${r.target_person} の戸籍を追加請求`}
                              onClick={e => { e.stopPropagation(); setAddTarget({ mode: 'existing', person: (r.target_person ?? '').trim() }) }}
                              className="ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded border border-brand-200 text-brand-700 bg-brand-50 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                              ＋戸籍
                            </button>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-gray-700">{r.request_to || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{r.request_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2">{r.arrival_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2 text-gray-500 text-[11px] max-w-[240px] truncate" title={r.read_result ?? ''}>{r.read_result || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2 text-right">{yen(effConfirmed(r))}</td>
                        {/* 戸籍画像：押すとビューアが開き、そこから全員ぶんを横送りできる */}
                        <td className="px-2.5 py-2" onClick={e => e.stopPropagation()}>
                          <KosekiImageCell
                            images={imagesByName[(r.target_person ?? '').trim()] ?? []}
                            urls={kosekiImageUrls}
                            onOpen={id => setViewerId(id)}
                            onAdd={() => setSub((r.target_person ?? '').trim() || '__unset__')}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={5}>確定費用 合計（立替実費の実績）</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700">{yen(confirmedTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 戸籍取得状況図：相続関係説明図に状態を枠色で反映＋ホバーで進捗/結果 */}
            <div>
              <SectionHeading title="戸籍の取得状況（相続関係説明図）" hint="枠の色＝戸籍の取得状況（緑=完了／青=対応中／橙=追加調査中／灰=未着手）。図の人物にマウスを乗せると、進み具合や結果が出ます。戸籍の画像は上の表の「戸籍画像」から開けます。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {heirs.length === 0 ? (
                <p className="text-[12px] text-gray-400 text-center py-4">相続人が未登録です。「相続人」タブで登録すると、ここに相続関係説明図が表示されます。</p>
              ) : (
                <div className="overflow-x-auto">
                  <InheritanceDiagramV2 deceased={caseData} heirs={heirs} statusByName={statusByName} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey={`koseki_person_${activePerson || 'unset'}`} title={`進捗/結果（${sub === '__unset__' ? '対象者 未設定' : activePerson}の戸籍）`}
              onSaved={v => setMemoByName(prev => ({ ...prev, [activePerson.trim()]: v.body }))} />
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <SectionHeading title={`${sub === '__unset__' ? '対象者 未設定' : activePerson}の戸籍（役所ごと・1行=1戸籍）`}
                hint="取得区分が「依頼者」の行は、請求日・費用・ダブルチェックが「依頼者負担」になり、入力できません。追加戸籍請求（要承認）は、管理担当が承認したあとに編集できます。どの項目も表の上で直接編集できます。"
                right={
                  <span className="flex items-center gap-2">
                    {/* 書類作成を経由せず、この人の請求そのままで戸籍請求書を出す */}
                    <button type="button" disabled={personRequests.length === 0}
                      onClick={() => setDocRequests(personRequests)}
                      title={personRequests.length === 0 ? '戸籍請求を登録すると作成できます' : `下の表の${personRequests.length}件がそのまま請求書の行になります`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed">
                      <FileText className="w-3.5 h-3.5" />戸籍請求書を作成
                    </button>
                  </span>
                }
                className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {personRequests.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-gray-400">この対象者の戸籍請求がありません。下の「この対象者の戸籍を追加請求」から登録してください（転籍が判明したら役所を足していきます）。</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-[12px] border-collapse" style={{ minWidth: 2200, width: 'max-content' }}>
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600">
                        <th className="px-2 py-2 text-left font-semibold w-24">
                          <span className="inline-flex items-center gap-1">請求区分<HintTip text={KIND_HINT} /></span>
                        </th>
                        <th className="px-2 py-2 text-left font-semibold w-20">取得区分</th>
                        <th className="px-2 py-2 text-left font-semibold w-20">請求法人</th>
                        <th className="px-2 py-2 text-left font-semibold w-40">請求先（役所）</th>
                        <th className="px-2 py-2 text-left font-semibold w-56">
                          <span className="inline-flex items-center gap-1">請求の種別①<HintTip text="依頼書1枚で何を頼むか。戸籍と戸籍の附票は1枚で請求できますが、戸籍と住民票は1枚では請求できません（行を分けてください）。" /></span>
                        </th>
                        <th className="px-2 py-2 text-left font-semibold w-28">種別②<span className="block text-[10px] font-normal text-brand-700">戸籍のとき</span></th>
                        <th className="px-2 py-2 text-left font-semibold w-32">筆頭者／世帯主</th>
                        <th className="px-2 py-2 text-left font-semibold w-64">基礎証明外事項<span className="block text-[10px] font-normal text-brand-700">住民票のとき</span></th>
                        <th className="px-2 py-2 text-left font-semibold w-32">請求範囲</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">
                          <span className="inline-flex items-center gap-1">提出先<HintTip text={`取り寄せた戸籍を、最後にどこへ出すか（＝この戸籍の行き先）です。

既定は「${KOSEKI_SUBMIT_TO_DEFAULT}」。法務局・金融機関・家庭裁判所など、原本を提出する先が決まっているときに書き換えてください。
請求先（役所）＝取りに行く先とは別です。`} /></span>
                        </th>
                        <th className="px-2 py-2 text-left font-semibold w-36">戸籍請求理由</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">請求日</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">到着日</th>
                        <th className="px-2 py-2 text-right font-semibold w-24">費用予算</th>
                        <th className="px-2 py-2 text-right font-semibold w-20">返金</th>
                        <th className="px-2 py-2 text-right font-semibold w-24">確定費用</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">発送チェック<span className="block text-[10px] font-normal text-brand-700">確認簿で確認</span></th>
                        <th className="px-2 py-2 text-left font-semibold w-32">到着チェック<span className="block text-[10px] font-normal text-brand-700">確認簿で確認</span></th>
                        <th className="px-2 py-2 text-left font-semibold w-36">特記</th>
                        <th className="px-2 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {personRequests.map((r, i) => (
                        <KosekiRow key={r.id} r={r} i={i} meId={memberId}
                          highlight={r.id === focusId}
                          personNames={personNames}
                          saveField={saveField} saveMany={saveMany}
                          onDelete={() => delRequest(r)} onCopy={() => copyRequest(r)} onMakeDoc={() => setDocRequests([r])} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* 転籍で役所を遡るとき用。対象者は選択中の人で固定なので選び直さなくていい。 */}
              {sub !== '__unset__' && (
                <button type="button" onClick={() => setAddTarget({ mode: 'existing', person: activePerson })}
                  className="mt-2.5 inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100">
                  <Plus className="w-3.5 h-3.5" />この対象者の戸籍を追加請求
                </button>
              )}
            </div>
            {/* この人の戸籍のスキャン画像。アップロード直後に書き込むか聞く。 */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <KosekiImagePanel caseId={caseId} targetPerson={sub === '__unset__' ? '' : activePerson} requests={personRequests} title={`${sub === '__unset__' ? '対象者 未設定' : activePerson}の戸籍の画像`} />
            </div>
          </div>
        )}
      </div>
      {addTarget && <AddKosekiModal mode={addTarget.mode} person={addTarget.mode === 'existing' ? addTarget.person : ''} onClose={() => setAddTarget(null)} onSubmit={submitAdd} />}

      {/* 戸籍請求書。この行の内容（請求先・対象者・種別・筆頭者・範囲）がそのまま入る */}
      {docRequests && (
        <KosekiRequestDocumentModal
          isOpen
          onClose={() => setDocRequests(null)}
          caseData={caseData}
          tasks={tasks}
          heirs={heirs}
          kosekiRequests={docRequests}
        />
      )}

      {/* 戸籍画像のビューア。閉じずに全員ぶんを横送りできる */}
      {viewerId && (
        <KosekiImageViewer
          images={viewerImages}
          startId={viewerId}
          onClose={() => setViewerId(null)}
          onEdit={id => { setViewerId(null); setEditImageId(id) }}
        />
      )}
      {editImage && (
        <ImageAnnotator
          isOpen
          onClose={() => setEditImageId(null)}
          imageUrl={kosekiImageUrls[editImage.id] ?? ''}
          initial={editImage.annotations ?? []}
          title={`${editImage.target_person ? `${editImage.target_person}の戸籍 — ` : ''}${editImage.file_name ?? '画像'}`}
          onSave={annos => saveImageAnnotations(editImage.id, annos)}
        />
      )}
    </div>
    </div>
  )
}

// 取得状況の表の「戸籍画像」セル。1枚目のサムネイル＋枚数。無ければ対象者タブへ誘導する。
function KosekiImageCell({ images, urls, onOpen, onAdd }: {
  images: Array<{ id: string; annotations: Anno[] | null }>
  urls: Record<string, string>
  onOpen: (id: string) => void
  onAdd: () => void
}) {
  if (images.length === 0) {
    return (
      <button type="button" onClick={onAdd}
        title="この対象者のタブを開いて画像を追加します"
        className="text-[11px] text-gray-400 border border-dashed border-gray-300 rounded px-1.5 py-0.5 hover:text-brand-700 hover:border-brand-300">
        ＋ 追加
      </button>
    )
  }
  const first = images[0]
  return (
    <button type="button" onClick={() => onOpen(first.id)}
      title={`戸籍の画像 ${images.length}枚を見る`}
      className="inline-flex items-center gap-1.5 group">
      <span className="block w-10 h-8 rounded border border-gray-300 overflow-hidden bg-gray-50 group-hover:border-brand-500">
        {urls[first.id]
          ? <AnnotatedImage url={urls[first.id]} annos={first.annotations ?? []} className="w-full h-full object-cover" />
          : <span className="block w-full h-full" />}
      </span>
      <span className="text-[11px] text-gray-500 group-hover:text-brand-700">{images.length}</span>
    </button>
  )
}

// 戸籍の追加。入口は2つで、開いた時点で「誰の戸籍か」は決まっている。
//   new      … 戸籍を読んで出てきた対象者を足す（相続人一覧にも登録される）
//   existing … 既にいる対象者の戸籍をもう1件足す（転籍先の役所など）
function AddKosekiModal({ mode, person, onClose, onSubmit }: {
  mode: 'new' | 'existing'
  person: string
  onClose: () => void
  onSubmit: (form: { target_person: string; request_to: string; reason: string; needsApproval: boolean; isNewPerson: boolean; relationship: string }) => void
}) {
  // 戸籍を読んで出てきた人をその場で足す。相続人一覧にも同時に登録される。
  const [newName, setNewName] = useState('')
  const [newRel, setNewRel] = useState('')
  const [reqTo, setReqTo] = useState('')
  const [reason, setReason] = useState('')
  const [needsApproval, setNeedsApproval] = useState(false)
  const [busy, setBusy] = useState(false)
  const inp = 'w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand-400 bg-white'
  const isNew = mode === 'new'
  const personName = isNew ? newName.trim() : person.trim()
  const canSubmit = !!personName && (!needsApproval || !!reason.trim())
  return (
    <Modal isOpen onClose={onClose} title={isNew ? '対象者を新規追加して戸籍請求' : `${person} さんの戸籍を追加請求`}>
      <div className="space-y-3">
        {!isNew && (
          <p className="text-[11.5px] text-brand-800 bg-brand-50 border border-brand-100 rounded-md px-3 py-2">
            対象者は <strong>{person}</strong> さんで固定です。転籍が判明したときなど、同じ人の戸籍をもう1件足します。
          </p>
        )}
        {isNew && (
          <div className="rounded-md border border-brand-200 bg-brand-50/50 px-3 py-2.5 space-y-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">氏名</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: 土曜二郎" className={inp} autoFocus />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">続柄（あとで直せます）</label>
              <select value={newRel} onChange={e => setNewRel(e.target.value)} className={inp}>
                <option value="">未設定</option>
                {HEIR_RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-[10.5px] text-gray-400 mt-1">
                この対象者は相続人一覧にも登録されます。続柄が分からなければ未設定のままで構いません。
                被代襲者や数次相続の被相続人など、相続人ではない人もここに入れてください。
              </p>
            </div>
          </div>
        )}
        <div><label className="block text-[11px] text-gray-500 mb-1">請求先（役所）</label><input value={reqTo} onChange={e => setReqTo(e.target.value)} placeholder="例: 江東区役所（転籍先など。後で入力も可）" className={inp} /></div>
        <label className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800 cursor-pointer">
          <input type="checkbox" checked={needsApproval} onChange={e => setNeedsApproval(e.target.checked)} className="w-4 h-4 accent-amber-500 mt-0.5" />
          <span className="flex-1"><strong>追加戸籍請求（要承認）</strong>にする — 当初の想定を超える追加の戸籍請求です。追加費用が発生するため、管理担当の承認（追加OK）を得てから請求します。</span>
        </label>
        {needsApproval && (
          <div><label className="block text-[11px] text-gray-500 mb-1">追加請求の理由（承認者に伝わるように） <span className="text-red-500">*</span></label><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="例：手続二子の戸籍が◯◯町で転籍。さらに前の本籍地へ遡って請求が必要。" className={`${inp} resize-none`} /></div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-gray-600 hover:text-gray-800">キャンセル</button>
          <button type="button" disabled={busy || !canSubmit} onClick={() => { setBusy(true); onSubmit({ target_person: personName, request_to: reqTo, reason: reason.trim(), needsApproval, isNewPerson: isNew, relationship: newRel }) }}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold text-white rounded-md disabled:opacity-50 ${needsApproval ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700'}`}>
            {needsApproval ? <><ShieldCheck className="w-3.5 h-3.5" />申請する（要承認）</> : <><Plus className="w-3.5 h-3.5" />追加する</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 戸籍1件＝1行。全項目をインライン編集（横スクロール）。要承認は行を帯にして承認ボタンを出す。
function KosekiRow({ r, i, meId, highlight = false, personNames = [], saveField, saveMany, onDelete, onCopy, onMakeDoc }: {
  r: KosekiRequestRow
  i: number
  meId: string | null
  highlight?: boolean
  /** 筆頭者／世帯主の候補（被相続人＋相続人）。一覧に無ければ自由入力に切り替える */
  personNames?: string[]
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  saveMany: (id: string, patch: Partial<KosekiRequestRow>) => Promise<void>
  onDelete: () => void
  onCopy: () => void
  onMakeDoc: () => void
}) {
  const rowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => { if (highlight && rowRef.current) rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [highlight])
  // 予定外の追加（要承認・未承認）は行を帯にして承認まで編集不可。
  if (r.is_additional && !r.additional_approved_at) {
    return (
      <tr className="border-b border-gray-100 last:border-b-0">
        <td colSpan={15} className="p-0">
          <div className="flex items-center gap-2.5 px-3 py-2 bg-amber-50 border-l-[3px] border-amber-400">
            <Lock className="w-4 h-4 flex-none text-amber-600" />
            <span className="flex-1 text-[12px] text-amber-800"><strong className="font-semibold">{r.request_to || '役所未定'}（追加・要承認）</strong> — 上部の「承認待ちの追加戸籍請求」で管理担当が承認すると、この行で各項目を編集できます。</span>
            <button type="button" onClick={onDelete} title="削除" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    )
  }

  const isClient = r.acquirer === '依頼者'  // 依頼者取得＝請求日・費用・DCは依頼者負担
  const mistaken = isMistakenRequest(r.request_kind)  // 誤請求＝費用はお客様に請求せず自社の経費
  const muted = <span className="text-[11px] text-gray-400">—</span>
  return (
    <tr ref={rowRef} className={`border-b border-gray-100 last:border-b-0 ${highlight ? 'bg-brand-50 ring-2 ring-brand-300 ring-inset' : mistaken ? 'bg-red-50/40' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
      <td className="px-2 py-1.5"><SelCell value={r.request_kind ?? '通常請求'} options={[...KOSEKI_REQUEST_KINDS]} onChange={v => saveField(r.id, 'request_kind', v)} /></td>
      <td className="px-2 py-1.5"><SelCell value={r.acquirer} options={ACQUIRERS} onChange={v => saveField(r.id, 'acquirer', v)} /></td>
      <td className="px-2 py-1.5"><SelCell value={r.request_firm} options={[...KOSEKI_FIRMS]} onChange={v => saveField(r.id, 'request_firm', v)} /></td>
      <td className="px-2 py-1.5"><TxtCell value={r.request_to} onCommit={v => saveField(r.id, 'request_to', v)} placeholder="役所名" /></td>
      {/* 請求の種別①。戸籍系と住民票系が混ざったら、1枚では請求できないので警告を出す（保存はできる）。 */}
      <td className="px-2 py-1.5">
        <MultiCell value={r.doc_types} options={[...KOSEKI_REQUEST_TYPES]} onChange={v => saveField(r.id, 'doc_types', v)} />
        {mixesKosekiAndJuminhyo(r.doc_types) && (
          <p className="mt-1 text-[10.5px] text-amber-700 leading-snug">戸籍と住民票は1枚で請求できません。行を分けてください</p>
        )}
      </td>
      <td className="px-2 py-1.5">
        {includesKoseki(r.doc_types)
          ? <MultiCell value={r.doc_form} options={[...KOSEKI_DOC_FORMS]} onChange={v => saveField(r.id, 'doc_form', v)} />
          : <span className="text-gray-300 text-[11px]">—</span>}
      </td>
      <td className="px-2 py-1.5"><SelectOrTextField value={r.head_person} options={personNames} onSave={v => saveField(r.id, 'head_person', v)} placeholder="筆頭者/世帯主" /></td>
      <td className="px-2 py-1.5">
        {includesJuminhyo(r.doc_types)
          ? <MultiCell value={r.juminhyo_items} options={[...JUMINHYO_EXTRA_ITEMS]} onChange={v => saveField(r.id, 'juminhyo_items', v)} />
          : <span className="text-gray-300 text-[11px]">—</span>}
      </td>
      <td className="px-2 py-1.5"><SelectOrTextField value={r.range_text} options={KOSEKI_RANGES} onSave={v => saveField(r.id, 'range_text', v)} placeholder="出生～死亡 等" /></td>
      <td className="px-2 py-1.5"><SelectOrTextField value={r.submit_to} options={KOSEKI_SUBMIT_TO_OPTIONS} onSave={v => saveField(r.id, 'submit_to', v)} placeholder={KOSEKI_SUBMIT_TO_DEFAULT} /></td>
      <td className="px-2 py-1.5"><SelCell value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onChange={v => saveField(r.id, 'request_reason', v)} /></td>
      <td className="px-2 py-1.5">{isClient ? <span className="text-[11px] text-gray-400">依頼者取得</span> : <DateCell value={r.request_date} onCommit={v => saveMany(r.id, { request_date: v || null, ...(v && !r.request_done_by ? { request_done_by: meId } : {}) })} />}</td>
      <td className="px-2 py-1.5"><DateCell value={r.arrival_date} onCommit={v => saveMany(r.id, { arrival_date: v || null, ...(v && !r.receipt_done_by ? { receipt_done_by: meId } : {}) })} /></td>
      {isClient ? (
        <>
          <td className="px-2 py-1.5 text-center"><span className="text-[11px] text-gray-400">依頼者負担</span></td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
        </>
      ) : (
        <>
          <td className="px-2 py-1.5"><MoneyCell value={r.cost_budget} onCommit={v => saveField(r.id, 'cost_budget', v === '' ? null : Number(v))} /></td>
          <td className="px-2 py-1.5"><MoneyCell value={r.cost_refund} onCommit={v => saveField(r.id, 'cost_refund', v === '' ? null : Number(v))} /></td>
          <td className="px-2 py-1.5 text-right">
            <span className={`inline-block px-2 py-1 rounded text-[12px] font-semibold border ${mistaken ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}
              title={mistaken ? '誤請求のため、お客様への立替実費ではなく自社の経費として集計します' : undefined}>{yen(effConfirmed(r))}</span>
            {mistaken && <span className="block text-[10px] text-purple-600 mt-0.5">経費</span>}
          </td>
          {/* 発送チェック依頼（請求日を入れると押せる。確認は確認簿で別の担当者が行う） */}
          <td className="px-2 py-1.5">{r.request_date
            ? <CheckRequestControl label="発送チェックを依頼" requestedAt={r.request_check_requested_at} checkedAt={r.request_check_at} checkedName={r.request_check_name}
                onRequest={() => saveMany(r.id, { request_check_requested_at: new Date().toISOString(), request_check_requested_by: meId })}
                onCancel={() => saveMany(r.id, { request_check_requested_at: null, request_check_requested_by: null })} />
            : <span className="text-[11px] text-gray-300">請求日待ち</span>}</td>
          {/* 着チェック依頼（到着日を入れると押せる） */}
          <td className="px-2 py-1.5">{r.arrival_date
            ? <CheckRequestControl label="到着チェックを依頼" requestedAt={r.receipt_check_requested_at} checkedAt={r.receipt_check_at} checkedName={r.receipt_check_name}
                onRequest={() => saveMany(r.id, { receipt_check_requested_at: new Date().toISOString(), receipt_check_requested_by: meId })}
                onCancel={() => saveMany(r.id, { receipt_check_requested_at: null, receipt_check_requested_by: null })} />
            : <span className="text-[11px] text-gray-300">到着待ち</span>}</td>
        </>
      )}
      <td className="px-2 py-1.5"><TxtCell value={r.notes} onCommit={v => saveField(r.id, 'notes', v)} placeholder="特記" /></td>
      <td className="px-2 py-1.5 text-center whitespace-nowrap">
        <button type="button" onClick={onMakeDoc} title="この行の内容で戸籍請求書を作る"
          className="text-gray-400 hover:text-brand-600 mr-1.5"><FileText className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onCopy} title="この行をコピーして再請求を作る（請求先・対象者・範囲・種別・理由を引き継ぎ、日付と費用は空）"
          className="text-gray-300 hover:text-brand-600 mr-1.5"><Copy className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onDelete} title="削除" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
      </td>
    </tr>
  )
}


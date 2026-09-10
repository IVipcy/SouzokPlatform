// 登記依頼（管理担当 → 相続登記チーム）の共通ロジック。
//
//   ・種別・状態の定数と見た目
//   ・経過営業日（依頼中のまま 1営業日で要確認・3営業日で要注意。報連相の要対応と同じ基準）
//   ・法務局ごとの「今どこか」（工程図の段）の判定。手で選ぶ欄は作らず、依頼の結果と物件の日付から決める
//   ・通知（依頼を出したらチーム全員へ、結果が付いたら依頼者へ）

import type { SupabaseClient } from '@supabase/supabase-js'
import { bizDaysOverdue } from '@/lib/overdue'
import type { ToukiRequestRow, ToukiRequestType, ToukiRequestStatus, RealEstatePropertyRow } from '@/types'

export const TOUKI_REQUEST_TYPES: ToukiRequestType[] = ['作成願い', 'チェック願い', '申請願い', '申請セットチェック願い', '謄本・製本願い']

/** 種別の一言（依頼モーダル・キューの説明） */
export const TOUKI_REQUEST_TYPE_NOTE: Record<ToukiRequestType, string> = {
  '作成願い': '申請書・委任状の作成を登記部門に頼む',
  'チェック願い': '管理担当が作った申請書・委任状のチェックを頼む',
  '申請願い': '署名・本人確認が済んだ。申請セットの作成と申請を頼む',
  '申請セットチェック願い': '申請セットの資格者チェックを頼む',
  '謄本・製本願い': '完了後謄本の請求と権利証の製本を頼む',
}

export const TOUKI_STATUS_CLS: Record<ToukiRequestStatus, string> = {
  '依頼中': 'bg-white border border-gray-300 text-gray-600',
  '対応中': 'bg-amber-50 text-amber-800',
  '完了': 'bg-emerald-50 text-emerald-700',
  '修正あり': 'bg-red-50 text-red-700',
}

/** まだ登記部門のボールにあるもの（キューに並ぶ・対応待ちに数える） */
export const isOpenToukiRequest = (r: { status: ToukiRequestStatus }) => r.status === '依頼中' || r.status === '対応中'

export const TOUKI_KAKUNIN_BIZ_DAYS = 1
export const TOUKI_CHUI_BIZ_DAYS = 3

/** 依頼日からの経過営業日（開いている依頼だけ。完了・修正ありは 0） */
export function toukiOverdueDays(r: { status: ToukiRequestStatus; requested_at: string }, todayStr: string): number {
  if (!isOpenToukiRequest(r)) return 0
  return bizDaysOverdue(r.requested_at.slice(0, 10), todayStr)
}
export function toukiSeverity(r: { status: ToukiRequestStatus; requested_at: string }, todayStr: string): 'kakunin' | 'chui' | null {
  const n = toukiOverdueDays(r, todayStr)
  if (!isOpenToukiRequest(r)) return null
  if (n >= TOUKI_CHUI_BIZ_DAYS) return 'chui'
  if (n >= TOUKI_KAKUNIN_BIZ_DAYS) return 'kakunin'
  return null
}

// ── 法務局ごとの「今どこか」 ──
// 6段：①申請書作成 ②チェック ③署名・本人確認 ④申請 ⑤完了・謄本 ⑥納品
export type ToukiStageNode = { label: string; sub: string; state: 'done' | 'now' | 'future' | 'warn' }

const latestOf = (rows: ToukiRequestRow[], type: ToukiRequestType) =>
  rows.filter(r => r.request_type === type).sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]
const md = (d: string | null | undefined) => (d ? d.slice(5, 10).replace('-', '/') : '')
const who = (r: ToukiRequestRow | undefined) => (r?.assignee?.name ? `（${r.assignee.name}）` : '')
const reqSub = (r: ToukiRequestRow | undefined, name: string) => {
  if (!r) return ''
  if (r.status === '完了') return `${name} 完了 ${md(r.responded_at)}`
  if (r.status === '修正あり') return `${name} 修正あり ${md(r.responded_at)} → 再依頼へ`
  return `${name} ${r.status}${who(r)}`
}

/**
 * 法務局ページの工程図。requests＝その法務局の依頼、props＝その法務局の物件。
 * 上の段から順に「済んだか」を見て、最初に済んでいない段が「今」。
 */
export function toukiStages(requests: ToukiRequestRow[], props: RealEstatePropertyRow[]): { stage: number; nodes: ToukiStageNode[]; parallel: string | null } {
  const make = latestOf(requests, '作成願い')
  const check = latestOf(requests, 'チェック願い')
  const apply = latestOf(requests, '申請願い')
  const setCheck = latestOf(requests, '申請セットチェック願い')
  const copy = latestOf(requests, '謄本・製本願い')
  const applied = props.filter(p => !!p.registration_apply_date)
  const completed = props.filter(p => !!p.registration_complete_date)
  const delivered = props.filter(p => !!p.registration_delivery_date)
  const n = props.length

  // 済判定
  const makeDone = make?.status === '完了' || !!check || !!apply || applied.length > 0   // 自分で作った案件は作成願いが無い＝チェック願い以降があれば済
  const checkDone = check?.status === '完了' || !!apply || !!setCheck || applied.length > 0
  const applyRequested = !!apply || !!setCheck
  const appliedDone = n > 0 && applied.length === n
  const completedDone = n > 0 && completed.length === n
  const deliveredDone = n > 0 && delivered.length === n

  const nodes: ToukiStageNode[] = [
    { label: '申請書作成', sub: make ? reqSub(make, '作成願い') : (makeDone ? '管理担当で作成' : '作成願い／管理担当で作成'), state: 'future' },
    { label: 'チェック', sub: check ? reqSub(check, 'チェック願い') : 'チェック願い', state: 'future' },
    { label: '署名・本人確認', sub: checkDone && !applyRequested ? '郵送→返送→本人確認' : (applyRequested ? '済' : '郵送→返送→本人確認'), state: 'future' },
    { label: '申請', sub: appliedDone ? `申請日 ${md(applied[0].registration_apply_date)}` : apply ? reqSub(setCheck ?? apply, setCheck ? '申請セットチェック願い' : '申請願い') : `申請願い→申請日${n > 0 && applied.length > 0 ? `（${applied.length}/${n}）` : ''}`, state: 'future' },
    { label: '完了・謄本', sub: completedDone ? `完了 ${md(completed[0].registration_complete_date)}` : copy ? reqSub(copy, '謄本・製本願い') : `完了日${n > 0 && completed.length > 0 ? `（${completed.length}/${n}）` : ''}・謄本・製本願い`, state: 'future' },
    { label: '納品', sub: deliveredDone ? `納品 ${md(delivered[0].registration_delivery_date)}` : `納品日${n > 0 && delivered.length > 0 ? `（${delivered.length}/${n}）` : ''}`, state: 'future' },
  ]
  const doneFlags = [makeDone, checkDone, checkDone && applyRequested, appliedDone, completedDone, deliveredDone]
  let stage = doneFlags.findIndex(f => !f) + 1
  if (stage === 0) stage = 7  // 全部済
  nodes.forEach((nd, i) => {
    const k = i + 1
    nd.state = k < stage ? 'done' : k === stage ? 'now' : 'future'
  })
  // 修正ありで戻っている依頼があれば、その段を赤く
  const bounced = requests.filter(r => r.status === '修正あり' && !requests.some(x => x.parent_id === r.id))
  if (bounced.length > 0) {
    const idx = bounced[0].request_type === '作成願い' ? 0 : bounced[0].request_type === 'チェック願い' ? 1 : bounced[0].request_type === '謄本・製本願い' ? 4 : 3
    nodes[idx].state = 'warn'
  }
  const parallel = bounced.length > 0 ? `修正あり ${bounced.length}件（直して再依頼）` : null
  return { stage, nodes, parallel }
}

/** 今の段で次に出す依頼（操作バーのボタン）。null＝依頼ではなく物件の日付を入れる段 */
export function toukiNextRequest(stage: number, requests: ToukiRequestRow[]): { type: ToukiRequestType; label: string; note: string } | null {
  const open = requests.filter(isOpenToukiRequest)
  if (open.length > 0) return null   // 登記部門のボール
  const bounced = requests.filter(r => r.status === '修正あり' && !requests.some(x => x.parent_id === r.id))
  if (bounced.length > 0) return { type: bounced[0].request_type, label: '直して再依頼', note: `${bounced[0].request_type}が修正ありで戻っています。直したら同じ種別で再依頼してください` }
  switch (stage) {
    case 1: return { type: '作成願い', label: '登記部門へ作成を依頼', note: '申請書・委任状を登記部門に作ってもらう。自分で作るなら次のチェック願いへ' }
    case 2: return { type: 'チェック願い', label: 'チェックを依頼', note: '相続の力に保存した申請書・委任状のチェックを頼む' }
    case 3: return { type: '申請願い', label: '申請を依頼', note: 'お客様へ郵送→返送→本人確認が済んだら、申請セットの作成と申請を頼む' }
    case 4: return null
    case 5: return { type: '謄本・製本願い', label: '謄本・製本を依頼', note: '登記が完了したら、完了後謄本の請求と権利証の製本を頼む' }
    default: return null
  }
}

// ── 通知 ──
export async function notifyToukiTeamNewRequest(supabase: SupabaseClient, r: { id: string; case_id: string; request_type: string; office: string | null; note: string | null }, requesterName: string | null) {
  const [{ data: c }, { data: team }] = await Promise.all([
    supabase.from('cases').select('case_number, deal_name').eq('id', r.case_id).maybeSingle(),
    supabase.from('members').select('id').eq('is_touki_team', true).eq('is_active', true),
  ])
  const ids = ((team ?? []) as Array<{ id: string }>).map(m => m.id)
  if (ids.length === 0) return
  const cc = c as { case_number: string | null; deal_name: string | null } | null
  const label = `${cc?.case_number ?? ''} ${cc?.deal_name ?? ''}`.trim()
  await supabase.from('notifications').insert(ids.map(member_id => ({
    member_id, type: 'touki_request', case_id: r.case_id,
    title: `登記依頼：${r.request_type}（${r.office || '法務局未設定'}）`,
    body: `${label}：${requesterName ?? '管理担当'}から${r.request_type}が届きました。${r.note ? `「${r.note}」` : ''}相続登記チームのダッシュボード「依頼」タブで対応してください。`,
  })))
}

export async function notifyToukiRequester(supabase: SupabaseClient, r: ToukiRequestRow, result: '対応中' | '完了' | '修正あり', comment: string | null, responderName: string | null) {
  if (!r.requester_id) return
  const { data: c } = await supabase.from('cases').select('case_number, deal_name').eq('id', r.case_id).maybeSingle()
  const cc = c as { case_number: string | null; deal_name: string | null } | null
  const label = `${cc?.case_number ?? ''} ${cc?.deal_name ?? ''}`.trim()
  const next = result === '完了'
    ? (r.request_type === '作成願い' ? '次はチェック願いを出してください。'
      : r.request_type === 'チェック願い' ? '次はお客様へ郵送→返送→本人確認。済んだら申請願いを出してください。'
      : r.request_type === '申請願い' || r.request_type === '申請セットチェック願い' ? '申請日を相続登記タブの物件に入れてください。完了したら謄本・製本願いを出してください。'
      : '納品したら納品日を相続登記タブの物件に入れてください。')
    : result === '修正あり' ? '直して同じ種別で再依頼してください。' : ''
  await supabase.from('notifications').insert({
    member_id: r.requester_id, type: 'touki_request_result', case_id: r.case_id,
    title: `登記依頼 ${result}：${r.request_type}（${r.office || '法務局未設定'}）`,
    body: `${label}：${responderName ?? '登記部門'}が${r.request_type}を「${result}」にしました。${comment ? `「${comment}」` : ''}${next}`,
  })
}

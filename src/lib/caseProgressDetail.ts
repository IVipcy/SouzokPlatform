// 進捗サマリーの明細。
//
// 今までのサマリーは「タスクが終わったかどうか」しか見ておらず、
// いつ請求していつ返ってきたのか、止まっているのは誰待ちなのかが読めなかった。
// そこで各実務タブのTOPを見に行かないと分からなかった情報を、ここに集めて並べる。
//
// 入力はすべて実務タブのもの（戸籍請求／不動産の取得資料・物件／金融資産）。
// このファイルは読むだけで、新しい入力は増やさない。
//
// 状態の考え方は「いま誰のボールか」。
//   遅れ   … タスクの期限を過ぎている（判定はタスクの期限だけ。到着の遅さでは遅れにしない）
//   待ち   … こちらの手は離れて相手の返事待ち（請求済・確認依頼中・調査禁止期間中）
//   対応中 … こちらが動く番
//   済／未着手

import { bizDaysOverdue } from '@/lib/overdue'
import { isSurveyBanActive } from '@/lib/financialBan'
import { stripGyomu } from '@/lib/kotei'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import { registrationTax } from '@/lib/registrationTax'
import type {
  TaskRow, KosekiRequestRow, RealEstateAcquisitionRow, RealEstatePropertyRow, FinancialAssetRow,
} from '@/types'

export type Stand = 'late' | 'wait' | 'prog' | 'done' | 'todo'

export const STAND_LABEL: Record<Stand, string> = {
  late: '遅れ', wait: '待ち', prog: '対応中', done: '済', todo: '未着手',
}

export type DetailRow = {
  id: string
  cells: (string | null)[]
  stand: Stand
  /** 状態の理由（「請求から18日」「調査禁止 8/31まで」など） */
  note?: string
}

export type DetailSection = {
  key: string
  title: string
  columns: string[]
  rows: DetailRow[]
  /** この業務の期限超過タスク */
  overdue: OverdueTask[]
}

export type OverdueTask = { id: string; title: string; days: number }
export type WaitItem = { section: string; label: string; note: string }
export type DoingItem = { section: string; label: string }

export type ProgressDetail = {
  sections: DetailSection[]
  late: OverdueTask[]
  waiting: WaitItem[]
  doing: DoingItem[]
  todoCount: number
}

const md = (d: string | null | undefined) => (d ? d.slice(5).replace('-', '/') : null)
const yen = (n: number | null | undefined) => (n == null ? null : `¥${Math.round(n).toLocaleString('ja-JP')}`)
/** 暦日の経過（請求から何日たったか。遅れ判定には使わず、表示だけ） */
const daysFrom = (from: string, today: string) =>
  Math.max(0, Math.round((new Date(today + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000))

export function buildProgressDetail(input: {
  tasks: TaskRow[]
  kosekiRequests: KosekiRequestRow[]
  acquisitions: RealEstateAcquisitionRow[]
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  today: string
}): ProgressDetail {
  const { tasks, kosekiRequests, acquisitions, properties, financialAssets, today } = input

  // 期限超過タスク（未完了のみ）。業務ごとに配る。
  const open = tasks.filter(t => normalizeTaskStatus(t.status) !== '完了')
  const overdueAll: Array<OverdueTask & { gyomu: string }> = open
    .filter(t => t.due_date && t.due_date < today)
    .map(t => ({ id: t.id, title: t.title, days: bizDaysOverdue(t.due_date!, today), gyomu: stripGyomu(t.phase) }))
    .sort((a, b) => b.days - a.days)
  const overdueOf = (gyomus: string[]) => overdueAll.filter(o => gyomus.includes(o.gyomu)).map(({ id, title, days }) => ({ id, title, days }))

  const sections: DetailSection[] = []
  const waiting: WaitItem[] = []
  const push = (s: DetailSection) => { if (s.rows.length > 0) sections.push(s) }
  const wait = (section: string, label: string, note: string) => waiting.push({ section, label, note })

  // ── 戸籍（誰の分をいつ請求して、いつ返ってきたか） ──
  const kosekiRows: DetailRow[] = [...kosekiRequests]
    .sort((a, b) => (a.request_date ?? '9999').localeCompare(b.request_date ?? '9999'))
    .map(k => {
      const person = (k.target_person ?? '').trim() || '対象者未設定'
      const own = (k.acquirer ?? '自社') !== '依頼者'
      let stand: Stand = 'todo'
      let note: string | undefined
      if (k.arrival_date) stand = 'done'
      else if (k.request_date) {
        stand = 'wait'
        note = `請求から${daysFrom(k.request_date, today)}日`
        wait('戸籍', `${person}（${k.request_to ?? '請求先未設定'}）`, note)
      } else if (!own) {
        stand = 'wait'
        note = '依頼者が取得'
        wait('戸籍', person, note)
      }
      return {
        id: k.id,
        cells: [person, k.request_to, md(k.request_date), md(k.arrival_date), k.read_result],
        stand, note,
      }
    })
  push({ key: 'koseki', title: '戸籍', columns: ['対象者', '請求先', '請求日', '到着日', '読込結果'], rows: kosekiRows, overdue: overdueOf(['戸籍']) })

  // ── 不動産：資料の請求（市区町村役場・法務局） ──
  const propAddr = (id: string | null) => properties.find(p => p.id === id)?.address ?? null
  const acqRows: DetailRow[] = [...acquisitions]
    .sort((a, b) => (a.request_date ?? '9999').localeCompare(b.request_date ?? '9999'))
    .map(a => {
      const target = a.scope === 'property' ? (propAddr(a.target_property_id) ?? '物件') : (a.target_municipality || '市区町村未設定')
      const items = (a.item_types && a.item_types.length > 0 ? a.item_types : [a.item_type]).filter(Boolean).join('・')
      let stand: Stand = 'todo'
      let note: string | undefined
      if (a.arrival_date || a.received) stand = 'done'
      else if (a.request_date) {
        stand = 'wait'
        note = `請求から${daysFrom(a.request_date, today)}日`
        wait('不動産', `${items}（${target}）`, note)
      }
      return { id: a.id, cells: [target, items || null, a.request_to, md(a.request_date), md(a.arrival_date)], stand, note }
    })
  push({ key: 'realestate', title: '不動産（資料の請求）', columns: ['対象', '資料', '請求先', '請求日', '到着日'], rows: acqRows, overdue: overdueOf(['不動産']) })

  // ── 不動産：物件の評価額 ──
  const propRows: DetailRow[] = properties.map(p => {
    let stand: Stand = 'todo'
    let note: string | undefined
    if (p.confirmed_at) stand = 'done'
    else if (p.appraisal_value != null && p.confirm_requested_at) {
      stand = 'wait'; note = '管理担当の確定待ち'
      wait('不動産', `${p.address ?? '物件'} の評価額`, note)
    } else if (p.appraisal_value != null) stand = 'prog'
    return {
      id: p.id,
      cells: [p.property_type, p.address, yen(p.appraisal_value), yen(Math.round(registrationTax(p)))],
      stand, note,
    }
  })
  push({ key: 'properties', title: '不動産（物件の評価額）', columns: ['種別', '所在', '評価額', '登録免許税（概算）'], rows: propRows, overdue: [] })

  // ── 金融資産：銀行ごとに、止まっている理由まで ──
  const finRows: DetailRow[] = financialAssets.map(f => {
    const inst = (f.institution_name ?? '').trim() || '金融機関未設定'
    const banned = isSurveyBanActive(f, today)
    const banNote = f.survey_prohibited_method === '期間指定'
      ? (f.survey_prohibited_end ? `${md(f.survey_prohibited_end)}まで` : '期間指定')
      : 'お客様の連絡待ち'
    let stand: Stand = 'todo'
    let note: string | undefined
    if (f.balance_confirmed) stand = 'done'
    else if (banned) {
      stand = 'wait'; note = `調査禁止 ${banNote}`
      wait('金融資産', inst, note)
    } else if (f.freeze_confirm_requested_at && !f.freeze_confirmed) {
      stand = 'wait'; note = '管理担当の凍結確認待ち'
      wait('金融資産', inst, note)
    } else if (f.request_date && !f.arrival_date) {
      stand = 'wait'; note = `請求から${daysFrom(f.request_date, today)}日`
      wait('金融資産', inst, note)
    } else if (f.balance_confirm_requested_at) {
      stand = 'wait'; note = '管理担当の残高確定待ち'
      wait('金融資産', inst, note)
    } else if (f.arrival_date || f.survey_result || f.freeze_confirmed) stand = 'prog'
    return {
      id: f.id,
      cells: [
        inst,
        f.account_type,
        banned ? banNote : null,
        f.freeze_confirmed ? '確認済' : f.freeze_confirm_requested_at ? '依頼中' : null,
        md(f.request_date),
        md(f.arrival_date),
        f.balance_amount != null ? `${yen(f.balance_amount)}${f.balance_confirmed ? '（確定）' : ''}` : null,
      ],
      stand, note,
    }
  })
  push({ key: 'finance', title: '金融資産', columns: ['金融機関', '種別', '調査禁止', '凍結確認', '資料請求', '到着', '残高'], rows: finRows, overdue: overdueOf(['金融資産']) })

  // ── 解約手続（解約に着手した口座があるときだけ出す） ──
  const cancelTargets = financialAssets.filter(f => f.cancellation_request_date || f.cancellation_done || f.cancellation_result)
  const cancelRows: DetailRow[] = cancelTargets.map(f => {
    let stand: Stand = 'todo'
    let note: string | undefined
    if (f.cancellation_done) stand = 'done'
    else if (f.cancellation_request_date) {
      stand = 'wait'; note = `依頼から${daysFrom(f.cancellation_request_date, today)}日`
      wait('解約手続', (f.institution_name ?? '').trim() || '金融機関', note)
    }
    return { id: f.id, cells: [f.institution_name, md(f.cancellation_request_date), f.cancellation_done ? '完了' : null, f.cancellation_result], stand, note }
  })
  push({ key: 'cancel', title: '解約手続', columns: ['金融機関', '解約依頼', '完了', '結果'], rows: cancelRows, overdue: overdueOf(['解約']) })

  // ── 相続登記（申請に着手した物件があるときだけ出す） ──
  const regTargets = properties.filter(p => p.registration_apply_date || p.registration_complete_date || (p.registration_types ?? []).length > 0)
  const regRows: DetailRow[] = regTargets.map(p => {
    let stand: Stand = 'todo'
    let note: string | undefined
    if (p.registration_complete_date) stand = 'done'
    else if (p.registration_apply_date) {
      stand = 'wait'; note = `申請から${daysFrom(p.registration_apply_date, today)}日`
      wait('相続登記', p.address ?? '物件', note)
    } else stand = 'prog'
    return {
      id: p.id,
      cells: [p.address, (p.registration_types ?? []).join('・') || null, md(p.registration_apply_date), md(p.registration_complete_date), yen(p.registration_cost ?? Math.round(registrationTax(p)))],
      stand, note,
    }
  })
  push({ key: 'registration', title: '相続登記', columns: ['所在', '登記の種別', '申請日', '完了日', '登録免許税'], rows: regRows, overdue: overdueOf(['登記']) })

  // ── 上部サマリー ──
  const doing: DoingItem[] = open
    .filter(t => normalizeTaskStatus(t.status) === '対応中')
    .map(t => ({ section: stripGyomu(t.phase) || 'その他', label: t.title }))
  const todoCount = open.filter(t => normalizeTaskStatus(t.status) === '着手前').length

  return { sections, late: overdueAll.map(({ id, title, days }) => ({ id, title, days })), waiting, doing, todoCount }
}

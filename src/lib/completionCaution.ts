import { createClient } from '@/lib/supabase/client'
import type { TaskRow } from '@/types'

// 完了前の「軽い注意」。タスクの種類から、確認依頼のし忘れ／前提の確認漏れを検知して促す。
// 完了は止めない（該当が“未”のときだけ出す・止める制御はしない）。
export type CompletionCaution = {
  title: string          // 問いかけ（例：発送チェックの依頼は出しましたか？）
  note: string           // 補足
  requestLabel: string   // 「今すぐ依頼」ボタンの文言（空なら依頼ボタンを出さない＝前提確認のみ）
  request: () => Promise<void>  // その場で依頼を出す
}

const nowIso = () => new Date().toISOString()

function parseRid(rid: string | null): { prefix: string; key: string } | null {
  if (!rid) return null
  const i = rid.indexOf(':')
  return i < 0 ? null : { prefix: rid.slice(0, i), key: rid.slice(i + 1) }
}

type KosekiLite = { id: string; request_date: string | null; arrival_date: string | null; request_check_requested_at: string | null; request_check_at: string | null; receipt_check_requested_at: string | null; receipt_check_at: string | null }
type AcqLite = { id: string; scope: string | null; request_date: string | null; arrival_date: string | null; request_check_requested_at: string | null; request_check_at: string | null; receipt_check_requested_at: string | null; receipt_check_at: string | null }
type FinLite = { id: string; cancellation_required: string | null; freeze_confirmed: boolean; freeze_confirm_requested_at: string | null; balance_amount: number | null; balance_confirmed: boolean; balance_confirm_requested_at: string | null }
type PropLite = { id: string; appraisal_value: number | null; confirmed: boolean; confirm_requested_at: string | null }

export async function getCompletionCaution(task: TaskRow, meId: string | null): Promise<CompletionCaution | null> {
  const supabase = createClient()
  const rid = parseRid(task.source_rid)
  const gyomu = task.phase ?? task.category ?? ''

  // ── 戸籍請求：発送チェックの依頼 ──
  if (rid?.prefix === 'koseki') {
    const { data } = await supabase.from('koseki_requests').select('id,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('id', rid.key).maybeSingle()
    const r = data as KosekiLite | null
    if (r && r.request_date && !r.request_check_requested_at && !r.request_check_at) {
      return { title: '発送チェックの依頼は出しましたか？', note: 'この戸籍請求は、まだ発送チェックの確認依頼が出ていません。', requestLabel: '発送を依頼',
        request: async () => { await supabase.from('koseki_requests').update({ request_check_requested_at: nowIso(), request_check_requested_by: meId }).eq('id', rid.key) } }
    }
    return null
  }
  // ── 戸籍読込：到着確認の依頼 ──
  if (rid?.prefix === 'koseki-read') {
    const { data } = await supabase.from('koseki_requests').select('id,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('id', rid.key).maybeSingle()
    const r = data as KosekiLite | null
    if (r && r.arrival_date && !r.receipt_check_requested_at && !r.receipt_check_at) {
      return { title: '到着確認（着チェック）の依頼は出しましたか？', note: 'この戸籍は、まだ到着確認の依頼が出ていません。', requestLabel: '到着を依頼',
        request: async () => { await supabase.from('koseki_requests').update({ receipt_check_requested_at: nowIso(), receipt_check_requested_by: meId }).eq('id', rid.key) } }
    }
    return null
  }
  // ── 不動産 請求（市区町村単位）：発送チェックの依頼 ──
  if (rid && (rid.prefix === 're-muni' || rid.prefix === 're-houmu')) {
    const scope = rid.prefix === 're-houmu' ? 'property' : 'municipality'
    const { data } = await supabase.from('real_estate_acquisitions').select('id,scope,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('case_id', task.case_id).eq('target_municipality', rid.key)
    const targets = ((data ?? []) as AcqLite[]).filter(r => (r.scope ?? scope) === scope && r.request_date && !r.request_check_requested_at && !r.request_check_at)
    if (targets.length > 0) {
      return { title: '発送チェックの依頼は出しましたか？', note: `${rid.key}の取得資料で、まだ発送チェックの依頼が出ていないものが ${targets.length}件 あります。`, requestLabel: `${targets.length}件を依頼`,
        request: async () => { await supabase.from('real_estate_acquisitions').update({ request_check_requested_at: nowIso(), request_check_requested_by: meId }).in('id', targets.map(t => t.id)) } }
    }
    return null
  }
  // ── 不動産 読込：到着確認の依頼 ──
  if (rid && (rid.prefix === 're-muni-read' || rid.prefix === 're-houmu-read')) {
    const { data } = await supabase.from('real_estate_acquisitions').select('id,scope,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('case_id', task.case_id).eq('target_municipality', rid.key)
    const targets = ((data ?? []) as AcqLite[]).filter(r => r.arrival_date && !r.receipt_check_requested_at && !r.receipt_check_at)
    if (targets.length > 0) {
      return { title: '到着確認の依頼は出しましたか？', note: `${rid.key}の取得資料で、まだ到着確認の依頼が出ていないものが ${targets.length}件 あります。`, requestLabel: `${targets.length}件を依頼`,
        request: async () => { await supabase.from('real_estate_acquisitions').update({ receipt_check_requested_at: nowIso(), receipt_check_requested_by: meId }).in('id', targets.map(t => t.id)) } }
    }
    return null
  }

  // ── 解約：口座は凍結確認済みか（前提の確認）──
  if (gyomu === '解約') {
    const { data } = await supabase.from('financial_assets').select('id,cancellation_required,freeze_confirmed,freeze_confirm_requested_at,balance_amount,balance_confirmed,balance_confirm_requested_at').eq('case_id', task.case_id)
    const targets = ((data ?? []) as FinLite[]).filter(r => r.cancellation_required === '有' && !r.freeze_confirmed)
    if (targets.length > 0) {
      const need = targets.filter(r => !r.freeze_confirm_requested_at)
      return { title: 'その口座は凍結確認済みですか？', note: `解約対象で、まだ凍結確認できていない口座が ${targets.length}件 あります。`, requestLabel: need.length > 0 ? `${need.length}件の凍結確認を依頼` : '',
        request: async () => { if (need.length > 0) await supabase.from('financial_assets').update({ freeze_confirm_requested_at: nowIso(), freeze_confirm_requested_by: meId }).in('id', need.map(t => t.id)) } }
    }
    return null
  }
  // ── 金融資産：残高確定の依頼 ──
  if (gyomu === '金融資産') {
    const { data } = await supabase.from('financial_assets').select('id,cancellation_required,freeze_confirmed,freeze_confirm_requested_at,balance_amount,balance_confirmed,balance_confirm_requested_at').eq('case_id', task.case_id)
    const targets = ((data ?? []) as FinLite[]).filter(r => r.balance_amount != null && !r.balance_confirmed && !r.balance_confirm_requested_at)
    if (targets.length > 0) {
      return { title: '残高確定の依頼は出しましたか？', note: `残高が入っているのに、まだ残高確定の依頼が出ていない口座が ${targets.length}件 あります。`, requestLabel: `${targets.length}件を依頼`,
        request: async () => { await supabase.from('financial_assets').update({ balance_confirm_requested_at: nowIso(), balance_confirm_requested_by: meId }).in('id', targets.map(t => t.id)) } }
    }
    return null
  }
  // ── 不動産（評価証明の取得系）：評価額確定の依頼 ──
  if (gyomu === '不動産' && /評価/.test(task.title ?? '')) {
    const { data } = await supabase.from('real_estate_properties').select('id,appraisal_value,confirmed,confirm_requested_at').eq('case_id', task.case_id)
    const targets = ((data ?? []) as PropLite[]).filter(r => r.appraisal_value != null && !r.confirmed && !r.confirm_requested_at)
    if (targets.length > 0) {
      return { title: '評価額確定の依頼は出しましたか？', note: `評価額が入っているのに、まだ評価額確定の依頼が出ていない物件が ${targets.length}件 あります。`, requestLabel: `${targets.length}件を依頼`,
        request: async () => { await supabase.from('real_estate_properties').update({ confirm_requested_at: nowIso(), confirm_requested_by: meId }).in('id', targets.map(t => t.id)) } }
    }
    return null
  }

  return null
}

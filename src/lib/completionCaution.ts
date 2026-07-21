import { createClient } from '@/lib/supabase/client'
import { resolveTaskLanding, taskLandingUrl } from '@/lib/taskLanding'
import type { TaskRow } from '@/types'

// 完了前の「軽い注意」。タスクの種類から、確認依頼のし忘れ／前提の確認漏れを検知して促す。
// 完了は止めない（該当が“未”のときだけ出す・止める制御はしない）。
export type CompletionCaution = {
  title: string          // 問いかけ（例：発送チェックの依頼は出しましたか？）
  note: string           // 補足
  requestLabel: string   // 「今すぐ依頼」ボタンの文言（空なら依頼ボタンを出さない＝前提確認のみ）
  request: () => Promise<void>  // その場で依頼を出す
  landingUrl?: string    // 実務タブの該当行への遷移先（あれば「実務タブで確認」リンクを表示）
  landingLabel?: string  // リンクのラベル（例：戸籍請求タブ）
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
  // 実務タブへの導線（あればモーダルに「実務タブで確認」リンクを出す）。
  const landing = resolveTaskLanding(task)
  const landingUrl = landing ? taskLandingUrl(task.case_id, task.id, landing) : undefined
  const landingLabel = landing?.label

  // ── 戸籍請求：進捗に応じて段階的に警告 ──
  //   ①請求日なし → 「まだ請求していない」
  //   ②請求日あり／依頼なし → 「発送チェック依頼まだ」
  //   ③依頼済／未確認 → 「発送チェック確認まだ」
  //   ④確認済 → 警告なし
  if (rid?.prefix === 'koseki') {
    const { data } = await supabase.from('koseki_requests').select('id,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('id', rid.key).maybeSingle()
    const r = data as KosekiLite | null
    if (!r || r.request_check_at) return null
    if (!r.request_date) {
      return { title: 'まだ請求していないようです', note: '実務タブに請求日が入っていません。実務タブで内容を確認してから完了するのがおすすめです。', requestLabel: '', request: async () => {}, landingUrl, landingLabel }
    }
    if (!r.request_check_requested_at) {
      return { title: '発送チェックの依頼は出しましたか？', note: 'この戸籍請求は、まだ発送チェックの確認依頼が出ていません。', requestLabel: '発送チェックを依頼',
        request: async () => { await supabase.from('koseki_requests').update({ request_check_requested_at: nowIso(), request_check_requested_by: meId }).eq('id', rid.key) }, landingUrl, landingLabel }
    }
    return { title: '発送チェックがまだ確認されていません', note: '依頼は出ていますが、確認簿でまだ確認されていません。', requestLabel: '', request: async () => {}, landingUrl, landingLabel }
  }
  // ── 戸籍読込：進捗に応じて段階的に警告（到着 → 到着チェック依頼 → 確認済） ──
  if (rid?.prefix === 'koseki-read') {
    const { data } = await supabase.from('koseki_requests').select('id,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('id', rid.key).maybeSingle()
    const r = data as KosekiLite | null
    if (!r || r.receipt_check_at) return null
    if (!r.arrival_date) {
      return { title: 'まだ届いていないようです', note: '実務タブに到着日が入っていません。実務タブで内容を確認してから完了するのがおすすめです。', requestLabel: '', request: async () => {}, landingUrl, landingLabel }
    }
    if (!r.receipt_check_requested_at) {
      return { title: '到着チェックの依頼は出しましたか？', note: 'この戸籍は、まだ到着確認の依頼が出ていません。', requestLabel: '到着チェックを依頼',
        request: async () => { await supabase.from('koseki_requests').update({ receipt_check_requested_at: nowIso(), receipt_check_requested_by: meId }).eq('id', rid.key) }, landingUrl, landingLabel }
    }
    return { title: '到着チェックがまだ確認されていません', note: '依頼は出ていますが、確認簿でまだ確認されていません。', requestLabel: '', request: async () => {}, landingUrl, landingLabel }
  }
  // ── 不動産 請求（市区町村単位）：進捗に応じて段階的に警告 ──
  if (rid && (rid.prefix === 're-muni' || rid.prefix === 're-houmu')) {
    const scope = rid.prefix === 're-houmu' ? 'property' : 'municipality'
    const { data } = await supabase.from('real_estate_acquisitions').select('id,scope,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('case_id', task.case_id).eq('target_municipality', rid.key)
    const rows = ((data ?? []) as AcqLite[]).filter(r => (r.scope ?? scope) === scope)
    const remain = rows.filter(r => !r.request_check_at)  // 発送チェック確認がまだの行
    if (remain.length === 0) return null
    const noDate = remain.filter(r => !r.request_date)
    if (noDate.length > 0) {
      return { title: 'まだ請求していない資料があります', note: `${rid.key}の取得資料で、請求日が未入力のものが ${noDate.length}件 あります。実務タブで内容を確認してから完了するのがおすすめです。`, requestLabel: '', request: async () => {}, landingUrl, landingLabel }
    }
    const noReq = remain.filter(r => !r.request_check_requested_at)
    if (noReq.length > 0) {
      return { title: '発送チェックの依頼は出しましたか？', note: `${rid.key}の取得資料で、発送チェックの依頼が出ていないものが ${noReq.length}件 あります。`, requestLabel: `${noReq.length}件を依頼`,
        request: async () => { await supabase.from('real_estate_acquisitions').update({ request_check_requested_at: nowIso(), request_check_requested_by: meId }).in('id', noReq.map(t => t.id)) }, landingUrl, landingLabel }
    }
    return { title: '発送チェックがまだ確認されていません', note: `依頼は出ていますが、まだ確認されていない資料が ${remain.length}件 あります。`, requestLabel: '', request: async () => {}, landingUrl, landingLabel }
  }
  // ── 不動産 読込：進捗に応じて段階的に警告 ──
  if (rid && (rid.prefix === 're-muni-read' || rid.prefix === 're-houmu-read')) {
    const scope = rid.prefix === 're-houmu-read' ? 'property' : 'municipality'
    const { data } = await supabase.from('real_estate_acquisitions').select('id,scope,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('case_id', task.case_id).eq('target_municipality', rid.key)
    // 同じ市区町村でも ①市区町村役場行(名寄帳/評価証明) と ②法務局行(登記/公図/…) は別タスクなので scope で絞る。
    const rows = ((data ?? []) as AcqLite[]).filter(r => (r.scope ?? scope) === scope)
    const remain = rows.filter(r => !r.receipt_check_at)
    if (remain.length > 0) {
      const noArr = remain.filter(r => !r.arrival_date)
      if (noArr.length > 0) {
        return { title: 'まだ届いていない資料があります', note: `${rid.key}の取得資料で、到着日が未入力のものが ${noArr.length}件 あります。実務タブで内容を確認してから完了するのがおすすめです。`, requestLabel: '', request: async () => {}, landingUrl, landingLabel }
      }
      const noReq = remain.filter(r => !r.receipt_check_requested_at)
      if (noReq.length > 0) {
        return { title: '到着チェックの依頼は出しましたか？', note: `${rid.key}の取得資料で、到着チェックの依頼が出ていないものが ${noReq.length}件 あります。`, requestLabel: `${noReq.length}件を依頼`,
          request: async () => { await supabase.from('real_estate_acquisitions').update({ receipt_check_requested_at: nowIso(), receipt_check_requested_by: meId }).in('id', noReq.map(t => t.id)) }, landingUrl, landingLabel }
      }
      return { title: '到着チェックがまだ確認されていません', note: `依頼は出ていますが、まだ確認されていない資料が ${remain.length}件 あります。`, requestLabel: '', request: async () => {}, landingUrl, landingLabel }
    }
    // 受領チェックが全部OKでも、re-muni-read（名寄帳・評価証明の読込）はそのまま評価額転記まで守備範囲。
    // → この市区町村の物件で「評価額入力済み・未確定・未依頼」があれば評価確定依頼を促す。
    if (rid.prefix === 're-muni-read') {
      const { data: pdata } = await supabase.from('real_estate_properties').select('id,municipality,address,appraisal_value,confirmed,confirm_requested_at').eq('case_id', task.case_id)
      const propsInMuni = ((pdata ?? []) as (PropLite & { municipality: string | null; address: string | null })[])
        .filter(p => (p.municipality ?? '').trim() === rid.key || ((p.address ?? '').trim().startsWith(rid.key)))
      const needReq = propsInMuni.filter(p => p.appraisal_value != null && !p.confirmed && !p.confirm_requested_at)
      if (needReq.length > 0) {
        return { title: '評価額確定の依頼は出しましたか？', note: `${rid.key}の物件で、評価額が入っているのに確定依頼が出ていないものが ${needReq.length}件 あります。`, requestLabel: `${needReq.length}件を依頼`,
          request: async () => { await supabase.from('real_estate_properties').update({ confirm_requested_at: nowIso(), confirm_requested_by: meId }).in('id', needReq.map(p => p.id)) }, landingUrl, landingLabel }
      }
      const pending = propsInMuni.filter(p => p.appraisal_value != null && !p.confirmed && p.confirm_requested_at)
      if (pending.length > 0) {
        return { title: '評価額の確定がまだされていません', note: `依頼は出ていますが、まだ確認されていない物件が ${pending.length}件 あります。`, requestLabel: '', request: async () => {}, landingUrl, landingLabel }
      }
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
        request: async () => { if (need.length > 0) await supabase.from('financial_assets').update({ freeze_confirm_requested_at: nowIso(), freeze_confirm_requested_by: meId }).in('id', need.map(t => t.id)) }, landingUrl, landingLabel }
    }
    return null
  }
  // ── 金融資産：残高確定の依頼 ──
  if (gyomu === '金融資産') {
    const { data } = await supabase.from('financial_assets').select('id,cancellation_required,freeze_confirmed,freeze_confirm_requested_at,balance_amount,balance_confirmed,balance_confirm_requested_at').eq('case_id', task.case_id)
    const targets = ((data ?? []) as FinLite[]).filter(r => r.balance_amount != null && !r.balance_confirmed && !r.balance_confirm_requested_at)
    if (targets.length > 0) {
      return { title: '残高確定の依頼は出しましたか？', note: `残高が入っているのに、まだ残高確定の依頼が出ていない口座が ${targets.length}件 あります。`, requestLabel: `${targets.length}件を依頼`,
        request: async () => { await supabase.from('financial_assets').update({ balance_confirm_requested_at: nowIso(), balance_confirm_requested_by: meId }).in('id', targets.map(t => t.id)) }, landingUrl, landingLabel }
    }
    return null
  }
  // ── 不動産（評価証明の取得系）：評価額確定の依頼 ──
  if (gyomu === '不動産' && /評価/.test(task.title ?? '')) {
    const { data } = await supabase.from('real_estate_properties').select('id,appraisal_value,confirmed,confirm_requested_at').eq('case_id', task.case_id)
    const targets = ((data ?? []) as PropLite[]).filter(r => r.appraisal_value != null && !r.confirmed && !r.confirm_requested_at)
    if (targets.length > 0) {
      return { title: '評価額確定の依頼は出しましたか？', note: `評価額が入っているのに、まだ評価額確定の依頼が出ていない物件が ${targets.length}件 あります。`, requestLabel: `${targets.length}件を依頼`,
        request: async () => { await supabase.from('real_estate_properties').update({ confirm_requested_at: nowIso(), confirm_requested_by: meId }).in('id', targets.map(t => t.id)) }, landingUrl, landingLabel }
    }
    return null
  }

  return null
}

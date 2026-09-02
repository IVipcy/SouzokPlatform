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

type KosekiLite = { id: string; acquirer: string | null; request_date: string | null; arrival_date: string | null; request_check_requested_at: string | null; request_check_at: string | null; receipt_check_requested_at: string | null; receipt_check_at: string | null }
type AcqLite = { id: string; scope: string | null; request_date: string | null; arrival_date: string | null; request_check_requested_at: string | null; request_check_at: string | null; receipt_check_requested_at: string | null; receipt_check_at: string | null }
type FinLite = { id: string; institution_id: string | null; cancellation_required: string | null; balance_amount: number | null; balance_confirmed: boolean; balance_confirm_requested_at: string | null }
type InstLite = { id: string; name: string; freeze_confirmed: boolean; freeze_confirm_requested_at: string | null; survey_prohibited_end: string | null }
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
    const { data } = await supabase.from('koseki_requests').select('id,acquirer,request_date,arrival_date,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').eq('id', rid.key).maybeSingle()
    const r = data as KosekiLite | null
    if (!r || r.receipt_check_at) return null
    if (!r.arrival_date) {
      return { title: 'まだ届いていないようです', note: '実務タブに到着日が入っていません。実務タブで内容を確認してから完了するのがおすすめです。', requestLabel: '', request: async () => {}, landingUrl, landingLabel }
    }
    // 依頼者取得＝依頼者が自分で取得して渡す戸籍。役所への請求も無く、到着チェック(W-Check)は不要。
    // 到着日が入っていれば完了扱い（KosekiSection の状態判定と揃える）。
    if (r.acquirer === '依頼者') return null
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

  // ── 解約：その口座の調査先は凍結確認済みか（前提の確認）──
  //   凍結確認は口座ではなく調査先（financial_institutions）が持つ（migration 271）。
  if (gyomu === '解約') {
    const [{ data: acc }, { data: inst }] = await Promise.all([
      supabase.from('financial_assets').select('id,institution_id,cancellation_required,balance_amount,balance_confirmed,balance_confirm_requested_at').eq('case_id', task.case_id),
      supabase.from('financial_institutions').select('id,name,freeze_confirmed,freeze_confirm_requested_at,survey_prohibited_end').eq('case_id', task.case_id),
    ])
    const insts = (inst ?? []) as InstLite[]
    const instIds = new Set(((acc ?? []) as FinLite[]).filter(r => r.cancellation_required === '有' && r.institution_id).map(r => r.institution_id as string))
    const targets = insts.filter(i => instIds.has(i.id) && !i.freeze_confirmed)
    if (targets.length > 0) {
      const need = targets.filter(i => !i.freeze_confirm_requested_at)
      return { title: 'その金融機関は凍結確認済みですか？', note: `解約対象で、まだ凍結確認できていない金融機関が ${targets.length}件 あります。`, requestLabel: need.length > 0 ? `${need.length}件の凍結確認を依頼` : '',
        request: async () => { if (need.length > 0) await supabase.from('financial_institutions').update({ freeze_confirm_requested_at: nowIso(), freeze_confirm_requested_by: meId }).in('id', need.map(t => t.id)) }, landingUrl, landingLabel }
    }
    return null
  }
  // ── 金融資産・読込（fin-read）：残高確定と凍結確認をセットで検知して1プロンプトに集約 ──
  // 事務が銀行別の資料読込を終えたタイミングで、その銀行の口座について「残高確定依頼まだ」「凍結確認依頼まだ」の両方を検知。
  // 両方とも管理担当へのW-Check依頼＝送り先が同じなので、まとめて依頼できるようにする。
  if (rid?.prefix === 'fin-read') {
    const [{ data: inst }, { data: acc }] = await Promise.all([
      supabase.from('financial_institutions').select('id,name,freeze_confirmed,freeze_confirm_requested_at,survey_prohibited_end').eq('case_id', task.case_id).eq('name', rid.key),
      supabase.from('financial_assets').select('id,institution_id,cancellation_required,balance_amount,balance_confirmed,balance_confirm_requested_at').eq('case_id', task.case_id).eq('institution_name', rid.key),
    ])
    const todayYmd = new Date().toISOString().slice(0, 10)
    // 禁止期間中の調査先は「まだ凍結しない・調査しない」ため、依頼漏れ検知から除外する。
    const instRows = ((inst ?? []) as InstLite[]).filter(i => !(i.survey_prohibited_end && i.survey_prohibited_end > todayYmd))
    const okInstIds = new Set(instRows.map(i => i.id))
    const rows = ((acc ?? []) as FinLite[]).filter(r => !r.institution_id || okInstIds.has(r.institution_id))
    const needBalance = rows.filter(r => r.balance_amount != null && !r.balance_confirmed && !r.balance_confirm_requested_at)
    const needFreeze = instRows.filter(i => !i.freeze_confirmed && !i.freeze_confirm_requested_at)
    const total = needBalance.length + needFreeze.length
    if (total > 0) {
      const parts: string[] = []
      if (needBalance.length > 0) parts.push(`残高確定 ${needBalance.length}件`)
      if (needFreeze.length > 0) parts.push(`凍結確認 ${needFreeze.length}件`)
      return { title: 'W-Check依頼が漏れています', note: `${rid.key}で、管理担当へのW-Check依頼がまだ出ていないものがあります：${parts.join('・')}`, requestLabel: `まとめて${total}件を依頼`,
        request: async () => {
          if (needBalance.length > 0) await supabase.from('financial_assets').update({ balance_confirm_requested_at: nowIso(), balance_confirm_requested_by: meId }).in('id', needBalance.map(r => r.id))
          if (needFreeze.length > 0) await supabase.from('financial_institutions').update({ freeze_confirm_requested_at: nowIso(), freeze_confirm_requested_by: meId }).in('id', needFreeze.map(r => r.id))
        }, landingUrl, landingLabel }
    }
    return null
  }
  // 金融資産の「残高確定／凍結確認」W-Checkは 資料読込(fin-read) の完了時にのみ促す（上のブロック）。
  // 資料請求(fin:)や全店調査など受領前のタスクでは、まだ残高が届いていないので確認プロンプトは出さない。
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

  // ── 権利書の製本（相続登記チームタスク）：完了時に 納品タブ での納品を案内 ──
  //    納品は案件全体の最終ステップ（納品タブが担当）。相続登記固有の「納品対応」タスクは廃止済み。
  if (task.title === '権利書の製本' && task.task_kind === 'touki_team') {
    return {
      title: '次は 納品対応 です（案件の最終ステップ）',
      note: '事務管理担当が 案件詳細の「納品タブ」から、権利書・戸籍等の原本をまとめて納品します（原本受領証・封筒もそこから作成できます）。',
      requestLabel: '',
      request: async () => {},
      landingUrl: `/cases/${task.case_id}?tab=delivery`,
      landingLabel: '納品タブを開く',
    }
  }

  return null
}

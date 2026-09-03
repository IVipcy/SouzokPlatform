import { createClient } from '@/lib/supabase/client'
import { evaluateInstitution, sealCertificateStatus, pendingRid } from '@/lib/financialWorkflow'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import type { FinancialInstitutionRow, FinancialRequestRow, FinancialRequestItemRow, SecuritiesHoldingRow } from '@/types'

// 「戸籍が揃ったから、次はこれができる」を出すための判定。
//
// 前は完了モーダルに「案件にある着手前タスク」を全部並べていたが、
// タスクを先にまとめて作る運用をやめたので、そこはほぼ空になった。
// 代わりに出すのは、戸籍の完了に依存していて、いま実際に始められるものだけ。
//
// 依存の中身（戸籍請求タブの読込結果に入れた「被相続人との関係戸籍 取得完了」が起点）：
//   名寄せ請求   … 被相続人の最後の住所が分かっている＋その人の関係戸籍が揃った
//                  （または依頼者の関係戸籍が揃った）
//   金融         … 被相続人 または 依頼者の関係戸籍が揃った案件の、各調査先の「次の対応」
//                  （銀行ページ右上に出ているものと同じ判定。ここで別の条件は書かない）
//
// 金融の候補と右上の「次の対応」がずれると「右上は凍結連絡なのに候補は資料請求」のような
// 矛盾になる。判定は financialWorkflow.evaluateInstitution の1か所に置く。

export type NextCandidate = {
  /** 重複を防ぐキー。そのままタスクの source_rid になる */
  rid: string
  /** 既定のタスク名。完了モーダルでその場で直せる */
  title: string
  /** 業務（タスクの phase／category） */
  gyomu: string
  /** なぜ今できるのか。着手OKの理由としてそのまま残す */
  why: string
}

/** 住所から「都道府県＋市区町村」を切り出す。不動産タブの市区町村タブと同じ切り方。 */
export function municipalityOfAddress(address: string | null | undefined): string {
  const a = (address ?? '').trim()
  if (!a) return ''
  const m = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return m ? `${m[1] ?? ''}${m[2]}` : ''
}

/** 調査禁止で止まっているか（指定あり＋期間内 or 連絡待ちで未解除）。 */
export function isSurveyOnHold(a: {
  survey_prohibited_designation?: string | null
  survey_prohibited_method?: string | null
  survey_prohibited_start?: string | null
  survey_prohibited_end?: string | null
  prohibition_released_at?: string | null
}, today = new Date().toISOString().slice(0, 10)): boolean {
  if ((a.survey_prohibited_designation ?? '') !== '指定あり') return false
  if (a.prohibition_released_at) return false          // お客様からOKの連絡が来ている
  if ((a.survey_prohibited_method ?? '') === '連絡待ち') return true
  // 期間指定。終了日を過ぎていれば解ける。開始日前は「まだ禁止に入っていない」ので止めない。
  const end = (a.survey_prohibited_end ?? '').trim()
  const start = (a.survey_prohibited_start ?? '').trim()
  if (!end && !start) return true                       // 指定ありなのに期間が空 → 安全側で止める
  if (end && today > end) return false
  if (start && today < start) return false
  return true
}

type LoadedCase = {
  deceasedName: string
  deceasedAddress: string
  /** 被相続人の関係戸籍が揃った */
  deceasedRelationDone: boolean
  /** 依頼者（相続人）の関係戸籍が揃った */
  clientRelationDone: boolean
}

/**
 * その案件で「いま新しく作れる、戸籍待ちだったタスク」を出す。
 * 既に同じ source_rid のタスクがあるものは出さない（二重に作らせない）。
 */
export async function loadNextCandidates(caseId: string): Promise<NextCandidate[]> {
  const supabase = createClient()
  const [{ data: c }, { data: ks }, { data: hs }, { data: props }, { data: fins }, { data: ts }, { data: freqs }, { data: fitems }, { data: fholds }] = await Promise.all([
    supabase.from('cases').select('deceased_name, deceased_address, seal_cert_oldest_issue_date, seal_cert_validity_months, seal_cert_custom_expiry').eq('id', caseId).maybeSingle(),
    supabase.from('koseki_requests').select('target_person, relation_koseki_done').eq('case_id', caseId),
    supabase.from('heirs').select('name, is_client').eq('case_id', caseId),
    supabase.from('real_estate_properties').select('municipality, address').eq('case_id', caseId),
    // 金融の調査先・請求・明細・銘柄。右上の「次の対応」と同じ材料（migration 271）
    supabase.from('financial_institutions').select('*').eq('case_id', caseId),
    supabase.from('tasks').select('source_rid, title, status, phase').eq('case_id', caseId),
    supabase.from('financial_requests').select('*').eq('case_id', caseId),
    supabase.from('financial_request_items').select('*, financial_request_item_accounts(*)').eq('case_id', caseId),
    supabase.from('securities_holdings').select('*').eq('case_id', caseId),
  ])

  const cs = c as { deceased_name: string | null; deceased_address: string | null; seal_cert_oldest_issue_date: string | null; seal_cert_validity_months: number | null; seal_cert_custom_expiry: string | null } | null
  const kosekis = (ks ?? []) as Array<{ target_person: string | null; relation_koseki_done: boolean | null }>
  const heirs = (hs ?? []) as Array<{ name: string | null; is_client: boolean | null }>
  const clientNames = new Set(heirs.filter(h => h.is_client).map(h => (h.name ?? '').trim()).filter(Boolean))
  const deceasedName = (cs?.deceased_name ?? '').trim()

  const state: LoadedCase = {
    deceasedName,
    deceasedAddress: (cs?.deceased_address ?? '').trim(),
    deceasedRelationDone: kosekis.some(k => k.relation_koseki_done && (k.target_person ?? '').trim() === deceasedName && !!deceasedName),
    clientRelationDone: kosekis.some(k => k.relation_koseki_done && clientNames.has((k.target_person ?? '').trim())),
  }

  type TaskLite = { source_rid: string | null; title: string | null; status: string; phase: string | null }
  const taskRows = (ts ?? []) as TaskLite[]
  const have = new Set(taskRows.map(t => (t.source_rid ?? '')).filter(Boolean))
  // その銀行について、まだ終わっていない金融タスク。候補から選ばずに「タスク追加」で任意に作ったものも拾う。
  // 1つの銀行に未完了の金融タスクが1本あれば、その銀行の主工程の候補は出さない（二重に作らせない）。
  // 全店調査は並行の別枝なので、全店調査のタスクがあるときだけ全店調査の候補を消す。
  const openFinTasks = taskRows.filter(t => normalizeTaskStatus(t.status) !== '完了' && (
    /^(fin|fin-wf|fin-freeze|fin-read):/.test(t.source_rid ?? '') || (t.phase ?? '').includes('金融資産')))
  const bankOfTask = (t: TaskLite): string => {
    const m = (t.source_rid ?? '').match(/^(?:fin|fin-wf|fin-freeze|fin-read):([^:]+)/)
    return m ? m[1].trim() : ''
  }
  const hasOpenFinTask = (bank: string, parallel: boolean) => openFinTasks.some(t => {
    const hit = bankOfTask(t) === bank || (t.title ?? '').includes(bank)
    if (!hit) return false
    const isSearch = (t.title ?? '').includes('全店調査') || (t.source_rid ?? '').endsWith(':search')
    return parallel ? isSearch : !isSearch
  })
  const out: NextCandidate[] = []

  // ── 名寄せ請求（市区町村ごと） ──
  // 最後の住所が分かれば、その市区町村へ名寄帳を頼める。登録済みの物件がある市区町村も足す。
  const kosekiOkForMuni = (state.deceasedRelationDone && !!state.deceasedAddress) || state.clientRelationDone
  if (kosekiOkForMuni) {
    const munis = new Set<string>()
    const fromAddress = municipalityOfAddress(state.deceasedAddress)
    if (fromAddress) munis.add(fromAddress)
    for (const p of (props ?? []) as Array<{ municipality: string | null; address: string | null }>) {
      const m = (p.municipality ?? '').trim() || municipalityOfAddress(p.address)
      if (m) munis.add(m)
    }
    const why = state.deceasedRelationDone && fromAddress
      ? `被相続人の関係戸籍が揃い、最後の住所（${state.deceasedAddress}）が分かったため`
      : '依頼者の関係戸籍が揃ったため'
    for (const m of [...munis].sort((a, b) => a.localeCompare(b, 'ja'))) {
      const rid = `re-muni:${m}`
      if (have.has(rid)) continue
      out.push({ rid, title: `名寄帳・評価証明を請求：${m}`, gyomu: '不動産', why })
    }
  }

  // ── 金融：戸籍が揃った案件の、各調査先の「次の対応」をそのまま候補にする ──
  // 銀行ページ右上と同じ関数（evaluateInstitution）。すでに同じタスクがあるものは出さない。
  // 到着待ち・回答待ちは pending に入ってこないので、自然と候補にも出ない。
  const kosekiOkForFin = state.deceasedRelationDone || state.clientRelationDone
  if (kosekiOkForFin) {
    const today = new Date().toLocaleDateString('sv-SE')
    const seal = sealCertificateStatus({
      seal_cert_oldest_issue_date: cs?.seal_cert_oldest_issue_date ?? null,
      seal_cert_validity_months: cs?.seal_cert_validity_months ?? null,
      seal_cert_custom_expiry: cs?.seal_cert_custom_expiry ?? null,
    }, today)
    const institutions = (fins ?? []) as FinancialInstitutionRow[]
    const requests = (freqs ?? []) as FinancialRequestRow[]
    const items = (fitems ?? []) as unknown as FinancialRequestItemRow[]
    const holdings = (fholds ?? []) as SecuritiesHoldingRow[]
    for (const inst of [...institutions].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja'))) {
      const reqs = requests.filter(r => r.institution_id === inst.id)
      const ids = new Set(reqs.map(r => r.id))
      const ev = evaluateInstitution({ institution: inst, requests: reqs, items: items.filter(it => ids.has(it.request_id)), holdings: holdings.filter(h => h.institution_id === inst.id), seal, today })
      for (const p of ev.pending) {
        const rid = pendingRid(p)
        if (have.has(rid)) continue
        if (hasOpenFinTask(inst.name.trim(), p.parallel)) continue   // その銀行はもう誰かのタスクになっている
        out.push({ rid, title: `${p.title}：${inst.name}`, gyomu: '金融資産', why: `${p.parallel ? '並行して進める。' : ''}${p.detail}` })
      }
    }
  }

  return out
}

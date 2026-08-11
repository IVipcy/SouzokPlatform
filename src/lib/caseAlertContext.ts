// 案件アラートの判定材料（CaseAlertContext）をまとめて取ってくる場所。
//
// アラートの条件そのものは alertRules.ts の1か所だけ。ただし判定には
// 「前受金の請求書があるか」「事務管理タスクが生成されているか」など案件の外側のデータが要る。
// これを画面ごとに書いていたせいで、同じ案件なのに画面によって色が違うことが起きていた。
// 取得はここに集約し、案件の色を出す画面はすべてこの ctx を使う。

import type { SupabaseClient } from '@supabase/supabase-js'
import { overdueSeverity, billOverdueSeverity } from '@/lib/overdue'
import { CONTRACT_PENDING_STATUSES } from '@/lib/constants'
import type { AlertSeverity, CaseAlertContext } from '@/lib/alertRules'

// バナーの区分（chui=要注意 / kakunin=要確認）→ アラートの深刻度
const sevOf = (s: 'chui' | 'kakunin' | null): AlertSeverity | null =>
  s === 'chui' ? 'high' : s === 'kakunin' ? 'mid' : null

const OPEN_TASK = (st: string) => st !== '完了' && st !== 'キャンセル'

/**
 * 案件IDの一覧から、アラート判定に必要な材料を1回ずつのクエリで集めて返す。
 * 取れなかったテーブルの項目は undefined のままにする（＝そのアラートは判定しない）。
 */
export async function fetchCaseAlertContexts(
  supabase: SupabaseClient,
  caseIds: string[],
  todayStr: string,
): Promise<Map<string, CaseAlertContext>> {
  const out = new Map<string, CaseAlertContext>()
  if (caseIds.length === 0) return out

  const [membersRes, invoicesRes, tasksRes, docsRes, reportsRes] = await Promise.all([
    supabase.from('case_members').select('case_id,role').in('case_id', caseIds),
    supabase.from('invoices').select('case_id,invoice_type,status,created_at,due_date').in('case_id', caseIds),
    supabase.from('tasks').select('case_id,task_kind,status,due_date').in('case_id', caseIds),
    supabase.from('contract_documents').select('case_id,status,arrival_date').in('case_id', caseIds),
    supabase.from('progress_reports').select('case_id,status,confirmed_date').in('case_id', caseIds),
  ])

  const managerExists = new Set<string>()
  for (const m of (membersRes.data ?? []) as Array<{ case_id: string; role: string }>) {
    if (m.role === 'manager') managerExists.add(m.case_id)
  }

  // 前受金の請求書（案件ごと最初の1件）と、入金期日超過の最大深刻度
  const advance = new Map<string, { status: string; created_at: string | null }>()
  const billSev = new Map<string, AlertSeverity>()
  for (const i of (invoicesRes.data ?? []) as Array<{ case_id: string; invoice_type: string; status: string; created_at: string | null; due_date: string | null }>) {
    if (i.invoice_type === '前受金' && !advance.has(i.case_id)) advance.set(i.case_id, { status: i.status, created_at: i.created_at })
    if (i.status === '入金待ち') {
      const s = sevOf(billOverdueSeverity(i.due_date, todayStr))
      if (s === 'high' || (s === 'mid' && billSev.get(i.case_id) !== 'high')) billSev.set(i.case_id, s)
    }
  }

  // 事務管理タスクの有無と、タスク期限超過の最大深刻度
  const hasCaseTasks = new Set<string>()
  const taskSev = new Map<string, AlertSeverity>()
  for (const t of (tasksRes.data ?? []) as Array<{ case_id: string; task_kind: string | null; status: string; due_date: string | null }>) {
    if (t.task_kind === 'case') hasCaseTasks.add(t.case_id)
    if (!OPEN_TASK(t.status)) continue
    const s = sevOf(overdueSeverity(t.due_date, todayStr))
    if (s === 'high' || (s === 'mid' && taskSev.get(t.case_id) !== 'high')) taskSev.set(t.case_id, s)
  }

  // 契約関連書類が未回収（後日郵送・依頼者が取得 のまま到着していない）
  const contractPending = new Set<string>()
  for (const d of (docsRes.data ?? []) as Array<{ case_id: string; status: string | null; arrival_date: string | null }>) {
    if (CONTRACT_PENDING_STATUSES.includes(d.status ?? '') && !d.arrival_date) contractPending.add(d.case_id)
  }

  // 直近7日に「確認済」の案件報告があるか（週次報告の漏れ判定）
  const weekAgo = new Date(todayStr + 'T00:00:00')
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = weekAgo.toLocaleDateString('sv-SE')
  const recentWeekly = new Set<string>()
  for (const r of (reportsRes.data ?? []) as Array<{ case_id: string; status: string; confirmed_date: string | null }>) {
    if (r.status === '確認済' && (r.confirmed_date ?? '') >= weekAgoStr) recentWeekly.add(r.case_id)
  }

  for (const id of caseIds) {
    const adv = advance.get(id)
    out.set(id, {
      managerExists: managerExists.has(id),
      advanceInvoiceStatus: adv ? adv.status : null,
      advanceInvoiceCreatedAt: adv?.created_at ?? null,
      hasCaseTasks: hasCaseTasks.has(id),
      contractPending: contractPending.has(id),
      recentWeeklyConfirmed: recentWeekly.has(id),
      taskOverdue: taskSev.get(id) ?? null,
      billOverdue: billSev.get(id) ?? null,
    })
  }
  return out
}

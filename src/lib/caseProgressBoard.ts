// 管理担当向け「案件進捗ボード」の集計。受注区分→業務を展開し、各業務のステータスを自動判定。
// 財産（金融資産）は資産別、解約は機関別にサブ項目化。メモは各実務タブの作業内容フリー欄(work_content)。
import { gyomuForCategories, categoriesOf, GYOMU_TAB } from '@/lib/serviceMaster'
import { stripGyomu } from '@/lib/kotei'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import type { TaskRow, CaseRow, FinancialAssetRow } from '@/types'

export type ItemStatus = 'done' | 'prog' | 'todo'
export type BoardItem = { name: string; status: ItemStatus; note?: string }
export type BoardGroup = { title: string; count?: string; items: BoardItem[] }
export type ProgressBoard = { groups: BoardGroup[]; done: number; total: number; percent: number; ruleSummary: string }

// 業務名の表示調整（内部gyomu名→見やすい表示名）
const DISPLAY: Record<string, string> = { '戸籍': '戸籍収集', '相関図': '相続関係説明図', '登記': '相続登記', '目録': '財産目録', '協議書': '遺産分割協議書' }
const label = (g: string) => DISPLAY[g] ?? g

// 資産種別の並び順
const ASSET_ORDER = ['預貯金', '証券', '信託銀行', '生命保険', 'その他']

function statusOfTasks(tasks: TaskRow[], gyomu: string): ItemStatus {
  const ts = tasks.filter(t => stripGyomu(t.phase) === gyomu)
  if (ts.length === 0) return 'todo'
  const norm = ts.map(t => normalizeTaskStatus(t.status))
  if (norm.every(s => s === '完了')) return 'done'
  if (norm.some(s => s === '対応中') || norm.some(s => s === '完了')) return 'prog'
  return 'todo'
}
function statusOfFinType(assets: FinancialAssetRow[]): ItemStatus {
  if (!assets.length) return 'todo'
  const done = (a: FinancialAssetRow) => !!a.balance_confirmed || !!a.survey_result || !!a.arrival_date
  const prog = (a: FinancialAssetRow) => !!a.request_date || !!a.arrival_date || !!a.survey_result || !!a.balance_confirmed
  if (assets.every(done)) return 'done'
  if (assets.some(prog)) return 'prog'
  return 'todo'
}
function statusOfCancel(a: FinancialAssetRow): ItemStatus {
  if (a.cancellation_done) return 'done'
  if (a.cancellation_request_date) return 'prog'
  return 'todo'
}

// タスクの ext_data.execution_result（実施結果）
function extResult(t: TaskRow): string {
  const ext = (t.ext_data ?? {}) as Record<string, unknown>
  return typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
}
// 業務のメモをタスクから自動生成：進行中=対応中タスク名(＋前回実施結果)／完了=最新実施結果／未着手=次タスク名。
function noteFromTasks(tasks: TaskRow[], gyomu: string): string | undefined {
  const ts = tasks.filter(t => stripGyomu(t.phase) === gyomu)
  if (ts.length === 0) return undefined
  const norm = (t: TaskRow) => normalizeTaskStatus(t.status)
  const completed = ts.filter(t => norm(t) === '完了').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const doing = ts.filter(t => norm(t) === '対応中')
  const todo = ts.filter(t => norm(t) === '着手前')
  const lastResult = completed.map(extResult).find(r => !!r) // 最新の実施結果
  if (doing.length > 0) {
    const cur = doing.map(t => t.title).slice(0, 2).join('・')
    return lastResult ? `${cur}（前回：${lastResult}）` : cur
  }
  if (completed.length > 0 && todo.length > 0) {
    if (lastResult && todo[0]) return `${lastResult} → 次：${todo[0].title}`
    return lastResult || todo[0]?.title
  }
  if (completed.length > 0) return lastResult || undefined
  if (todo.length > 0) return todo[0].title
  return undefined
}

export function buildProgressBoard(
  caseData: Pick<CaseRow, 'service_category' | 'service_category_2' | 'procedure_type' | 'work_content'>,
  tasks: TaskRow[],
  financialAssets: FinancialAssetRow[],
): ProgressBoard {
  const cats = (caseData.procedure_type && caseData.procedure_type.length > 0)
    ? caseData.procedure_type
    : categoriesOf(caseData.service_category, caseData.service_category_2)
  const gyomuList = gyomuForCategories(cats)
  const wc = caseData.work_content ?? {}
  const noteFor = (gyomu: string): string | undefined => {
    const tab = GYOMU_TAB[gyomu]
    return wc[gyomu] || (tab ? wc[tab] : undefined) || undefined
  }

  const groups: BoardGroup[] = []
  for (const gyomu of gyomuList) {
    if (gyomu === '金融資産' && financialAssets.length > 0) {
      const byType = new Map<string, FinancialAssetRow[]>()
      for (const a of financialAssets) { const t = a.asset_type || 'その他'; const arr = byType.get(t) ?? []; arr.push(a); byType.set(t, arr) }
      const types = [...byType.keys()].sort((a, b) => (ASSET_ORDER.indexOf(a) + 99) - (ASSET_ORDER.indexOf(b) + 99))
      const items: BoardItem[] = types.map(t => {
        const list = byType.get(t)!
        return { name: t, status: statusOfFinType(list), note: list.map(a => a.institution_name).filter(Boolean).slice(0, 3).join('・') || undefined }
      })
      groups.push({ title: '金融資産調査', count: `${items.filter(i => i.status === 'done').length} / ${items.length}`, items })
      continue
    }
    if (gyomu === '解約') {
      const targets = financialAssets.filter(a => a.cancellation_required === '有' || a.cancellation_required === '確認中')
      if (targets.length > 0) {
        const items: BoardItem[] = targets.map(a => ({ name: a.institution_name || '（機関未設定）', status: statusOfCancel(a), note: a.cancellation_result || undefined }))
        groups.push({ title: '解約手続き', count: `${items.filter(i => i.status === 'done').length} / ${items.length}`, items })
        continue
      }
    }
    // メモ優先順位：① 人が書いたフリー欄 → ② タスクの実施結果を自動集約
    const note = noteFor(gyomu) ?? noteFromTasks(tasks, gyomu)
    groups.push({ title: label(gyomu), items: [{ name: label(gyomu), status: statusOfTasks(tasks, gyomu), note }] })
  }

  const leaves = groups.flatMap(g => g.items)
  const done = leaves.filter(i => i.status === 'done').length
  const total = leaves.length
  const percent = total ? Math.round((done / total) * 100) : 0

  // ルールベースの即時サマリー
  const names = (st: ItemStatus) => leaves.filter(i => i.status === st).map(i => i.name)
  const doneN = names('done'), progN = leaves.filter(i => i.status === 'prog'), todoN = names('todo')
  const parts: string[] = []
  if (doneN.length) parts.push(`完了：${doneN.join('・')}`)
  if (progN.length) parts.push(`進行中：${progN.map(i => i.note ? `${i.name}（${i.note}）` : i.name).join('／')}`)
  if (todoN.length) parts.push(`未着手：${todoN.join('・')}`)
  const ruleSummary = parts.join(' ／ ') || '業務がまだ登録されていません'

  return { groups, done, total, percent, ruleSummary }
}

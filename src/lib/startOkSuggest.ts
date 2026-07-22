// 着手OK提案ライブラリ（判定強度：中）。
// 「着手前かつ着手OKフラグ未セット」のタスクに対し、前段条件が明確に揃っているものだけ提案する。
// 想定される呼び出し元：
//   - 案件詳細タスクタブの「着手OKセンター」ボタン（案件内タスクを対象）
//   - タスク完了モーダル（同案件の次工程を提案）
// 判定は「中」レベル：戸籍不要な工程は常に候補、条件付きの工程は満たしたときだけ候補。

import { normalizeTaskStatus } from '@/lib/taskReadiness'
import type { TaskRow, KosekiRequestRow, FinancialAssetRow } from '@/types'

export type StartOkSuggestion = {
  taskId: string
  taskTitle: string
  reason: string
  // 禁止期間関連など、⚡モーダルで人の目視確認が必要な場合は true
  requiresConfirmation?: boolean
}

// 「戸籍全揃い」の簡易判定：登録された koseki_requests がすべて到着済（arrival_date セット済）。
// 相続人未登録＝戸籍請求そのものが無い場合は「揃い判定」できないので false（要人判断）。
function isKosekiComplete(koseki: KosekiRequestRow[]): boolean {
  if (koseki.length === 0) return false
  return koseki.every(k => !!k.arrival_date)
}

// 「着手前」かつ「着手OKフラグ未セット」のタスクだけを判定対象に。
function isCandidate(t: TaskRow): boolean {
  if (normalizeTaskStatus(t.status) !== '着手前') return false
  const ext = (t.ext_data ?? {}) as Record<string, unknown>
  if (ext.ready === true) return false
  if (typeof ext.ready_reason === 'string' && ext.ready_reason.trim()) return false
  if (ext.ready_on_receipt === true) return false
  return true
}

// 案件内タスクの着手OK提案リストを組み立て。
// 各タスクの source_rid から工程を判定し、前段条件が揃っていれば提案。
export function getStartOkSuggestions(
  tasks: TaskRow[],
  koseki: KosekiRequestRow[],
  financialAssets: FinancialAssetRow[],
  todayYmd: string,
): StartOkSuggestion[] {
  const out: StartOkSuggestion[] = []
  const kosekiOk = isKosekiComplete(koseki)
  const kosekiCount = koseki.filter(k => !!k.arrival_date).length

  for (const t of tasks) {
    if (!isCandidate(t)) continue
    const rid = t.source_rid ?? ''

    // 不動産の請求系（戸籍不要）は常に候補
    if (/^re-muni:/.test(rid) || /^re-houmu:/.test(rid)) {
      out.push({ taskId: t.id, taskTitle: t.title, reason: '不動産の請求は戸籍不要（役所・法務局が求めない）' })
      continue
    }

    // 相続手続き請求（fin:）：戸籍全揃い＋（禁止期間なし or 終了済）
    const fm = rid.match(/^fin:(.+)$/)
    if (fm) {
      const bankName = fm[1]
      const accounts = financialAssets.filter(a => a.institution_name === bankName)
      if (accounts.length === 0) continue
      // その銀行の全口座について、禁止期間が終了しているか
      const bannedNow = accounts.filter(a => a.survey_prohibited_end && a.survey_prohibited_end > todayYmd)
      if (bannedNow.length > 0) continue  // 禁止期間中の口座がある→提案対象外
      // 期日到来した禁止期間があれば要確認フラグ
      const anyProhibitionPast = accounts.some(a => (a.survey_prohibited_end && a.survey_prohibited_end <= todayYmd) || (a.survey_prohibited_reason ?? '').trim())
      if (!kosekiOk) continue  // 戸籍未揃いなら提案しない
      const reason = anyProhibitionPast
        ? `戸籍が全揃い(${kosekiCount}件) ＋ 禁止期間 終了済（要確認）`
        : `戸籍が全揃い(${kosekiCount}件) ＋ 禁止期間なし`
      out.push({ taskId: t.id, taskTitle: t.title, reason, requiresConfirmation: anyProhibitionPast })
      continue
    }

    // 解約手続き（cancel:）：該当銀行の全口座で凍結確認済
    const cm = rid.match(/^cancel:(.+)$/)
    if (cm) {
      const bankName = cm[1]
      const accounts = financialAssets.filter(a => a.institution_name === bankName)
      if (accounts.length === 0) continue
      const allFrozen = accounts.every(a => a.freeze_confirmed === true)
      if (!allFrozen) continue
      out.push({ taskId: t.id, taskTitle: t.title, reason: '凍結確認済（同銀行の全口座）' })
      continue
    }

    // 相続登記（reg:{muni}）：戸籍全揃い＋対象市区町村の物件登録＋登記情報取得済 は複雑なので今回はスキップ
    // 他タスクも判定条件を追加する場合はここに続ける
  }

  return out
}

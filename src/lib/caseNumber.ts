// 案件管理番号の採番ルール。
//   YYMM + 経路コード(2文字) + 当日連番4桁   例: 2606LP0001
//   連番は経路を問わず「その日に作られた順」。
//
// 経路コードは ORDER_ROUTE_CODES（constants.ts）が唯一の定義。定義が無い経路はない。
// XX は「経路がまだ選ばれていない」ことを表す仮の値で、番号を先に振る必要がある場面で使う。
//   - /intake の下書き：最初の入力で案件を作るので、その時点では経路が未入力
//   - 面談登録：面談ルートを空のまま保存したとき
// 経路が入った時点で XX を実コードに差し替える。連番はそのまま（その日の中で一意なので衝突しない）。

import type { SupabaseClient } from '@supabase/supabase-js'
import { ORDER_ROUTE_CODES } from '@/lib/constants'

export const PENDING_ROUTE_CODE = 'XX'

/** 経路が未確定のまま採番された番号か（YYMM + XX + 連番4桁） */
export const isPendingRouteCaseNumber = (caseNumber: string | null | undefined): boolean =>
  /^\d{4}XX\d{4}$/.test(caseNumber ?? '')

/** 経路コードを引く。定義が無ければ null（＝番号は書き換えない） */
export const routeCodeOf = (orderRoute: string | null | undefined): string | null =>
  orderRoute ? ORDER_ROUTE_CODES[orderRoute] ?? null : null

/** XX の番号に経路コードを当てた新しい番号。書き換え不要なら null */
export function caseNumberWithRoute(caseNumber: string | null | undefined, orderRoute: string | null | undefined): string | null {
  if (!isPendingRouteCaseNumber(caseNumber)) return null
  const code = routeCodeOf(orderRoute)
  if (!code || code === PENDING_ROUTE_CODE) return null
  return `${caseNumber!.slice(0, 4)}${code}${caseNumber!.slice(6)}`
}

/**
 * 受注ルートを保存したあとに呼ぶ。番号が XX のままなら実コードに直す。
 * 失敗しても呼び出し元の処理は止めない（番号は後からでも直せる）。
 */
export async function applyRouteToCaseNumber(
  supabase: SupabaseClient,
  caseId: string,
  orderRoute: string | null | undefined,
  knownCaseNumber?: string | null,
): Promise<string | null> {
  if (!routeCodeOf(orderRoute)) return null
  let current = knownCaseNumber ?? null
  if (current == null) {
    const { data } = await supabase.from('cases').select('case_number').eq('id', caseId).single()
    current = (data as { case_number: string | null } | null)?.case_number ?? null
  }
  const next = caseNumberWithRoute(current, orderRoute)
  if (!next) return null
  const { error } = await supabase.from('cases').update({ case_number: next }).eq('id', caseId)
  if (error) {
    console.error('案件番号の経路コード更新に失敗', error)
    return null
  }
  return next
}

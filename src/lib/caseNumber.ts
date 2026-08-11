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
 *
 * case_number は UNIQUE なので、差し替え先が既に使われていたら連番を1つずつ上げて空きを探す
 * （同じ日に別ルートで同じ連番が使われているとぶつかる）。
 * 直す必要が無いときは { number: null, error: null } を返す。
 */
export async function applyRouteToCaseNumber(
  supabase: SupabaseClient,
  caseId: string,
  orderRoute: string | null | undefined,
  knownCaseNumber?: string | null,
): Promise<{ number: string | null; error: string | null }> {
  const code = routeCodeOf(orderRoute)
  if (!code || code === PENDING_ROUTE_CODE) return { number: null, error: null }

  let current = knownCaseNumber ?? null
  if (current == null) {
    const { data } = await supabase.from('cases').select('case_number').eq('id', caseId).single()
    current = (data as { case_number: string | null } | null)?.case_number ?? null
  }
  if (!isPendingRouteCaseNumber(current)) return { number: null, error: null }

  const head = current!.slice(0, 4)
  let seq = parseInt(current!.slice(6), 10)
  if (!Number.isFinite(seq)) return { number: null, error: '案件番号の連番を読み取れませんでした' }

  let lastError = '不明なエラー'
  for (let attempt = 0; attempt < 30; attempt++) {
    const next = `${head}${code}${String(seq).padStart(4, '0')}`
    const { error } = await supabase.from('cases').update({ case_number: next }).eq('id', caseId)
    if (!error) return { number: next, error: null }
    lastError = error.message
    if (error.code === '23505') { seq += 1; continue }   // 同じ番号が既にある → 次の連番へ
    break
  }
  console.error('案件番号の経路コード更新に失敗', lastError)
  return { number: null, error: lastError }
}

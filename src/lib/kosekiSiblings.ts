// 同じ役所への戸籍請求をまとめる判定。
//
// 戸籍だけが「1人×1役所＝1請求（＝1タスク）」なので、人が違っても同じ役所なら
// 同じ封筒で一緒に請求できる。それをタスク詳細・戸籍請求タブ・請求書ウィンドウで知らせるための共通判定。
// （不動産の取得資料は1市区町村＝1請求、金融は1金融機関＝1調査先で最初からまとまっている）

import type { KosekiRequestRow } from '@/types'

/**
 * 同じ役所への未請求（一緒に封筒に入れられるもの）。
 * 同じ案件・同じ請求先・自社取得・請求日が空・承認待ちでない・別の請求。人が違っても同じ人の別範囲でも拾う。
 * 自分自身が請求済み／依頼者取得なら対象外（もう一緒には出せない）。
 */
export function siblingRequestsOf(all: KosekiRequestRow[], r: KosekiRequestRow): KosekiRequestRow[] {
  const dest = (r.request_to ?? '').trim()
  if (!dest || r.request_date || (r.acquirer ?? '自社') === '依頼者') return []
  return all.filter(x =>
    x.id !== r.id && (x.request_to ?? '').trim() === dest && !x.request_date
    && (x.acquirer ?? '自社') !== '依頼者' && !(x.is_additional && !x.additional_approved_at))
}

/** 「近藤花子（出生〜現在）」のような短い呼び名 */
export const siblingLabel = (s: KosekiRequestRow) =>
  `${(s.target_person ?? '').trim() || '対象者未設定'}${s.range_text ? `（${s.range_text}）` : ''}`

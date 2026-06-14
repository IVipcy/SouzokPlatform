// 取得区分（自社取得 / 依頼者取得）の共通ロジック。
// 相続人調査(戸籍)・財産調査(金融)・登記(不動産)の取得行で共有する。

import type { CaseRow } from '@/types'

export const ACQUIRERS = ['自社', '依頼者'] as const
export type Acquirer = (typeof ACQUIRERS)[number]

export function acquirerLabel(a: string | null | undefined): string {
  return a === '依頼者' ? '依頼者取得' : '自社取得'
}

// 役割分担(intake_roles)の指定業務に、依頼者担当の作業が1つでもあれば '依頼者'、
// なければ '自社' を返す。「役割分担から反映」ボタンの流し込み値に使う。
export function acquirerFromRoles(roles: CaseRow['intake_roles'] | undefined, gyomus: string[]): Acquirer {
  const hit = (roles ?? []).some(r => gyomus.includes(r.gyomu) && r.owner === '依頼者')
  return hit ? '依頼者' : '自社'
}

// 取得行で参照する業務（マッピング）
export const ACQUIRER_GYOMU = {
  koseki: ['戸籍'],
  financial: ['金融資産'],
  realEstate: ['不動産', '登記'],
}

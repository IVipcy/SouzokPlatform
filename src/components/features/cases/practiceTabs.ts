import type { TabKey } from './CaseTabs'

// 手続き系業務タブ（放棄/信託/調停/検認/後見）の定義。
// 遺言・相続登記タブと同格の独立タブ。受注区分→業務で出し分け（caseTabs / OrderSheet）。
// PracticeProcedureTab に渡す gyomu は serviceMaster の業務名（GYOMU_TAB のキー）と一致させる。
export type ProcedureTab = { tab: TabKey; gyomu: string; title: string; description?: string }

export const PROCEDURE_TABS: ProcedureTab[] = [
  { tab: 'trust', gyomu: '信託契約書作成', title: '信託契約', description: '信託契約書の作成・公証役場対応の作業を管理します。' },
  { tab: 'renunciation', gyomu: '放棄手続き', title: '相続放棄', description: '家庭裁判所への申述から受理証明取得までの作業を管理します。' },
  { tab: 'mediation', gyomu: '調停手続き', title: '調停', description: '遺産分割調停の申し立て関連の作業を管理します。' },
  { tab: 'probate', gyomu: '検認手続き', title: '遺言検認', description: '自筆証書遺言の検認申し立て・期日対応の作業を管理します。' },
  { tab: 'guardianship', gyomu: '後見手続き', title: '成年後見', description: '後見の申し立て書類準備・提出の作業を管理します。' },
]

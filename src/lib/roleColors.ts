// 各ロールのアイコン表示色を一元管理。
// 「受注担当=ネイビー」「管理担当=グリーン」のように、
// 役割と色を一対一対応させることでチームメンバーの役割が一目で分かるようにする。

export type AvatarRole =
  | 'sales'
  | 'manager'
  | 'sub_manager'
  | 'assistant'
  | 'accounting'
  | 'lp'

// HEX値（バッジ、リング、塗りつぶしに使う）
export const ROLE_COLORS: Record<AvatarRole, string> = {
  sales:       '#0f487e',  // Ocean ネイビー
  manager:     '#16a34a',  // グリーン
  sub_manager: '#84cc16',  // ライトグリーン（ライム）
  assistant:   '#facc15',  // イエロー
  accounting:  '#06b6d4',  // シアン
  lp:          '#6b7280',  // グレー（仕様未定のためフォールバック）
}

// 文字色（背景に対するコントラスト）。
//   - 暗い背景（sales/manager/accounting）→ 白文字
//   - 明るい背景（sub_manager/assistant）→ 黒に近い文字
export const ROLE_FOREGROUND: Record<AvatarRole, string> = {
  sales:       '#ffffff',
  manager:     '#ffffff',
  sub_manager: '#1f2937',
  assistant:   '#1f2937',
  accounting:  '#ffffff',
  lp:          '#ffffff',
}

// 不明 / 未指定の場合のフォールバック色
export const FALLBACK_COLOR = '#9ca3af'   // gray-400
export const FALLBACK_FOREGROUND = '#ffffff'

// 任意の文字列を AvatarRole にキャストする（DB の値を信用しすぎないため）。
// 知らないキーが来たら null を返す。
export function asAvatarRole(value: string | null | undefined): AvatarRole | null {
  if (!value) return null
  if (
    value === 'sales' ||
    value === 'manager' ||
    value === 'sub_manager' ||
    value === 'assistant' ||
    value === 'accounting' ||
    value === 'lp'
  ) {
    return value
  }
  return null
}

// 色（背景/前景）を取得するヘルパ
export function colorsForRole(role: AvatarRole | null | undefined): {
  bg: string
  fg: string
} {
  if (!role) return { bg: FALLBACK_COLOR, fg: FALLBACK_FOREGROUND }
  return { bg: ROLE_COLORS[role], fg: ROLE_FOREGROUND[role] }
}

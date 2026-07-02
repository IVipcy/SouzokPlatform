// ============================================================
// ミニマム運用モード（機能を絞った暫定運用）。
//
// 【考え方】フルモード（全機能）が土台で、これはその上に被せる "隠すレイヤー"。
//   ・未設定（既定）＝フルモード。ローカル開発は何も設定しなければフル機能で動く。
//   ・本番 Render にだけ NEXT_PUBLIC_MINIMAL_MODE=true を設定してミニマム運用。
//   ・1ヶ月のトライアル後、本番のフラグを外す（=false / 削除）だけで全機能が一斉に解放される。
//
// 【将来の段階リリースへの拡張】
//   今は bool 1つ。「機能ごとに順次公開」にしたくなったら、この1ファイルの許可リスト
//   （MINIMAL_NAV / MINIMAL_TABS / gatesDisabled）を "有効な機能キー集合" に置き換えるだけでよい。
//   呼び出し側は意味的ヘルパー（isNavVisible / isCaseTabVisible / gatesDisabled）経由なので影響しない。
// ============================================================

/** ミニマム運用モードか（本番のみ true）。未設定＝フルモード。 */
export const isMinimalMode = (): boolean =>
  process.env.NEXT_PUBLIC_MINIMAL_MODE === 'true'

// ── サイドバーで表示する nav の href（ミニマム時の許可リスト） ──
const MINIMAL_NAV = new Set<string>(['/my', '/cases', '/meeting', '/billing'])
/** サイドバー nav を表示してよいか。フルモードでは常に true。 */
export const isNavVisible = (href: string): boolean =>
  !isMinimalMode() || MINIMAL_NAV.has(href)

/** ミニマム時のログイン着地先（ダッシュボードを隠すため）。 */
export const MINIMAL_LANDING = '/my'

// ── 案件詳細タブで表示する TabKey（ミニマム時の許可リスト） ──
// 残す: 案件進捗 / 担当・受注ルート(管理担当アサイン) / 面談情報 / 依頼者 /
//       相続人調査(被相続人情報) / 案件基本情報 / 請求 / 契約書作成・書類作成(AI書類=任意) / 履歴
// 隠す: オーダーシート / タスク / 郵送書類確認 / 受注内容 / 他事業者紹介 / 実務系 / 案件フォルダ
const MINIMAL_TABS = new Set<string>([
  'basicInfo', 'ownerSales', 'meeting', 'clientInfo', 'deceased', 'caseBasic',
  'contract', 'contractCreate', 'documentCreate', 'history',
])
/** 案件詳細タブを表示してよいか。フルモードでは常に true。 */
export const isCaseTabVisible = (tab: string): boolean =>
  !isMinimalMode() || MINIMAL_TABS.has(tab)

/**
 * ミニマム時は「前提を満たさないと次ステータスに進めない」ハードゲートや、
 * 各種フローナビ・自動タスク催促・初期対応タスク確認ポップアップを止める（手動で自由に変更）。
 */
export const gatesDisabled = (): boolean => isMinimalMode()

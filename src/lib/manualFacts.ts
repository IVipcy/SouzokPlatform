// マニュアルのAIに渡す「システムの事実」。
//
// AIは渡された文章しか知らないので、白紙から記事を書かせるには
// このシステムが実際にどう動くかを毎回添えてやる必要がある。
//
// 大事なのは、ここを手で書き写さないこと。しきい値や選択肢はコード本体
// （alertRules.ts / constants.ts）から組み立てるので、条件を変えれば
// AIの知識も自動で変わる。資料と画面がずれない。

import { ALERT_DAYS, ALERT_CAL_DAYS, ALERT_CATALOG, CASE_FLAG_LABEL } from '@/lib/alertRules'
import { REPORT_KAKUNIN_BIZ_DAYS, REPORT_CHUI_BIZ_DAYS } from '@/lib/caseReports'
import { CASE_STATUSES, TASK_STATUSES, ORDER_ROUTES, BILLING_PATTERNS, ROLES } from '@/lib/constants'

/** AIに渡す事実の塊。プロンプトにそのまま差し込む。 */
export function systemFacts(): string {
  const statuses = CASE_STATUSES.map(s => (s.key === s.label ? s.key : `${s.key}（画面表示：${s.label}）`)).join('、')
  const taskStatuses = TASK_STATUSES.map(t => t.key).join('、')
  const roles = ROLES.map(r => r.label).join('、')
  const routes = [...ORDER_ROUTES].join('、')
  const patterns = BILLING_PATTERNS.map(p => `${p.no} ${p.label}（${p.desc}）`).join(' / ')
  const colors = Object.entries(CASE_FLAG_LABEL).map(([k, v]) => `${k}=${v}`).join('、')

  const alerts = ALERT_CATALOG
    .map(g => `【${g.group}】\n` + g.items.map(i => `  - ${i.label}（${sevLabel(i.severity)}）：${i.when}`).join('\n'))
    .join('\n')

  return `# このシステムの事実（ここに書かれていないことは書かないこと）

## 用語と選択肢
- 案件ステータス：${statuses}
- タスクの状態：${taskStatuses}
- 役割：${roles}
- 受注ルート：${routes}
- 請求パターン：${patterns}
- 案件の色：${colors}。案件の色は「その案件に出ているアラートの一番重い色」でしかない

## アラートの仕組み
- 深刻度は4段階。claim（紫）／high（赤・要注意バナー）／mid（黄・要確認バナー）／info（青・ベルのみ）
- 出る場所は深刻度だけで決まる。アラートの種類ごとに決めてはいない
- 営業日＝日曜と祝日を除く日。土曜は営業日
- アラートは状態から毎回計算する。既読にする操作はなく、元の状態を直せば自動で消える
- 通知は誰かが操作した瞬間に1件つくられ、履歴として残る。既読で消える

## アラートの種類としきい値
${alerts}

## 主なしきい値（営業日。かっこ内は暦日）
- 管理担当 未アサイン：受注から${ALERT_DAYS.managerUnassign}
- オーダーシート未完成：受注から${ALERT_DAYS.orderSheetMid}（黄）／${ALERT_DAYS.orderSheetHigh}（赤）
- 前受金 未請求：受注から${ALERT_DAYS.advanceInvoice}
- 前受金 郵送・入金待ち：請求書作成から${ALERT_DAYS.advanceSend}
- 契約手続き 未了：${ALERT_DAYS.contractDocs}
- タスク未生成：作業進行中から${ALERT_DAYS.tasksGenerate}
- タスク期限超過：${ALERT_DAYS.taskMid}（黄）／${ALERT_CAL_DAYS.taskHigh}日・暦日（赤）
- 入金期日超過：期日＋${ALERT_DAYS.billBase}営業日を起点に、そこから${ALERT_CAL_DAYS.billKakunin}日（黄）／${ALERT_CAL_DAYS.billChui}日（赤）。日数は暦日
- 報連相（要対応）未回答：${REPORT_KAKUNIN_BIZ_DAYS}（黄）／${REPORT_CHUI_BIZ_DAYS}（赤）。情報共有はアラートに出さない
- 案件報告 未回答：${ALERT_DAYS.reportAnswer}。状態が「至急！！」なら即赤
- 到着物あり（未開封）：到着連絡から${ALERT_DAYS.parcelOpen}
- 未対応が続いている：最後に案件を開いてから${ALERT_DAYS.inactivityMid}（黄）／${ALERT_DAYS.inactivityHigh}（赤）
- 前受金入金御礼 未連絡：${ALERT_DAYS.prepayThanksMid}（黄）／${ALERT_DAYS.prepayThanksHigh}（赤）

## 3つの入力の役割
- 面談シート：面談で聞き取ったことを書き取る。保存しても案件は下書きのままで一覧に出ない
- 面談結果登録：面談の結果を決める。保存すると正式な案件に昇格し、面談シートの内容がその時点で凍結保存される
- オーダーシート：受注した案件の作業指示書。実務タブの入力元になる`
}

const sevLabel = (s: string) =>
  s === 'claim' ? '紫' : s === 'high' ? '赤・要注意' : s === 'mid' ? '黄・要確認' : '青・ベルのみ'

'use client'

// 案件報告・報連相の「作成ウィンドウ」を案件詳細ルートに置くための共有API。
// ウィンドウ本体は CaseComposeProvider がルートで描画するので、タブを切り替えても残る。
// 各タブのボタンは useCaseCompose() で openReport()/openHourenSou() を呼ぶだけ。
// refreshKey は送信のたびに増える。HistoryTab はこれを監視して一覧を再取得する。

import { createContext, useContext } from 'react'

export type CaseComposeApi = {
  openReport: () => void
  openHourenSou: () => void
  refreshKey: number
}

export const CaseComposeContext = createContext<CaseComposeApi | null>(null)
export const useCaseCompose = () => useContext(CaseComposeContext)

// 受注担当/管理担当タスク（task_kind='system'）の内訳。
//
// この区分には性質の違う2種類が同居している。
//   gyomu … 案件を進める工程の一部。事務管理の本流のうち管理担当がやるもの
//           （精算書作成・指図書作成・法定相続情報取得・各種の最終確認 など）
//   other … 本流とは関係なく随時発生するもの（お客様への連絡・引継ぎ など）
//
// 混ざったまま並ぶと「案件がどこまで進んだか」が読めないので、一覧ではサブタブで分ける。
// 判定は業務区分（phase）だけ。手で足した古いタスクは業務区分が空なので、そのまま other に入る。

export type SystemTaskGroup = 'gyomu' | 'other'

export const systemTaskGroup = (t: { phase?: string | null }): SystemTaskGroup => {
  const g = (t.phase ?? '').replace(/^Phase\d+[:：]\s*/, '').trim()
  return !g || g === 'その他' ? 'other' : 'gyomu'
}

export const SYSTEM_GROUP_LABEL: Record<SystemTaskGroup, string> = {
  gyomu: '業務',
  other: 'その他',
}

export const SYSTEM_GROUP_NOTE: Record<SystemTaskGroup, string> = {
  gyomu: '案件を進めるためのタスク',
  other: '随時発生するタスク（お客様連絡・引継ぎ など）',
}

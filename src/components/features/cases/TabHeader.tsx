// 案件詳細の各タブ共通の見出し。▎タイトル＋淡色の説明文。
// 全タブで同じスタイルにするため、ここ1か所で定義する。

type Props = {
  title: string
  description?: string
  /** タイトル右側に出す追加要素（バッジ等。任意） */
  right?: React.ReactNode
}

export default function TabHeader({ title, description, right }: Props) {
  return (
    <div className="mb-3 flex items-center gap-3 flex-wrap">
      <div className="inline-flex items-center gap-2">
        <span className="inline-block w-[4px] h-[18px] bg-brand-600 rounded-[2px]" aria-hidden="true" />
        <h2 className="text-[15px] font-bold text-gray-900 tracking-[0.01em]">{title}</h2>
      </div>
      {description && (
        <span className="text-[12px] text-gray-500">{description}</span>
      )}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  )
}

/**
 * ページ遷移中に表示する汎用スケルトン
 */
export default function PageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* タイトル */}
      <div className="mb-5">
        <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-64 bg-gray-100 rounded" />
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
            <div className="h-7 w-12 bg-gray-300 rounded mb-1" />
            <div className="h-2 w-12 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* テーブル */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-gray-50">
            <div className="h-3 bg-gray-200 rounded col-span-2" />
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

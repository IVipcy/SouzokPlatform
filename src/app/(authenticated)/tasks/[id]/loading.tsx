export default function TaskDetailLoading() {
  return (
    <div className="animate-pulse">
      {/* パンくず */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-3 w-12 bg-gray-200 rounded" />
        <div className="h-3 w-40 bg-gray-200 rounded" />
      </div>

      {/* ヘッダーカード */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-5 w-20 bg-gray-200 rounded" />
          <div className="h-5 w-24 bg-gray-200 rounded-full" />
        </div>
        <div className="h-7 w-64 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="flex gap-4 mt-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div className="w-3 h-3 bg-gray-200 rounded-full" />
              <div className="h-2 w-12 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 2カラム */}
      <div className="flex gap-5">
        <div className="flex-1 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 bg-gray-100 rounded" />
                <div className="h-8 bg-gray-100 rounded" />
                <div className="h-8 bg-gray-100 rounded" />
                <div className="h-8 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="w-[320px] space-y-4">
          <div className="h-40 bg-blue-100 rounded-xl" />
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="space-y-2">
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

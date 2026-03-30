export default function CaseDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-6 w-48 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-64 bg-gray-200 rounded mb-4" />
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
          </div>
        </div>
      </div>
      <div className="flex gap-4 mb-6 border-b border-gray-200 pb-2">
        <div className="h-8 w-16 bg-gray-200 rounded" />
        <div className="h-8 w-16 bg-gray-200 rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 h-48" />
          <div className="bg-white rounded-xl border border-gray-200 p-6 h-32" />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 h-40" />
          <div className="bg-white rounded-xl border border-gray-200 p-6 h-32" />
        </div>
      </div>
    </div>
  )
}

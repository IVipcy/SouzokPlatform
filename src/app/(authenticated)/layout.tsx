import Sidebar from '@/components/layout/Sidebar'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { AlertCenterProvider } from '@/components/providers/AlertCenterProvider'
import { ToastContainer } from '@/components/ui/Toast'
import { getCurrentUser } from '@/lib/auth'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  return (
    <AuthProvider user={user}>
      <AlertCenterProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          {/* min-w-0: 幅広テーブル等を内側の overflow-x-auto でスクロールさせ、
              ページ全体（サマリ含む）が押し広げられないようにする */}
          <main className="flex-1 min-w-0 ml-60 p-6">
            {children}
          </main>
          <ToastContainer />
        </div>
      </AlertCenterProvider>
    </AuthProvider>
  )
}

import Sidebar from '@/components/layout/Sidebar'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { ToastContainer } from '@/components/ui/Toast'
import TopProgressBar from '@/components/ui/TopProgressBar'
import { getCurrentUser } from '@/lib/auth'
import { Suspense } from 'react'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  return (
    <AuthProvider user={user}>
      <Suspense fallback={null}>
        <TopProgressBar />
      </Suspense>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 p-6">
          {children}
        </main>
        <ToastContainer />
      </div>
    </AuthProvider>
  )
}

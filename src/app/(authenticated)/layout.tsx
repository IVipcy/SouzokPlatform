import Sidebar from '@/components/layout/Sidebar'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { getCurrentUser } from '@/lib/auth'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  return (
    <AuthProvider user={user}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 p-6">
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}

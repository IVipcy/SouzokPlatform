import { AuthProvider } from '@/components/providers/AuthProvider'
import { AlertCenterProvider } from '@/components/providers/AlertCenterProvider'
import { ToastContainer } from '@/components/ui/Toast'
import { getCurrentUser } from '@/lib/auth'
import StandaloneTopBar from './register/StandaloneTopBar'
import InstallGuide from './register/InstallGuide'

// 独立ルート（サイドバー無し・モバイル最適）。相談案件登録にURLで直行する用途。
export default async function StandaloneLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  return (
    <AuthProvider user={user}>
      <AlertCenterProvider>
        <div className="min-h-screen bg-gray-50">
          <StandaloneTopBar />
          <main className="mx-auto w-full max-w-[840px] px-3 py-4 sm:px-4">
            <InstallGuide />
            {children}
          </main>
          <ToastContainer />
        </div>
      </AlertCenterProvider>
    </AuthProvider>
  )
}

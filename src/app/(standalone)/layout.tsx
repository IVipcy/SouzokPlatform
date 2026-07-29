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
          {/* タブレット最適化：iPad縦(768pt)〜横(1194pt)で余白バランスよく。最大1080pxまで広げる。 */}
          <main className="mx-auto w-full max-w-[1080px] px-3 py-4 sm:px-5 md:px-6">
            <InstallGuide />
            {children}
          </main>
          <ToastContainer />
        </div>
      </AlertCenterProvider>
    </AuthProvider>
  )
}

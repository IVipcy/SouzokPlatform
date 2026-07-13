import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 外部システム連携エンドポイントはユーザー認証を要求しない（独自のAPIキー+HMAC検証）
  if (request.nextUrl.pathname.startsWith('/api/integration/')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 未ログインで /login 以外にアクセス → ログインページへ（元のパスを next で保持）
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // ログイン済みで /login にアクセス → next があればそこへ、無ければダッシュボード
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const next = request.nextUrl.searchParams.get('next')
    const url = request.nextUrl.clone()
    url.pathname = next && next.startsWith('/') && !next.startsWith('/login') ? next : '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // PWA関連（manifest / service worker / icons）は認証に巻き込まず公開で配信する。
    // これが無いと Chrome がインストール可能と判定できず「ホーム画面に追加」しか出ない。
    '/((?!_next/static|_next/image|favicon.ico|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
}

// 最小のサービスワーカー（PWAインストール要件を満たすためのpass-through）。
// オフライン対応（キャッシュ）は後日追加予定。今はネットワークをそのまま通す。
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { /* network passthrough */ })

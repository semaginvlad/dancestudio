import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()
clientsClaim()

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('push', (event) => {
  const fallback = {
    title: 'SOROKA CRM',
    body: 'Нове сповіщення',
    url: '/',
  }

  let payload = fallback
  try {
    const parsed = event.data ? event.data.json() : null
    payload = parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback
  } catch {
    const text = event.data?.text?.()
    payload = text ? { ...fallback, body: text } : fallback
  }

  const title = payload.title || 'SOROKA CRM'
  const options = {
    body: payload.body || 'Нове сповіщення',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    data: {
      url: payload.url || '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification?.data?.url || '/'
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const target = new URL(targetUrl, self.location.origin).href

    for (const client of allClients) {
      if (client.url === target && 'focus' in client) {
        await client.focus()
        return
      }
    }

    if (clients.openWindow) {
      await clients.openWindow(target)
    }
  })())
})

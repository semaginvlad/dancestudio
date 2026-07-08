import { registerSW } from 'virtual:pwa-register'

let updateSWHandler = null
let registration = null
let started = false
let lastUpdateCheck = 0
const listeners = new Set()

const emitUpdateAvailable = () => {
  listeners.forEach((listener) => listener())
}

const checkForServiceWorkerUpdate = () => {
  const now = Date.now()
  if (!registration || now - lastUpdateCheck < 60_000) return

  lastUpdateCheck = now
  registration.update().catch((error) => {
    console.warn('Service worker update check failed', error)
  })
}

export function initializePwaUpdate() {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) return

  started = true
  updateSWHandler = registerSW({
    immediate: true,
    onNeedRefresh() {
      emitUpdateAvailable()
    },
    onRegisteredSW(_swUrl, swRegistration) {
      registration = swRegistration || null
      checkForServiceWorkerUpdate()
      window.addEventListener('focus', checkForServiceWorkerUpdate)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForServiceWorkerUpdate()
      })
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error)
    },
  })
}

export function subscribeToPwaUpdates(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function applyPwaUpdate() {
  if (updateSWHandler) updateSWHandler(true)
}

import apiClient from './apiClient'

function base64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function ensurePushSubscription(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  // Check user preference first.
  let browserEnabled = true
  try {
    const prefRes = await apiClient.get('/profile/notifications')
    browserEnabled = (prefRes.data?.preferences?.browser_enabled ?? 1) === 1
  } catch {
    browserEnabled = true
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  const existing = await registration.pushManager.getSubscription()

  if (!browserEnabled) {
    if (existing) {
      try {
        await apiClient.post('/profile/push/unsubscribe', { endpoint: existing.endpoint })
      } catch {
        // ignore
      }
      await existing.unsubscribe().catch(() => {})
    }
    return
  }

  const perm = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission

  if (perm !== 'granted') return

  const keyRes = await apiClient.get('/profile/push/public-key')
  const publicKey = keyRes.data?.public_key as string | null
  const enabled = Boolean(keyRes.data?.enabled)
  if (!enabled || !publicKey) return

  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(publicKey) as unknown as BufferSource,
  })

  await apiClient.post('/profile/push/subscribe', subscription.toJSON())
}

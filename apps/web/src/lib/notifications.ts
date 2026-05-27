export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function notifyTranscriptionDone(title: string, body: string, meetingTitle?: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const finalBody = meetingTitle ? `${body} — ${meetingTitle}` : body
    const n = new Notification(title, { body: finalBody, icon: '/icons/icon-192.png' })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // notifiche non disponibili (es. iOS Safari < 16.4)
  }
}

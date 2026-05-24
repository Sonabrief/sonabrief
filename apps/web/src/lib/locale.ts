export const APP_LOCALE = 'it-IT'

export function formatMeetingTitle(date: Date): string {
  return date.toLocaleString(APP_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

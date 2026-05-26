import i18n from '../i18n'

export function formatMeetingTitle(date: Date): string {
  return date.toLocaleString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

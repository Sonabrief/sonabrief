import { db } from './db'

const SECTION_KEYWORDS = [
  'prossimi passi', 'next steps', 'action item', 'azioni',
  'follow-up', 'follow up', 'to do', 'todo',
]

export function extractActionItems(markdown: string): string[] {
  const lines = markdown.split('\n')
  const items: string[] = []
  let inSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Detect headings: **Heading**, **Heading:**, ## Heading
    const isHeading = /^\*\*[^*]+\*\*:?$/.test(trimmed) || /^#{1,4}\s+/.test(trimmed)
    if (isHeading) {
      const headingText = trimmed
        .replace(/^#{1,4}\s+/, '')
        .replace(/\*\*/g, '')
        .replace(/:$/, '')
        .toLowerCase()
      inSection = SECTION_KEYWORDS.some(kw => headingText.includes(kw))
      continue
    }

    if (inSection) {
      // Bullet con trattino: "- testo"
      const bullet = trimmed.match(/^[-*]\s+(.+)/)
      if (bullet) {
        items.push(bullet[1].trim())
      } else {
        // Riga di testo semplice (senza bullet) — trattala come item
        items.push(trimmed)
      }
    }
  }

  return items
}

export async function saveActionItemsFromNote(meetingId: string, markdown: string): Promise<void> {
  const meeting = await db.meetings.get(meetingId)
  if (!meeting) return

  const texts = extractActionItems(markdown)

  await db.action_items.where('meetingId').equals(meetingId).delete()

  if (texts.length === 0) return

  const now = Date.now()
  await db.action_items.bulkAdd(
    texts.map(text => ({
      id: crypto.randomUUID(),
      meetingId,
      meetingTitle: meeting.title,
      meetingDate: meeting.startedAt,
      text,
      completed: false,
      createdAt: now,
    }))
  )
}

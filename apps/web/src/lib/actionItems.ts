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

    // Detect headings: **Heading:** or **Heading**
    if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) {
      const headingText = trimmed.replace(/\*\*/g, '').replace(/:$/, '').toLowerCase()
      inSection = SECTION_KEYWORDS.some(kw => headingText.includes(kw))
      continue
    }

    if (inSection) {
      // Bullet point: "- text" or "* text"
      const bullet = trimmed.match(/^[-*]\s+(.+)/)
      if (bullet) {
        items.push(bullet[1].trim())
      } else if (trimmed.length > 0 && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        // Non-empty, non-bullet line ends the section
        inSection = false
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

import { getCurrentKey, isUnlocked } from './keystore'
import { encryptMeeting, decryptMeeting } from './blob'
import { generateSalt } from './crypto'
import { db, type Meeting, type Transcript, type Note } from './db'
import { API_URL } from '../config'

interface SyncPayload {
  meeting: Meeting
  transcripts: Transcript[]
  notes: Note[]
}

export async function uploadMeeting(meetingId: string): Promise<{ ok: true; size: number }> {
  if (!isUnlocked()) throw new Error('keystore_locked')

  const [meeting, transcripts, notes] = await Promise.all([
    db.meetings.get(meetingId),
    db.transcripts.where('meetingId').equals(meetingId).toArray(),
    db.notes.where('meetingId').equals(meetingId).toArray(),
  ])

  if (!meeting) throw new Error(`meeting_not_found: ${meetingId}`)

  const payload: SyncPayload = { meeting, transcripts, notes }
  const salt = generateSalt()
  const encrypted = encryptMeeting(payload, getCurrentKey()!, salt)

  const formData = new FormData()
  formData.append('meeting_id', meetingId)
  formData.append('blob', new Blob([encrypted as unknown as BlobPart], { type: 'application/octet-stream' }))

  const response = await fetch(`${API_URL}/v1/sync/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  if (!response.ok) throw new Error(await response.text())

  return response.json() as Promise<{ ok: true; size: number }>
}

export async function downloadMeeting(meetingId: string): Promise<void> {
  if (!isUnlocked()) throw new Error('keystore_locked')

  const response = await fetch(`${API_URL}/v1/sync/download`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meeting_id: meetingId }),
  })

  if (response.status === 404) throw new Error('blob_not_found')
  if (!response.ok) throw new Error(`sync_download_failed: ${response.status}`)

  const buffer = await response.arrayBuffer()
  const blob = new Uint8Array(buffer)
  const { meeting, transcripts, notes } = decryptMeeting(blob, getCurrentKey()!) as SyncPayload

  await db.transaction('rw', [db.meetings, db.transcripts, db.notes], async () => {
    await db.meetings.put(meeting)
    for (const transcript of transcripts) await db.transcripts.put(transcript)
    for (const note of notes) await db.notes.put(note)
  })
}

export async function syncMeetingNow(meetingId: string): Promise<void> {
  try {
    const { size } = await uploadMeeting(meetingId)
    console.log(`[sync] uploaded ${meetingId} (${size} bytes)`)
  } catch (err) {
    console.error(`[sync] upload failed for ${meetingId}:`, err)
  }
}

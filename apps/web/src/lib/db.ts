import Dexie, { type Table } from 'dexie'

export interface Meeting {
  id: string
  title: string
  startedAt: number
  endedAt?: number
  durationSeconds?: number
  mode: 'standard' | 'local_only' | 'hybrid'
  lang?: string
  audioPath?: string
  createdAt: number
  updatedAt: number
}

export interface Transcript {
  id: string
  meetingId: string
  text: string
  segments?: string        // JSON array di {start, end, text}
  createdAt: number
}

export interface Note {
  id: string
  meetingId: string
  content: string          // JSON blocchi editor
  templateId?: string
  generatedAt?: number
  editedAt?: number
  createdAt: number
  updatedAt: number
}

class SonabriefDB extends Dexie {
  meetings!: Table<Meeting>
  transcripts!: Table<Transcript>
  notes!: Table<Note>

  constructor() {
    super('sonabrief')
    this.version(1).stores({
      meetings:    '&id, startedAt, mode',
      transcripts: '&id, meetingId',
      notes:       '&id, meetingId',
    })
  }
}

export const db = new SonabriefDB()
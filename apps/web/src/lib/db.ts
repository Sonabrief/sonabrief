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
  segments?: string
  createdAt: number
}

export interface Note {
  id: string
  meetingId: string
  content: string
  templateId?: string
  generatedAt?: number
  editedAt?: number
  createdAt: number
  updatedAt: number
}

export interface ActionItem {
  id: string
  meetingId: string
  meetingTitle: string
  meetingDate: number
  text: string
  completed: boolean
  dueDate?: number
  createdAt: number
}

export interface Embedding {
  meetingId: string   // primary key
  vector: number[]
  createdAt: number
}

class SonabriefDB extends Dexie {
  meetings!: Table<Meeting>
  transcripts!: Table<Transcript>
  notes!: Table<Note>
  action_items!: Table<ActionItem>
  embeddings!: Table<Embedding>

  constructor() {
    super('sonabrief')
    this.version(1).stores({
      meetings:    '&id, startedAt, mode',
      transcripts: '&id, meetingId',
      notes:       '&id, meetingId',
    })
    this.version(2).stores({
      meetings:     '&id, startedAt, mode',
      transcripts:  '&id, meetingId',
      notes:        '&id, meetingId',
      action_items: '&id, meetingId, completed, createdAt',
    })
    this.version(3).stores({
      meetings:     '&id, startedAt, mode',
      transcripts:  '&id, meetingId',
      notes:        '&id, meetingId',
      action_items: '&id, meetingId, completed, createdAt',
      embeddings:   '&meetingId, createdAt',
    })
  }
}

export const db = new SonabriefDB()

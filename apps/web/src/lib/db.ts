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
  clientName?: string
  projectStream?: string
  tags?: string[]
  participants?: string[]
  hasSynthesis?: boolean
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
  meetingId: string
  vector: number[]
  createdAt: number
}

export interface RecordingChunk {
  id: string
  sessionId: string
  chunkIndex: number
  encryptedData: Uint8Array
  nonce: Uint8Array
  startMs: number
  durationMs: number
  status: 'pending' | 'transcribed'
  createdAt: number
}

export interface RecordingSession {
  sessionId: string
  partialText: string
  lang: string
  startedAt: number
  updatedAt: number
  status?: 'active' | 'interrupted'
}

class SonabriefDB extends Dexie {
  meetings!: Table<Meeting>
  transcripts!: Table<Transcript>
  notes!: Table<Note>
  action_items!: Table<ActionItem>
  embeddings!: Table<Embedding>
  recording_chunks!: Table<RecordingChunk>
  recording_sessions!: Table<RecordingSession>

  constructor() {
    super('sonabrief')
    this.version(1).stores({ meetings: '&id, startedAt, mode', transcripts: '&id, meetingId', notes: '&id, meetingId' })
    this.version(2).stores({ meetings: '&id, startedAt, mode', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt' })
    this.version(3).stores({ meetings: '&id, startedAt, mode', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt' })
    this.version(4).stores({ meetings: '&id, startedAt, mode, clientName', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt' })
    this.version(5).stores({ meetings: '&id, startedAt, mode, clientName, projectStream', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt' })
    this.version(6).stores({ meetings: '&id, startedAt, mode, clientName, projectStream', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt', recording_chunks: '&id, sessionId, chunkIndex, status, createdAt' })
    this.version(7).stores({ meetings: '&id, startedAt, mode, clientName, projectStream', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt', recording_chunks: '&id, sessionId, chunkIndex, status, createdAt', recording_sessions: '&sessionId, updatedAt' })
    this.version(8).stores({ meetings: '&id, startedAt, mode, clientName, projectStream, *tags', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt', recording_chunks: '&id, sessionId, chunkIndex, status, createdAt', recording_sessions: '&sessionId, updatedAt' })
    this.version(9).stores({ meetings: '&id, startedAt, mode, clientName, projectStream, *tags', transcripts: '&id, meetingId', notes: '&id, meetingId', action_items: '&id, meetingId, completed, createdAt', embeddings: '&meetingId, createdAt', recording_chunks: '&id, sessionId, chunkIndex, status, createdAt', recording_sessions: '&sessionId, updatedAt' })
  }
}

export const db = new SonabriefDB()

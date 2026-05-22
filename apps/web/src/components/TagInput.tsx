import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'

const TAG_COLORS = [
  { name: 'teal',   bg: 'bg-[#1A4D52]/10', text: 'text-[#1A4D52]',  border: 'border-[#1A4D52]/30' },
  { name: 'amber',  bg: 'bg-amber-50',      text: 'text-amber-700',   border: 'border-amber-200' },
  { name: 'rose',   bg: 'bg-rose-50',       text: 'text-rose-700',    border: 'border-rose-200' },
  { name: 'violet', bg: 'bg-violet-50',     text: 'text-violet-700',  border: 'border-violet-200' },
  { name: 'sky',    bg: 'bg-sky-50',        text: 'text-sky-700',     border: 'border-sky-200' },
]

function colorForTag(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const c = colorForTag(tag)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text} ${c.border}`}>
      {tag}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100"
          aria-label={`Rimuovi tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  )
}

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
}

export function TagInput({ value, onChange, disabled }: TagInputProps) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const allTags = useLiveQuery(async () => {
    const meetings = await db.meetings.toArray()
    const set = new Set<string>()
    meetings.forEach(m => m.tags?.forEach(t => set.add(t)))
    return [...set].sort()
  }, [])

  const suggestions = (allTags ?? []).filter(
    t => t.toLowerCase().includes(input.toLowerCase()) && !value.includes(t)
  )

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase().slice(0, 32)
    if (!clean || value.includes(clean)) return
    onChange([...value, clean])
    setInput('')
    setOpen(false)
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    }
    if (e.key === 'Escape') setOpen(false)
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest('[data-taginput]')?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div data-taginput className="relative">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
        {value.map(tag => (
          <TagPill key={tag} tag={tag} onRemove={disabled ? undefined : () => removeTag(tag)} />
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setOpen(true) }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            placeholder={value.length === 0 ? 'Aggiungi tag...' : ''}
            className="min-w-[100px] flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            maxLength={32}
          />
        )}
      </div>
      {open && (suggestions.length > 0 || input.trim()) && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-md">
          {suggestions.slice(0, 8).map(s => (
            <button
              key={s}
              onMouseDown={e => { e.preventDefault(); addTag(s) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-border"
            >
              <TagPill tag={s} />
            </button>
          ))}
          {input.trim() && !value.includes(input.trim().toLowerCase()) && (
            <button
              onMouseDown={e => { e.preventDefault(); addTag(input) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-border"
            >
              Crea tag "<span className="font-medium text-foreground">{input.trim()}</span>"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

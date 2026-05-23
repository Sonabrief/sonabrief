// @ts-ignore
import '@fontsource-variable/manrope'
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Typography from '@tiptap/extension-typography'
import { Markdown } from 'tiptap-markdown'

interface Props {
  content: string
  readonly?: boolean
  isStreaming?: boolean
}

export function SynthesisEditor({ content, readonly = false, isStreaming = false }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Typography, Markdown],
    content: '',
    editable: !readonly,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-48 leading-7 focus:outline-none',
      },
    },
  })

  useEffect(() => {
    if (!editor || isStreaming) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (content !== (editor.storage as any).markdown?.getMarkdown()) {
      const normalized = content.replace(/(\*\*[^*]+\*\*)\n([^\n])/g, '$1\n\n$2')
      editor.commands.setContent(normalized)
    }
  }, [content, editor, isStreaming])

  const wrapperClass = 'w-full rounded-xl px-6 py-5 text-sm'
  const wrapperStyle = {
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif",
    color: '#1A1A1F',
    backgroundColor: '#FAF7F0',
  }

  if (isStreaming) {
    return (
      <div className={wrapperClass} style={wrapperStyle}>
        <div className="outline-none min-h-48 leading-7 whitespace-pre-wrap">{content}</div>
      </div>
    )
  }

  return (
    <div className="relative">
      {!readonly && (
        <span
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '1rem',
            fontFamily: "'Manrope Variable', 'Manrope', sans-serif",
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            background: 'rgba(26,77,82,0.08)',
            color: '#1A4D52',
          }}
        >
          Modificabile
        </span>
      )}
      <div className={wrapperClass} style={wrapperStyle}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

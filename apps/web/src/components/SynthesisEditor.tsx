import '@fontsource-variable/manrope'
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Typography from '@tiptap/extension-typography'
import { Markdown } from 'tiptap-markdown'

interface Props {
  content: string
  readonly?: boolean
}

export function SynthesisEditor({ content, readonly = false }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Typography, Markdown],
    content,
    editable: !readonly,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-48 leading-7 focus:outline-none',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (content !== editor.storage.markdown.getMarkdown()) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  return (
    <div
      className="w-full rounded-xl px-6 py-5 text-sm"
      style={{
        fontFamily: "'Manrope Variable', 'Manrope', sans-serif",
        color: '#1A1A1F',
        backgroundColor: '#FAF7F0',
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}

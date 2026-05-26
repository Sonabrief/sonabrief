import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import type { WhisperSegment } from '../components/TranscriptViewer'
import { segmentsToText } from '../components/TranscriptViewer'

export interface ExportData {
  title: string
  date: string
  duration: string
  lang: string
  content: string // Markdown plain text
  segments?: WhisperSegment[]
  showTimestamps?: boolean
  isTranscript?: boolean
}

interface Section {
  heading: string
  body: string
}

function isHeadingLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('#') || /^\*\*[^*]+\*\*[:\s]*$/.test(t)
}

function cleanHeadingLine(line: string): string {
  return line.trim()
    .replace(/^#+\s*/, '')
    .replace(/^\*\*([^*]+)\*\*[:\s]*$/, '$1')
    .trim()
}

function extractSections(markdown: string): Section[] {
  const lines = markdown.split('\n')
  const sections: Section[] = []
  let heading = ''
  let body: string[] = []

  function flush() {
    const bodyStr = body.join('\n').trim()
    if (heading || bodyStr) sections.push({ heading, body: bodyStr })
  }

  for (const line of lines) {
    if (isHeadingLine(line) && line.trim()) {
      flush()
      heading = cleanHeadingLine(line)
      body = []
    } else {
      body.push(line)
    }
  }
  flush()
  return sections
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .trim()
}

function resolveContent(data: ExportData): string {
  if (data.showTimestamps && data.segments && data.segments.length > 0) {
    return segmentsToText(data.segments, true)
  }
  return data.content
}

// --- MARKDOWN ---
export function exportMarkdown(data: ExportData): void {
  const header = `# ${data.title}\n\n_${data.date} · ${data.duration} · ${data.lang}_\n\n---\n\n`
  download(header + resolveContent(data), `${slugify(data.title)}.md`, 'text/markdown')
}

// --- PDF ---
export function exportPDF(data: ExportData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageWidth = 210 - margin * 2
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(data.title, margin, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(`${data.date} · ${data.duration} · ${data.lang}`, margin, y)
  y += 6
  doc.setTextColor(180)
  doc.line(margin, y, 210 - margin, y)
  y += 8
  doc.setTextColor(0)

  if (data.isTranscript) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setLineHeightFactor(1.5)
    const content = resolveContent(data)
    const wrappedLines = doc.splitTextToSize(content, pageWidth)
    for (const line of wrappedLines) {
      if (y > 270) { doc.addPage(); y = margin }
      doc.text(line, margin, y)
      y += 7
    }
  } else {
    for (const section of extractSections(data.content)) {
      if (section.heading) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        const headingLines = doc.splitTextToSize(section.heading, pageWidth)
        if (y + headingLines.length * 6 > 270) { doc.addPage(); y = margin }
        doc.text(headingLines, margin, y)
        y += headingLines.length * 6 + 2
      }
      if (section.body) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        const bodyLines = doc.splitTextToSize(stripInlineMarkdown(section.body), pageWidth)
        for (const line of bodyLines) {
          if (y > 270) { doc.addPage(); y = margin }
          doc.text(line, margin, y)
          y += 5
        }
      }
      y += 4
    }
  }

  doc.save(`${slugify(data.title)}.pdf`)
}

// --- WORD (.docx) ---
export async function exportWord(data: ExportData): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({ text: data.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `${data.date} · ${data.duration} · ${data.lang}`, color: '888888', size: 18 })],
    }),
    new Paragraph({ text: '' }),
  ]

  if (data.isTranscript) {
    for (const line of resolveContent(data).split('\n')) {
      children.push(new Paragraph({ children: [new TextRun(line)] }))
    }
  } else {
    for (const section of extractSections(data.content)) {
      if (section.heading) {
        children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }))
      }
      if (section.body) {
        for (const line of stripInlineMarkdown(section.body).split('\n')) {
          children.push(new Paragraph({ children: [new TextRun(line)] }))
        }
      }
      children.push(new Paragraph({ text: '' }))
    }
  }

  const doc = new Document({ sections: [{ children }] })
  downloadBlob(await Packer.toBlob(doc), `${slugify(data.title)}.docx`)
}

// --- EMAIL preformattata ---
export function exportEmail(data: ExportData): void {
  let body = `Riepilogo meeting: ${data.title}\n${data.date} · ${data.duration}\n\n`
  if (data.isTranscript) {
    body += resolveContent(data)
  } else {
    for (const s of extractSections(data.content)) {
      if (s.heading) body += `${s.heading.toUpperCase()}\n`
      if (s.body) body += `${stripInlineMarkdown(s.body)}\n\n`
    }
  }
  const mailto = `mailto:?subject=${encodeURIComponent(`Note meeting: ${data.title}`)}&body=${encodeURIComponent(body)}`
  window.open(mailto, '_blank')
}

// --- COPY FORMATTED ---
export async function copyFormatted(data: ExportData): Promise<void> {
  const text = `${data.title}\n${data.date} · ${data.duration}\n\n` + resolveContent(data)
  await navigator.clipboard.writeText(text)
}

// --- utils ---
function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60)
}

function download(content: string, filename: string, mime: string): void {
  downloadBlob(new Blob([content], { type: mime }), filename)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

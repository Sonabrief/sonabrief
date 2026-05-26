const OLLAMA_ERROR = 'Ollama non raggiungibile. Assicurati che Ollama sia installato e avviato sul tuo computer.'

export async function synthesizeWithOllama(
  transcript: string,
  _language: string,
  notes: string | undefined,
  systemPrompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): Promise<void> {
  const model = localStorage.getItem('sonabrief_ollama_model') ?? 'llama3.2:3b'
  const cleanTranscript = transcript.replace(/\n+/g, ' ').trim()
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: 'Trascrizione:\n' + cleanTranscript + (notes ? '\n\nNote:\n' + notes : ''),
          },
        ],
      }),
    })

    if (!response.ok || !response.body) {
      onError(OLLAMA_ERROR)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.done === false && event.message?.content) onChunk(event.message.content)
          if (event.done === true) onDone()
        } catch (e) {
          console.debug('[ollama ndjson]', e instanceof Error ? e.message : e)
        }
      }
    }
  } catch {
    onError(OLLAMA_ERROR)
  }
}

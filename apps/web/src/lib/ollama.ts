const OLLAMA_ERROR = 'Ollama non raggiungibile. Assicurati che Ollama sia installato e avviato sul tuo computer.'

export async function synthesizeWithOllama(
  transcript: string,
  language: string,
  notes: string | undefined,
  systemPrompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): Promise<void> {
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: 'Trascrizione:\n' + transcript + (notes ? '\n\nNote:\n' + notes : ''),
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
        } catch {
          // ignora righe NDJSON malformate
        }
      }
    }
  } catch {
    onError(OLLAMA_ERROR)
  }
}

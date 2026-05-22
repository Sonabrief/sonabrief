/**
 * audio.ts
 * Utility per cattura audio microfono e tab browser.
 * Restituisce Float32Array compatibile con whisper.transcribe()
 */

export type AudioSource = 'microphone' | 'tab' | 'both'

/** Richiede accesso al microfono */
export async function getMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
}

/**
 * Richiede cattura audio della scheda browser.
 * Il browser mostrerà un popup di selezione scheda.
 */
export async function getTabStream(): Promise<MediaStream> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true,
  })
  display.getVideoTracks().forEach(t => t.stop())
  const audioTracks = display.getAudioTracks()
  if (audioTracks.length === 0) {
    throw new Error('Nessuna traccia audio dalla scheda selezionata. Assicurati di spuntare "Condividi audio" nel popup.')
  }
  return new MediaStream(audioTracks)
}

/**
 * Mescola microfono + tab in un unico stream via AudioContext.
 */
export async function getMixedStream(
  micStream: MediaStream,
  tabStream: MediaStream
): Promise<{ stream: MediaStream; context: AudioContext }> {
  const context = new AudioContext()
  const destination = context.createMediaStreamDestination()
  const micSource = context.createMediaStreamSource(micStream)
  const tabSource = context.createMediaStreamSource(tabStream)
  micSource.connect(destination)
  tabSource.connect(destination)
  return { stream: destination.stream, context }
}

/**
 * Converte un Blob audio in Float32Array compatibile con Whisper.
 * Decodifica prima con sampleRate nativo, poi resampla a 16kHz via OfflineAudioContext.
 */
export async function blobToFloat32Array(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()

  // Decodifica senza forzare sampleRate
  const audioContext = new AudioContext()
  let audioBuffer: AudioBuffer

  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  } catch {
    await audioContext.close()
    throw new Error('Impossibile decodificare l\'audio registrato.')
  }
  await audioContext.close()

  // Resampla a 16kHz manualmente (richiesto da Whisper)
  const targetSampleRate = 16000
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate
  )
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineCtx.destination)
  source.start(0)

  const resampled = await offlineCtx.startRendering()
  return resampled.getChannelData(0)
}

/**
 * Estrae l'header WebM (tutto fino al primo Cluster) dal primo chunk di MediaRecorder.
 * L'header così estratto può essere prependiato ai chunk successivi per renderli decodificabili.
 */
export async function extractWebMHeader(firstChunk: Blob): Promise<Uint8Array | null> {
  try {
    const buffer = new Uint8Array(await firstChunk.arrayBuffer())
    const CLUSTER_ID = [0x1F, 0x43, 0xB6, 0x75]

    for (let i = 0; i < buffer.length - 4; i++) {
      if (
        buffer[i] === CLUSTER_ID[0] &&
        buffer[i + 1] === CLUSTER_ID[1] &&
        buffer[i + 2] === CLUSTER_ID[2] &&
        buffer[i + 3] === CLUSTER_ID[3]
      ) {
        return buffer.slice(0, i)
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Decodifica un chunk WebM senza header prependendo l'header estratto dal primo chunk.
 */
export async function blobToFloat32ArrayChunk(
  chunk: Blob,
  header: Uint8Array | null,
  isFirstChunk: boolean,
): Promise<Float32Array> {
  if (isFirstChunk || !header) {
    return blobToFloat32Array(chunk)
  }
  const chunkBuffer = new Uint8Array(await chunk.arrayBuffer())
  const combined = new Uint8Array(header.length + chunkBuffer.length)
  combined.set(header, 0)
  combined.set(chunkBuffer, header.length)
  const reconstructed = new Blob([combined], { type: chunk.type })
  return blobToFloat32Array(reconstructed)
}

/** Ferma tutte le tracce di uno stream e libera risorse */
export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop())
}
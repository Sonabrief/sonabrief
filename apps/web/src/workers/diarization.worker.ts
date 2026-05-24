/// <reference lib="webworker" />
import { AutoProcessor, AutoModelForAudioFrameClassification } from '@huggingface/transformers';

export type DiarizationMessage =
  | { type: 'init' }
  | { type: 'process'; audio: Float32Array; sampleRate: number; numSpeakers: number | 'auto' };

export type DiarizationResult =
  | { type: 'ready' }
  | { type: 'progress'; value: number; label: string }
  | { type: 'result'; segments: SpeakerSegment[] }
  | { type: 'error'; message: string };

export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
}

const SAMPLE_RATE = 16000;
const CHUNK_DURATION = 10;
const CHUNK_STEP = 5;
const SEG_MODEL_ID = 'onnx-community/pyannote-segmentation-3.0';

let processor: any = null;
let segModel: any = null;

function post(msg: DiarizationResult) {
  (self as unknown as Worker).postMessage(msg);
}

async function loadModels() {
  post({ type: 'progress', value: 5, label: 'Caricamento modello segmentazione…' });
  processor = await AutoProcessor.from_pretrained(SEG_MODEL_ID);
  post({ type: 'progress', value: 60, label: 'Caricamento modello…' });
  segModel = await AutoModelForAudioFrameClassification.from_pretrained(SEG_MODEL_ID);
  post({ type: 'ready' });
}

function resample(audio: Float32Array, fromRate: number): Float32Array {
  if (fromRate === SAMPLE_RATE) return audio;
  const ratio = SAMPLE_RATE / fromRate;
  const out = new Float32Array(Math.floor(audio.length * ratio));
  for (let i = 0; i < out.length; i++) out[i] = audio[Math.floor(i / ratio)];
  return out;
}

async function processDiarization(
  audio: Float32Array,
  sampleRate: number,
  numSpeakers: number | 'auto'
): Promise<SpeakerSegment[]> {
  const resampled = resample(audio, sampleRate);
  const durationSec = resampled.length / SAMPLE_RATE;
  const maxSpk = numSpeakers === 'auto' ? 8 : numSpeakers;

  const chunkSamples = Math.floor(CHUNK_DURATION * SAMPLE_RATE);
  const stepSamples = Math.floor(CHUNK_STEP * SAMPLE_RATE);

  const chunkStarts: number[] = [];
  for (let s = 0; s < resampled.length; s += stepSamples) chunkStarts.push(s);

  post({ type: 'progress', value: 20, label: 'Segmentazione audio…' });

  // Raccoglie tutti i segmenti con offset temporale assoluto
  const allSegments: Array<{ start: number; end: number; localSpeaker: number; chunkIdx: number }> = [];

  for (let i = 0; i < chunkStarts.length; i++) {
    const startSample = chunkStarts[i];
    const endSample = Math.min(startSample + chunkSamples, resampled.length);
    const startSec = startSample / SAMPLE_RATE;

    const chunk = new Float32Array(chunkSamples);
    chunk.set(resampled.slice(startSample, endSample));

    const inputs = await processor(chunk, { sampling_rate: SAMPLE_RATE });
    const { logits } = await segModel(inputs);
    const localSegments: Array<{ id: number; start: number; end: number; confidence: number }> =
      processor.post_process_speaker_diarization(logits, chunkSamples)[0] ?? [];

    for (const seg of localSegments) {
      if (seg.end - seg.start < 0.3) continue;
      const segStartSec = startSec + seg.start;
      const segEndSec = startSec + seg.end;
      if (segEndSec > durationSec + 0.1) continue;
      allSegments.push({
        start: segStartSec,
        end: segEndSec,
        localSpeaker: seg.id,
        chunkIdx: i,
      });
    }

    const pct = 20 + Math.floor((i / chunkStarts.length) * 70);
    post({ type: 'progress', value: pct, label: `Analisi finestra ${i + 1}/${chunkStarts.length}…` });
  }

  if (allSegments.length === 0) return [];

  post({ type: 'progress', value: 92, label: 'Identificazione parlanti…' });

  // Strategia: costruisci una mappa globale degli speaker
  // Per ogni chunk, spk0/1/2/3 sono locali. Li riconciliamo guardando
  // i segmenti sovrapposti tra chunk adiacenti (overlap di 5s).
  // Ogni chunk ha step=5s e durata=10s → overlap 5s con chunk successivo.
  
  // Assegna ID globale iniziale = chunkIdx * 4 + localSpeaker
  // Poi merge: se due segmenti si sovrappongono temporalmente e hanno
  // localSpeaker uguali in chunk adiacenti → stesso speaker globale.

  const globalIds: number[] = allSegments.map(s => s.chunkIdx * 4 + s.localSpeaker);

  // Riconcilia speaker tra chunk adiacenti usando overlap
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const si = allSegments[i];
      const sj = allSegments[j];
      // Solo chunk adiacenti
      if (Math.abs(si.chunkIdx - sj.chunkIdx) > 1) continue;
      // Stesso speaker locale
      if (si.localSpeaker !== sj.localSpeaker) continue;
      // Overlap temporale
      const overlap = Math.min(si.end, sj.end) - Math.max(si.start, sj.start);
      if (overlap < 0.3) continue;
      // Unisci: il più alto diventa uguale al più basso
      const oldId = Math.max(globalIds[i], globalIds[j]);
      const newId = Math.min(globalIds[i], globalIds[j]);
      for (let k = 0; k < globalIds.length; k++) {
        if (globalIds[k] === oldId) globalIds[k] = newId;
      }
    }
  }

  // Rinomina in 0,1,2... e limita a maxSpk
  const uniqueIds = [...new Set(globalIds)].sort((a, b) => a - b);
  // Se troppi speaker, unisci quelli con meno segmenti
  let idMap = new Map<number, number>();
  uniqueIds.forEach((id, idx) => idMap.set(id, idx));

  // Conta segmenti per speaker
  const counts = new Map<number, number>();
  globalIds.forEach(id => counts.set(idMap.get(id)!, (counts.get(idMap.get(id)!) ?? 0) + 1));

  // Se superiamo maxSpk, elimina speaker con meno segmenti fondendoli col più vicino
  while (idMap.size > maxSpk) {
    let minCount = Infinity;
    let minMapped = -1;
    counts.forEach((count, mapped) => {
      if (count < minCount) { minCount = count; minMapped = mapped; }
    });
    // Trova mapped id più vicino per numero
    let closest = -1;
    let minDist = Infinity;
    counts.forEach((_, mapped) => {
      if (mapped === minMapped) return;
      const dist = Math.abs(mapped - minMapped);
      if (dist < minDist) { minDist = dist; closest = mapped; }
    });
    if (closest === -1) break;
    // Fondi minMapped in closest
    const newCounts = new Map<number, number>();
    counts.forEach((count, mapped) => {
      const target = mapped === minMapped ? closest : mapped;
      newCounts.set(target, (newCounts.get(target) ?? 0) + count);
    });
    counts.clear();
    newCounts.forEach((v, k) => counts.set(k, v));
    // Aggiorna globalIds
    for (let k = 0; k < globalIds.length; k++) {
      if (idMap.get(globalIds[k]) === minMapped) {
        globalIds[k] = [...idMap.entries()].find(([_, v]) => v === closest)![0];
      }
    }
    // Ricostruisci idMap
    const remaining = [...new Set(globalIds)].sort((a, b) => a - b);
    idMap = new Map();
    remaining.forEach((id, idx) => idMap.set(id, idx));
  }

  post({ type: 'progress', value: 97, label: 'Finalizzazione segmenti…' });

  // Costruisci segmenti finali
  const raw = allSegments.map((s, i) => ({
    start: s.start,
    end: s.end,
    speaker: idMap.get(globalIds[i]) ?? 0,
  }));
  raw.sort((a, b) => a.start - b.start);

  // Merge segmenti contigui dello stesso speaker
  const merged: SpeakerSegment[] = [];
  for (const seg of raw) {
    const label = `Speaker ${seg.speaker + 1}`;
    const last = merged[merged.length - 1];
    if (last && last.speaker === label && seg.start - last.end < 0.5) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ speaker: label, start: seg.start, end: seg.end });
    }
  }

  return merged;
}

self.onmessage = async (event: MessageEvent<DiarizationMessage>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await loadModels();
    } else if (msg.type === 'process') {
      const segments = await processDiarization(msg.audio, msg.sampleRate, msg.numSpeakers);
      post({ type: 'result', segments });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
// Caricato nel thread principale — inizializza sherpa-onnx con pthreads
let sdInstance = null;
let resolveReady = null;
const readyPromise = new Promise(r => { resolveReady = r; });

self.Module = {
  locateFile: (f) => `/sherpa-diarization/${f}`,
  onRuntimeInitialized: () => {
    sdInstance = createOfflineSpeakerDiarization(self.Module);
    resolveReady(sdInstance.sampleRate);
  },
  print: () => {},
  printErr: () => {},
};

# Sonabrief

> A private mind for your meetings.

Sonabrief is an open-source AI meeting assistant for professionals who handle confidential conversations — lawyers, therapists, accountants, journalists.

It records, transcribes, and summarizes your meetings. With one architectural promise: **your audio never leaves your computer.**

[**sonabrief.com**](https://sonabrief.com) · [Try the app](https://app.sonabrief.com) · [Security architecture](https://sonabrief.com/security)

---

## Why Sonabrief is different

Most meeting assistants upload your audio to their servers to transcribe it. You're trusting a privacy policy. With Sonabrief, the audio is transcribed **locally, in your browser**, using Whisper running on WebAssembly. There is no upload step to trust — there's no upload at all.

This isn't a marketing claim. It's how the code works, and you can verify it yourself.

- **Audio is processed in memory, never written to disk.** The transcription runs in an isolated Web Worker on a `Float32Array` held in RAM.
- **Transcripts are encrypted on your device** before any optional cloud sync, using XChaCha20-Poly1305 (libsodium). The encryption key is derived with Argon2id and never sent to the server.
- **The whole thing is open source**, under AGPL v3. The privacy promise lives in the code below, not in a policy document.

## Verify the privacy promise

Don't trust us — read the code:

- **Local transcription, no network** — [`apps/web/src/workers/whisper.worker.ts`](https://github.com/Sonabrief/sonabrief/blob/main/apps/web/src/workers/whisper.worker.ts): Whisper runs via `@huggingface/transformers` on WebGPU/WASM. The model is cached in-browser after first load; from then on it works offline. No endpoint receives your audio.
- **Audio stays in memory** — [`apps/web/src/lib/audio.ts`](https://github.com/Sonabrief/sonabrief/blob/main/apps/web/src/lib/audio.ts): `blobToFloat32Array()` uses `OfflineAudioContext`. No temp files, no `fetch`.
- **Client-side encryption** — [`apps/web/src/lib/crypto.ts`](https://github.com/Sonabrief/sonabrief/blob/main/apps/web/src/lib/crypto.ts): `encrypt()` uses XChaCha20-Poly1305; the key is derived with Argon2id and never serialized to the server.

There is an optional cloud transcription mode (opt-in, for users who want it). It is never the default, and it's clearly separated in the code.

## Tech stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind, shadcn/ui
- **Local-first storage** — Dexie (IndexedDB), with client-side encryption for sync
- **Transcription** — Whisper (Large-v3-turbo) via Transformers.js, running in WebAssembly
- **Backend** — Cloudflare Workers + D1 + R2 (handles sync, billing, auth — never audio)
- **Crypto** — libsodium (XChaCha20-Poly1305, Argon2id)

## Run it locally

```bash
git clone https://github.com/Sonabrief/sonabrief.git
cd sonabrief
bun install
bun run dev:web    # frontend on localhost:5173
```

## License

Sonabrief is released under the [GNU Affero General Public License v3.0](./LICENSE).

The Sonabrief name, logo, and brand visual identity are not covered by the open source license.

## Contributing

Contributions are welcome — bug reports, feature requests, documentation, and pull requests. For any significant change, please open an issue first to discuss the approach.

Sonabrief is dual-licensed (AGPL v3 + commercial). To accept external contributions while preserving this flexibility, we ask contributors to sign the [Contributor License Agreement](./CLA.md). Signing is automatic: when you open a PR, the CLA Assistant bot will ask you to confirm.

## Contact

- Website: [sonabrief.com](https://sonabrief.com)
- Email: hello@sonabrief.com
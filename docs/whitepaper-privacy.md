# Sonabrief — Privacy Architecture Whitepaper

**Technical document for professionals with confidentiality obligations**

Version 2.0 · May 2026

Classification: Public · Verifiable in the open source code

---

## Preamble

This document describes the technical privacy architecture of Sonabrief. It is written for professionals — lawyers, accountants, physicians, psychologists, regulated consultants — who need to assess whether a tool is compatible with their confidentiality obligations before adopting it.

We do not ask you to trust our statements. Every claim in this document is verifiable: in the open source code, in the browser's DevTools, in the contracts with our subprocessors. Verification instructions are included.

---

## 1. Audio is never saved as a file

### 1.1 The recording flow

When you start a recording in Sonabrief, audio is captured via the browser's Web Audio APIs (`getUserMedia` for the microphone, `getDisplayMedia` with discarded video tracks for system audio). The audio stream never reaches a server. It is never written to disk as a file.

The processing flow is as follows:

1. `MediaRecorder` captures audio chunks every 30 seconds
2. Each chunk is immediately encrypted with XChaCha20-Poly1305 (session-scoped key, see §1.2) and written to the browser's IndexedDB
3. When approximately 2 minutes of chunks accumulate, Whisper (running in a dedicated Web Worker via WebAssembly) transcribes the batch with a 30-second overlap on the previous batch to preserve quality at boundaries
4. Immediately after transcription of the batch, the corresponding audio chunks are deleted from IndexedDB
5. At the end of the meeting: IndexedDB contains zero audio records. Only the text transcription remains

Average lifespan of each audio chunk: approximately 2–3 minutes (batch duration + Whisper transcription time).

### 1.2 Encryption of temporary chunks

Temporary audio chunks in IndexedDB are encrypted with XChaCha20-Poly1305, the same algorithm used for the zero-knowledge encryption of the Synced archive.

The encryption key is **session-scoped**: it is generated at the boot of the recording session using `crypto.getRandomValues()`, used only for that session, and never persisted beyond the end of the recording. If the browser were forcibly closed during an active recording, the orphaned chunks would technically be present in IndexedDB but computationally unusable: the key that encrypted them no longer exists in memory.

### 1.3 Temporary encrypted persistence: why this architecture

The choice to use encrypted chunks in IndexedDB instead of pure streaming is not a privacy compromise — it is a technical choice necessary for quality and resilience.

**Transcription quality.** Whisper Large-v3-turbo has an internal context window of 30 seconds regardless of input size. Transcribing 2-minute batches with 30-second overlap produces measured quality less than 0.5% WER worse than monolithic transcription of the entire meeting. Frame-by-frame streaming would degrade quality significantly.

**Crash resilience.** A 60–90 minute professional meeting in a browser with dozens of tabs open is a realistic scenario. Without temporary persistence, a browser crash at 50 minutes would lose everything. With chunking, on restart the app detects orphaned chunks and offers recovery: "Recording from 21/05 14:30 (47 minutes). Press to complete transcription." Chunks are transcribed and then deleted.

**Comparison with the alternative.** The alternative would be to save a complete audio file to disk and transcribe it at the end of the meeting. This approach is simpler to implement but creates exactly the audio file our architecture promises never to create — with all the legal and security risks that entails.

### 1.4 Independent verification: DevTools

To verify that no audio persists at the end of a meeting:

1. Open Sonabrief in the browser
2. Open DevTools (F12 or Cmd+Opt+I)
3. Go to **Application → IndexedDB → sonabrief-local**
4. Start a recording
5. During the recording, observe the audio chunk object store: you will see records appear every 30 seconds and disappear progressively after each batch is transcribed
6. End the recording
7. Verify that the audio chunk object store is empty

You can also verify in the source code: the file that manages chunking and progressive deletion is in the public repository `github.com/sonabrief/sonabrief`.

---

## 2. Local transcription (Whisper)

### 2.1 The model runs on your computer

Transcription happens entirely on your device. The model active in production is **Whisper Large-v3-turbo** (`onnx-community/whisper-large-v3-turbo` via `@huggingface/transformers`, ~800 MB in ONNX format), running in the browser via WebAssembly in a dedicated Web Worker.

The model is downloaded once at first use and cached via Cache API / IndexedDB of the browser. Subsequent sessions use the model already present locally — no additional download.

On hardware with limited resources (RAM < 8 GB or fewer than 4 cores), the app automatically switches to Whisper Small (~470 MB). Detection happens via `navigator.deviceMemory` and `navigator.hardwareConcurrency`. The user can manually override the choice in /profile.

### 2.2 Transcription quality

Whisper Large-v3-turbo is the highest quality model available for local execution for professional use. Estimated WER (Word Error Rate) on professional English and Italian: 5–8%, compared to 10–12% for Whisper Small. The model handles proper nouns, professional terminology, punctuation well, and has a significantly lower hallucination rate on silences than smaller models.

The same model is active on all tiers (Free, Pro, Pro Unlimited). We do not differentiate transcription quality by tier because degrading quality on Free would damage brand perception for exactly the professionals we want to convince.

### 2.3 ONNX Runtime WASM configuration

For compatibility reasons with Chrome on Mac and other browser environments, the runtime is configured with `numThreads = 1` and `dtype: 'fp32'`. Multithreading causes `ERROR_CODE: 1` in certain ONNX Runtime + WASM scenarios. This configuration is documented in the source code.

---

## 3. Synthesis and transcription: three modes

Sonabrief offers three modes. You choose explicitly at the start of each recording. The choice determines what, if anything, leaves your device.

### 3.1 Standard mode (default — all tiers)

The text transcription produced locally by Whisper is sent to our cloud backend (Cloudflare Worker) for structured synthesis generation via Mistral Large 3, hosted in France (EU).

**What we send**: only the transcribed text. Zero audio. The user sees a preview of the text about to be sent before confirming.

**What we do not send**: audio, personal notes, client data, meeting identifiers.

**Tier routing**: Free uses Mistral Small 3.1, Pro and Pro Unlimited use Mistral Large 3. Both models are hosted on Mistral's Paris servers.

**Zero Data Retention active**: on our Mistral account, Zero Data Retention (ZDR) is enabled. Transcriptions sent for synthesis are not retained by Mistral, are not used to train models, and are not logged beyond processing time. Verifiable in the Mistral admin panel.

**No fallback to US providers**: if Mistral is unavailable, the backend returns an explicit error and the app suggests Local Only as an immediate alternative. There is no automatic fallback to non-EU providers.

### 3.2 Local Only mode (all tiers)

Both transcription and synthesis happen entirely on the user's device. The local synthesis model is managed via Ollama, installed silently by the app on first use of the mode.

The local model is differentiated by tier based on required hardware capabilities:

- **Free**: Llama 3.2 3B (~2 GB) — runs on any recent hardware
- **Pro**: Llama 3.1 8B (~5 GB) — requires ~8 GB RAM
- **Pro Unlimited**: user's choice among Llama 3.1 8B, Qwen 2.5 14B (~9 GB), Qwen 32B (~20 GB)

Nothing leaves the device. The name shown to the user in the interface is "Sonabrief Privacy Engine".

To verify that in Local Only mode no data reaches the network:

1. Open DevTools → **Network**
2. Start a recording in Local Only mode
3. Transcribe and generate the synthesis
4. Verify that no request reaches external domains during the process (the only legitimate network traffic is the Whisper model download on first use)

### 3.3 Cloud Fast mode (Pro and Pro Unlimited only)

Cloud Fast mode exists for hardware where local Whisper transcription is too slow to be practical — typically Windows machines with integrated Intel GPU, where 30 minutes of audio can take 50–60 minutes to transcribe locally.

**What happens**: audio is encrypted end-to-end on your device (XChaCha20-Poly1305 with a per-request ephemeral key) before being transmitted to Mistral Voxtral (Paris, EU) for transcription. After transcription, the text follows the Standard synthesis flow via Mistral Large 3.

**Privacy guarantees**:
- Audio is encrypted before it leaves your device
- Audio is never written to disk — neither on Sonabrief servers nor by Mistral
- Zero Data Retention is active on our Mistral account and covers Voxtral (documented in the DPA, extension confirmed)
- The Sonabrief Worker that handles the relay logs only metadata (user ID, duration in minutes, timestamp) — never audio content
- Diarization (speaker labels) is native to Voxtral; you can disable it in settings if preferred

**For professionals with the strictest confidentiality obligations**: Cloud Fast involves audio transiting to Mistral's EU servers, even if encrypted in transit and never persisted. If your obligations preclude any audio leaving your device under any circumstances, use Standard or Local Only mode. Local Only provides the maximum privacy guarantee: nothing leaves the machine.

**Availability**: Pro includes 5 hours/month. Pro Unlimited includes 20 hours/month. Additional hours can be purchased.

---

## 4. Storage: Local Only vs Synced

### 4.1 Local Only

Derived data (transcriptions, syntheses, notes, action items, semantic embeddings, tags) is stored in IndexedDB via Dexie.js. No server involved. Data lives on the device and stays there.

The backup is exportable as an encrypted file. Backup management is the user's responsibility.

### 4.2 Synced (zero-knowledge)

In Synced mode, data is encrypted client-side before being uploaded to our servers. The cryptographic model is as follows:

**Cryptographic stack**:
- Library: `libsodium-wrappers-sumo`
- Payload encryption: XChaCha20-Poly1305
- Key derivation: Argon2id with MODERATE parameters from the user's passphrase
- Blob format `.sbb`: magic `SBB1` (4 bytes) + version (1 byte) + salt (16 bytes) + nonce (24 bytes) + ciphertext

**Key management**: the encryption key is derived from the user's passphrase via Argon2id. It is never transmitted to our servers. The passphrase is stored in the device's system keychain (macOS Keychain / Windows Credential Manager / browser Credential Management API) to avoid re-entry on every access.

**Recovery**: during onboarding, 12 BIP39 recovery words are generated. The user must confirm some of them before proceeding. If both passphrase and recovery words are lost, data is not recoverable — not even by us.

**Server-side storage**: encrypted blobs are stored on Cloudflare R2 EU-West. Blob naming is `{user_id}/{meeting_id}.sbb`. We see only encrypted blobs with no decryption capability.

**Conflict resolution**: in case of version conflicts (rare, given typical single-user usage), resolution happens via timestamp with possible manual user intervention.

### 4.3 Automatic E2E backup (Pro Unlimited)

Pro Unlimited holders can enable a scheduled automatic backup. The cron runs in the app (not on a server) and performs an incremental sync toward R2. Frequency is configurable in /profile (daily by default, every 6 hours, every hour).

Data remains zero-knowledge: the cron syncs already-encrypted blobs. We never see the content.

### 4.4 Archive retention

Retention applies to derived data (transcriptions, syntheses, notes). Audio is never stored in any tier.

- **Free**: 7 days. Automatic cleanup at app boot (local) + server-side cron for R2 blobs.
- **Pro**: 12 months.
- **Pro Unlimited**: forever.

In case of downgrade, records beyond the new limit are kept for an additional 30 days with a visible notice, then deleted.

---

## 5. Authentication

### 5.1 Magic link

The default method. A single-use link valid for 15 minutes is sent to the user's email address via Resend. The link is single-use (invalidated after first use) and leaves no persistent credentials exposed.

Sessions use HttpOnly + SameSite=Strict cookies, with a 30-day sliding window and one refresh per day. IP is stored only as a SHA-256 hash.

### 5.2 Passkey (WebAuthn)

Available on all tiers as an alternative to magic link. The implementation uses `@simplewebauthn/server` (backend) and `@simplewebauthn/browser` (client).

**Architecture**: when registering a passkey, the browser generates an asymmetric key pair. The **private key** stays in the device's Secure Enclave — it never transits the network. Only the **public key** and an identifier (`credential_id`) are sent to our servers and stored in the `webauthn_credentials` table of the database.

**At authentication**: the server sends a random challenge, the device signs the challenge with the local private key, the server verifies the signature with the registered public key. No secret transits the network at any stage.

Magic link remains available as a recovery fallback.

---

## 6. Weekly email reminder (Pro+): zero-knowledge architecture

Pro and Pro Unlimited holders can enable a weekly summary of open action items. The architecture was designed to maintain the zero-knowledge model.

**Flow**:
1. The app (client-side) reads action items from local IndexedDB — already decrypted on the user's machine
2. It composes the structured HTML email entirely in memory in the browser
3. It sends the payload (already composed email) to our Worker via HTTPS
4. The Worker acts as a relay: it passes the email to Resend for delivery. It does not store the content, does not log it, does not process it

The Worker never has access to the encrypted meeting data. It receives only a ready-made email — which could be any HTML content — and delivers it. Meeting content never transits in clear text on our servers.

---

## 7. Subprocessors: technical detail

| Subprocessor | Specific function | Data transmitted | Guarantees |
|---|---|---|---|
| Cloudflare Workers | Backend API, authentication, anti-abuse, LLM routing, Cloud Fast relay | Request metadata, session token (no meeting content) | DPA, SCCs, SOC 2 Type II |
| Cloudflare D1 | Database: users, sessions, licenses, meeting metadata (ID, timestamp, tier) | Structural metadata, no content | Same as above |
| Cloudflare R2 | Zero-knowledge encrypted blob storage | `.sbb` encrypted blobs — content inaccessible to Cloudflare | Same as above |
| Mistral AI (Paris) | Cloud LLM synthesis (Standard mode, transcribed text only) + Cloud Fast transcription (audio encrypted E2E in transit, ZDR active, never persisted) | Standard: transcribed text (no audio, no client metadata). Cloud Fast: encrypted audio in transit, never stored | DPA GDPR Art. 28, ZDR active, EU servers |
| Resend | Transactional email delivery and action items reminder | Recipient email address + email body composed client-side | DPA, SCCs |
| MailerLite | Product update and broadcast email (opt-in only) | Email address and subscription status only. Never receives meeting content | DPA, SCCs, GDPR compliant, EU-based |
| Polar | Payments, subscription management, webhook events | Billing data, subscription status | PCI DSS, DPA |

### Note on the US CLOUD Act

Cloudflare, Resend, and Polar are US companies subject to the USA CLOUD Act. This means US authorities could request data stored on these services via court order.

**For Synced data on R2**: US authorities receiving the blobs would receive encrypted `.sbb` data that not even we can decrypt. Without the user's passphrase, that data is computationally unusable.

**For metadata in D1**: could be accessible (email, tier, access timestamps, list of meeting IDs). Does not contain meeting content.

**For Mistral**: headquartered in France, subject to GDPR and not the CLOUD Act. Data sent to Mistral (transcribed text in Standard; audio in Cloud Fast) is not retained thanks to Zero Data Retention.

For professionals with particularly strict confidentiality obligations, **complete Local Only mode** (local transcription + local synthesis + non-Synced archive) is the only mode that involves no subprocessor for meeting data whatsoever.

---

## 8. Independent verification checklist

For every critical claim, an independent verification method.

**Verification 1 — Audio does not reach any server**

DevTools → Network → start recording in Standard mode → filter for requests to external domains → verify that no request carries audio payload (the only legitimate upload is the transcribed text toward the synthesis endpoint, verifiable in the request body).

**Verification 2 — Temporary audio chunks are deleted**

DevTools → Application → IndexedDB → start recording → observe chunks appearing and disappearing progressively → at the end of the meeting, verify that no audio record persists in the object store.

**Verification 3 — In Local Only mode no data leaves the machine**

DevTools → Network → enable Local Only mode → record and generate synthesis → verify that no request reaches Mistral or cloud endpoints during processing. The only legitimate traffic is the initial Whisper model download.

**Verification 4 — Synced blobs are unreadable without passphrase**

DevTools → Application → IndexedDB (or inspect blobs on R2 if you have access) → verify that data is not in readable format. `.sbb` blobs begin with the magic `SBB1` followed by encrypted binary data.

**Verification 5 — Whisper does not send data over the network**

In the source code, find the Web Worker file that runs transcription. Verify it contains no calls to network endpoints during audio processing. The only legitimate network connection of the Worker is the initial model download from Hugging Face (only on first installation).

**Verification 6 — Zero-knowledge architecture of the email reminder**

In the source code, find the module that composes and sends the weekly reminder. Verify that email composition happens client-side (in the browser) and that the Worker receives only the ready email body, without access to the encrypted archive data.

**Verification 7 — Cloud Fast audio is not persisted**

DevTools → Network → enable Cloud Fast mode → start a recording → inspect the POST request to `/v1/transcribe-cloud`. Verify the request body contains encrypted binary data. Inspect the response: it contains only the encrypted transcript, not a confirmation of audio storage. The Sonabrief Worker source code confirms the relay-and-discard architecture.

The public repository is `github.com/sonabrief/sonabrief`.

---

## 9. Declared limitations

Every privacy architecture has limitations. We declare them explicitly.

**Metadata in Synced mode.** Even with zero-knowledge encryption on content, structural metadata (user email, access timestamps, blob count and size) is visible to Cloudflare and potentially accessible via US court orders. Metadata does not reveal meeting content, but reveals that meetings exist and when they occurred.

**Transcription in Standard mode.** The transcribed text is sent to Mistral AI (France, EU) for synthesis. Mistral has Zero Data Retention active, but the text still transits outside the user's machine. For those who cannot permit even this, Local Only mode is the only alternative.

**Audio in Cloud Fast mode.** In Cloud Fast mode, audio encrypted end-to-end transits toward Mistral Voxtral EU servers before being discarded. For professionals whose obligations preclude any audio leaving their device under any circumstances — even encrypted, even to EU servers with ZDR — this mode is not suitable. Standard or Local Only should be used instead.

**Mistral sub-processing.** Mistral AI uses Google Cloud Platform as infrastructure, with data centers in France (EU). Google Cloud is subject to the CLOUD Act even for EU servers. Mistral has activated Zero Data Retention which limits data retention, but the underlying infrastructure is a US company's. This is a structural limitation of the European cloud market that we actively monitor.

**Apple ITP (Safari macOS and iOS).** Safari's Intelligent Tracking Prevention can delete IndexedDB data from websites after 7 days of inactivity. This means a user who does not open Sonabrief for 7+ days on Safari risks losing local data (in Local Only mode) or having to re-sync the archive from R2 (in Synced mode with auto-restore). Active mitigations: `navigator.storage.persist()` at app boot, soft warning to Safari users to install Sonabrief as a PWA (installed PWAs are exempt from ITP eviction), auto-restore from R2 on first launch if IndexedDB is empty.

**Private browsing mode.** Some browsers in private browsing mode limit or block access to IndexedDB. Sonabrief detects this condition on load and shows a plain-language explanation: private mode is incompatible with the app's architecture, and a dedicated browser profile for Sonabrief is a privacy-equivalent but technically compatible solution.

**Retention bypass from open source code.** Sonabrief is open source and the retention cleanup code is inspectable. A technically proficient user could in theory modify the code to bypass the Free tier retention limit. This is a deliberate and accepted limitation of the open core philosophy: client-side cleanup is a product rule, not DRM. Server-side retention on R2 blobs is not bypassable by the user.

---

## 10. Frequently asked questions for professionals with confidentiality obligations

**Can I use Sonabrief for sessions with clients covered by professional secrecy?**

In complete Local Only mode (local transcription + local synthesis + non-Synced archive): no meeting data ever reaches an external server. It is compatible with strong professional secrecy obligations. We recommend verifying with your professional body for specific cases.

In Standard mode: the transcribed text reaches Mistral AI (France, EU) for synthesis. For some professional categories this may not be compatible with confidentiality obligations.

In Cloud Fast mode: encrypted audio transits toward Mistral's EU servers for transcription, then is discarded. This mode is not suitable if your obligations preclude any audio leaving your device under any circumstances.

**Can my client request that their data be deleted?**

Yes. In Local Only mode, data is on your device — you can delete it manually at any time. In Synced mode, you can delete individual meetings from the app or delete the entire account. Account deletion removes all blobs from R2 and all metadata from the database.

**What happens if Sonabrief ceases to operate?**

Data in Local Only mode stays on your device — it does not depend on Sonabrief's operational status. Data in Synced mode is encrypted with your passphrase: you can export it at any time to Markdown, PDF, or Word from the app. The code is open source and can continue to be run independently of us.

**Can authorities obtain access to my data?**

For Synced data: authorities obtaining blobs from R2 would receive encrypted data that not even we can decrypt. Without your passphrase, it is computationally unusable.

For account metadata (email, timestamps): could be subject to court orders. Does not contain meeting content.

For data in Local Only mode: it resides on your device and is not in our possession. We cannot hand over what we do not have.

**Is Cloud Fast mode GDPR-compliant for professional use?**

Cloud Fast sends encrypted audio to Mistral AI (Paris, France — EU jurisdiction). Mistral operates under GDPR, has a signed DPA, and Zero Data Retention is active (audio is not stored or used for training). For most professional use cases within the EU, this is compliant. For professions with the strictest rules on client data (e.g. psychologists, lawyers in certain jurisdictions), verify with your professional body or use Local Only mode.

---

## Contacts

For technical questions about this document or to request additional information for corporate compliance assessments:

**Email**: hello@sonabrief.com
**Repository**: github.com/sonabrief/sonabrief
**Full Privacy Policy**: sonabrief.com/privacy

---

*Version 2.0 · May 2026*

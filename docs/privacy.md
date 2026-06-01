# Privacy Policy

**Sonabrief · June 2026 · Version 2.1**

---

This Privacy Policy explains how Sonabrief handles your data. It is written in plain language, not legalese, because transparency is part of the product — not just an obligation. The technical sections are here, but they come after the one that matters: what we promise and why you can verify it.

---

## The core promise

> *"The audio of your conversation is never saved as a file. The notes and syntheses derived from it live where you decide — encrypted on our servers with zero-knowledge encryption, or only locally, or both. The choice is yours."*

The distinction matters. Audio is the most sensitive data — it contains the exact words of your clients. It is processed in real time on your computer and is never written to disk as a file: there is no audio file to steal, lose, or hand over on request. The derived data (text transcription, syntheses, manual notes) is end-to-end encrypted when synced, so that not even we can read it.

---

## 1. What we collect and why

### 1.1 Your account data

When you create an account we collect:

- **Email address**: for authentication (magic link), service communications, account recovery
- **Name** (optional, collected during onboarding): used only for UI personalization ("Hi [name]" in the dashboard, initials in the app). Never shared with third parties
- **Recording session titles** (optional): text labels you assign to sessions. They live where your other derived data lives (local or encrypted Synced)
- **Subscription tier, payment status, signup date**: necessary for service management
- **User preferences**: language, preferred synthesis mode, notification settings. Stored locally on your device and, if you use Synced mode, included in the encrypted blobs

### 1.2 Meeting session data

The data derived from your meetings is:

- Text transcriptions
- Structured syntheses (key points, decisions, follow-ups)
- Manual notes
- Action items
- Custom tags and labels
- Semantic embeddings for local search

This data never leaves your device without zero-knowledge encryption. See §3 for technical details.

### 1.3 Authentication: magic link and passkey

Sonabrief uses **magic link via email** as its default authentication method: no password to remember, no credentials to steal.

Alternatively, you can choose **passkey (WebAuthn)** authentication on all tiers. With passkeys, the private key stays on your device's Secure Enclave — we only register the associated public key (in the `webauthn_credentials` table of our database). No sensitive credentials transit or are stored on our servers. Magic link remains available as a recovery fallback.

### 1.4 Technical browsing data

We collect standard technical data for the operation of the service:

- HTTP request logs (anonymized IP, User-Agent, endpoint, response code, timestamp)
- Client-side errors (anonymized stack traces for diagnosis)
- Aggregated, non-identifiable usage data (e.g. transcription error rate, usage percentage per mode)

We do not use third-party behavioral analytics tools. There are no tracking pixels.

### 1.5 Anti-abuse signals (at signup only)

To prevent the mass creation of abusive accounts, at signup we collect:

- Browser User-Agent
- Browser timezone and language
- Screen resolution (via `window.screen`, not canvas fingerprinting)
- IP anonymized via SHA-256 hash (never stored in clear text)

This logic is entirely server-side, implemented in ~50 lines of TypeScript inspectable in the open source repository. We do not use canvas fingerprinting, audio fingerprinting, hardware identifiers, or third-party tracking services.

**Protections for paying users.** If the anti-abuse system generates a false positive on a paying account (e.g. multiple devices on the same network, corporate VPN), the account is automatically removed from the watchlist upon the first verified payment. If you experience abnormal blocks or slowdowns, write to hello@sonabrief.com — we respond within 48 hours.

---

## 2. What we never collect

- **Audio as a file** — Never, in any mode, on any server. Audio is processed in real time in memory, transcribed in progressive batches, and discarded. See §3.1 for technical details on the recording architecture
- **Content of transcriptions and syntheses in Synced mode** — The blobs are encrypted client-side before being uploaded. We only see encrypted data we cannot read
- **Canvas fingerprint, audio fingerprint, hardware identifiers**
- **Browsing data on other sites**
- **Content of email, calendar, or other OAuth services beyond the minimum required scopes** — For calendar OAuth (Google, Microsoft 365) we read only the title, time, and participants of events. We do not read email bodies, attachments, or any data not strictly necessary

---

## 3. How the privacy architecture works

### 3.1 Audio is never saved as a file

During a recording, audio is captured in memory via the browser's Web Audio APIs. To ensure resilience against browser crashes during long meetings (60–120 minutes), short audio chunks are held in the browser's encrypted local database (IndexedDB) for the few minutes needed for transcription, then automatically deleted.

In concrete terms:

- There is no `.wav`, `.mp3`, or `.webm` file on your disk
- Temporary chunks live in the browser's IndexedDB (average lifespan: about 2–3 minutes)
- Each chunk is encrypted with XChaCha20-Poly1305, with a key generated at the boot of the recording session and never persisted
- Chunks are deleted immediately after the corresponding batch is transcribed
- At the end of the meeting: zero audio records persist anywhere

You can verify this yourself: open your browser's DevTools, go to Application → IndexedDB during a recording, and watch the chunks appear and disappear progressively. At the end of the meeting, no audio remains.

### 3.2 Local transcription (Whisper)

Transcription happens entirely on your computer via Whisper, OpenAI's open source model, run in the browser via WebAssembly. Audio never reaches a server for transcription.

Model selection is **automatic by default**. The app inspects your hardware and chooses between two models:

- **Whisper Large-v3-turbo** — High quality (~800 MB, downloaded once on the first session and cached in the browser). Selected automatically only when your device reports **at least 8 GB of RAM and at least 4 CPU cores**.
- **Whisper Small** — Optimized for limited hardware (~470 MB). Selected automatically on devices below that threshold, so transcription stays responsive on slower machines.

If a device claims enough resources but then runs out of memory while loading Large, the app falls back to Small at runtime so the recording is never blocked.

Large is always available: you can **override the automatic choice in /profile** and force Large (or force Small). A manual choice takes precedence over the hardware detection. Either way, transcription always runs locally — audio never reaches a server in Standard or Local Only mode.

### 3.3 Synthesis and transcription: three modes


**Standard mode**: the text transcription produced locally by Whisper is sent to our cloud service (Mistral, Paris EU) to generate the structured synthesis. The model depends on your plan: **Free uses Mistral Small; Pro and Pro Unlimited use Mistral Large**. Audio never reaches the cloud — only the transcribed text.

**Local Only mode**: both transcription and synthesis happen entirely on your computer. Nothing leaves the machine. Maximum privacy, quality slightly lower than cloud mode.

**Cloud Fast mode (Pro and Pro Unlimited only)**: audio is encrypted end-to-end on your device before being transmitted to Mistral Voxtral (Paris, EU) for transcription. Audio is never written to disk — neither on Sonabrief servers nor on Mistral (Zero Data Retention active, documented in the DPA). After transcription, the text follows the Standard synthesis flow (Mistral Small on Free, Mistral Large on Pro and Pro Unlimited). This mode exists for hardware where local Whisper is too slow (e.g. Windows with integrated Intel GPU).

The choice is per-meeting: you can change mode before each recording.

### 3.4 Storage: Local Only vs Synced

The derived data (transcriptions, syntheses, notes) lives where you decide.

**Local Only mode**: all data stays on a single device in IndexedDB. No server involved. The backup is exportable as an encrypted file that you manage.

**Synced mode**: data is encrypted client-side with zero-knowledge encryption (XChaCha20-Poly1305, key derived via Argon2id — MODERATE parameters — from your passphrase) before being synced to our servers (Cloudflare R2). We store encrypted blobs that we are unable to read. The same model used by 1Password, ProtonMail, Signal.

**Automatic E2E backup (Pro Unlimited)**: Pro Unlimited holders can enable a scheduled automatic backup to R2. The cron runs in the app, the data stays zero-knowledge — we sync encrypted blobs without ever seeing the content.

### 3.5 The zero-knowledge trade-off

Zero-knowledge encryption means that if you lose both your passphrase and your 12 BIP39 recovery words, your data cannot be recovered. This is not a limitation — it is the concrete demonstration of the privacy promise. Not even we can open those blobs.

During onboarding we guide you to save the 12 recovery words securely, and we ask you to confirm some of them before proceeding. The passphrase is stored in your device's keychain system (macOS Keychain / Windows Credential Manager) so you don't have to re-enter it on every access.

---

## 4. Subprocessors and data transfers

Sonabrief uses the following subprocessors to deliver the service. All sensitive data (transcriptions, syntheses) that transits these services is encrypted before being sent.

| Subprocessor | Function | Location | Protection standard |
|---|---|---|---|
| Cloudflare (Workers, D1, R2) | Backend infrastructure, encrypted blob storage, CDN | USA (with EU locations — EU data on EU Workers) | DPA, SCCs, SOC 2 certification |
| Mistral AI | Cloud LLM synthesis (Standard mode, transcribed text only) + Cloud Fast transcription (audio encrypted E2E in transit, never persisted, Zero Data Retention active) | France (EU) — Paris servers | DPA, Zero Data Retention active, GDPR Art. 28 |
| Resend | Transactional email (magic link, service notifications) | USA | DPA, SCCs |
| MailerLite | Product update and broadcast email (opt-in marketing only) | EU (Lithuania) | DPA, SCCs, GDPR compliant |
| Polar | Payments and subscription management | USA | PCI DSS, DPA |

**Note on Mistral and Zero Data Retention.** Zero Data Retention (ZDR) is active on our Mistral account: transcriptions sent for synthesis are not stored by Mistral nor used to train models. This is verifiable in the Mistral admin panel and documented in the DPA contract.

**Note on Cloudflare.** Zero-knowledge encrypted blobs on R2 are stored in EU-West data centers for European users. In any case, being encrypted with a key only you hold, even unauthorized access to the storage would see only unusable data.

**Note on MailerLite.** MailerLite is used exclusively for opt-in product communications and pre-launch broadcasts. It never receives meeting content — only your email address and subscription status. You can unsubscribe at any time.

No data is transferred to third countries without adequate contractual safeguards (DPA, EU Standard Contractual Clauses).

---

## 5. Service email and optional notifications

### 5.1 Transactional email

We send email for: access magic links, payment confirmations, subscription change notifications, account security communications. These cannot be disabled because they are necessary for the operation of the service.

### 5.2 Weekly action items reminder (Pro+, opt-in)

Pro and Pro Unlimited holders can enable a weekly email reminder: every Monday morning they receive a summary of open action items, grouped by client.

**Zero-knowledge architecture maintained.** This email is generated entirely client-side: the app reads the local, already-decrypted action items, composes the structured HTML email, and sends it via our Worker → Resend as a TLS relay. The Worker never reads the meeting content — it only receives the ready email and delivers it. No meeting content transits in clear text on our servers.

The reminder is **opt-in, default OFF**. You can enable or disable it in /profile → Email notifications.

### 5.3 Product communications

Occasional email about product updates, sent via MailerLite. Separate opt-in, manageable from preferences.

---

## 6. Data retention

### Audio

Audio is never saved as a file. See §3.1.

### Transcriptions, syntheses, notes (archive)

Archive retention depends on your plan:

- **Free**: 7 days. Records older than 7 days are automatically deleted by a local cleanup (at app boot) and by a server-side cron for Synced blobs.
- **Pro**: 12 months.
- **Pro Unlimited**: forever.

In case of a plan downgrade (e.g. from Pro Unlimited to Pro), records beyond the new limit are kept for an additional 30 days with an "expiring" badge visible in the archive — enough time to reassess or export. After 30 days they are deleted.

You can export any record to Markdown, PDF, or Word from the app at any time, on any plan.

### Account data

Kept as long as your account is active. In case of account deletion, all data is deleted: first the blobs on R2, then the linked tables in the database. Deletion is permanent and compliant with GDPR Art. 17 (right to erasure).

### System logs

HTTP logs and error logs: kept for a maximum of 30 days for diagnostic purposes, then automatically deleted.

### Anti-abuse signals

The IP address hashes and anonymous fingerprints collected at signup are kept for a maximum of 90 days, then deleted.

---

## 7. Your rights (GDPR)

If you are a user resident in the European Union, you have the following rights:

- **Access** (Art. 15): you can request a copy of the personal data we hold. Note: in Synced mode we can only provide you with account metadata (email, tier, signup date, list of meeting IDs) — the meeting content is encrypted with your key, we cannot read it.
- **Rectification** (Art. 16): you can correct incorrect personal data (e.g. email).
- **Erasure** (Art. 17): you can delete your account directly from the app (/profile → Privacy and data → Delete account). Deletion is immediate and permanent.
- **Portability** (Art. 20): you can export transcriptions and syntheses to Markdown, PDF, or Word directly from the app. The export is client-side — the app decrypts your data locally and generates the file on your device. There is no server-side "Export data" button because in Synced mode we are technically unable to read the content to export.
- **Restriction and objection** (Arts. 18, 21): you can request restriction of processing or object to specific processing by writing to hello@sonabrief.com.

To exercise these rights, write to hello@sonabrief.com. We respond within 30 days.

---

## 8. Security

The main security measures implemented:

- Zero-knowledge encryption of Synced data (XChaCha20-Poly1305, Argon2id MODERATE key derivation)
- TLS transport for all network communications
- HttpOnly + SameSite=Strict session cookies
- Magic link authentication (no password) + optional WebAuthn passkey
- IP hashing via SHA-256 (the clear-text IP is never stored)
- No cryptographic keys stored server-side
- Code that handles sensitive data entirely in the open source client, inspectable

In the event of a data breach involving personal data, we will notify the competent authorities and affected users within 72 hours, as required by GDPR Art. 33.

---

## 9. Cookies

We use only strictly necessary technical cookies for the operation of the service:

- **Session cookie** (HttpOnly, SameSite=Strict): to maintain the authenticated session after login via magic link. Duration: sliding window of 30 days.

We do not use tracking cookies, advertising cookies, or behavioral analytics cookies. No GDPR cookie banner because there are no non-necessary cookies to ask consent for.

---

## 10. Changes to this policy

When we update this policy, the new version is published on this page with an update date. For significant changes that reduce the protections currently guaranteed, we notify by email at least 30 days before they take effect.

The current version is always available at sonabrief.com/privacy and in the public GitHub repository.

---

## 11. Contacts and data controller

**Data controller**: Sonabrief is an independent project operated as a sole proprietorship under the "Sonabrief" brand. The project is pre-incorporation: a formal company and VAT registration are in progress. We have chosen to keep the founder's identity off the public-facing documents for now — this is a deliberate, stated choice, not an attempt to obscure responsibility. A single, accountable natural person stands behind the project and acts as data controller.

**Controller contact point**: hello@sonabrief.com — this is a monitored channel and the reference point for any request directed to the data controller.

**Full controller identity on request**: the complete identifying details of the data controller (legal name and registered address) are available on request by writing to hello@sonabrief.com, and will be published in this policy when the VAT registration is completed.

**Email**: hello@sonabrief.com
**Website**: sonabrief.com

For any questions about this policy, to exercise your GDPR rights, or to report a privacy issue, write to hello@sonabrief.com.

---

*Version 2.1 · June 2026*
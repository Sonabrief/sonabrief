# Sonabrief

> A private mind for your meetings.

**Project Specification Document — Public**
Version 1.1 · May 2026

---

## Introduction

Sonabrief is an open-source meeting assistant for professionals, built around one non-negotiable principle: **your meeting audio is never saved to a file**. It's processed in real time on your computer, transcribed locally, and discarded. Nothing to leak, nothing to subpoena.

This document describes what Sonabrief is, who it's for, and the principles that guide its development. It's the public-facing complement to the source code: read this to understand where the project is going and why. The code itself is the proof.

This document is versioned and dated. Significant changes are tracked in the decisions log at the end. When decisions documented here change, the document is updated first; the code follows.

---

## 1. Vision

### What Sonabrief is, in one sentence

An open-source, privacy-first AI assistant for professional meetings. It listens to your conversations and turns them into structured notes, trackable follow-ups, and searchable memory — without your audio ever being saved as a file.

### Who it's for

Sonabrief is for anyone whose work is built on professional conversation: freelancers, consultants, managers, account executives, recruiters, analysts, founders, researchers. Anyone who walks out of a meeting knowing that half of what was said will have slipped away by tomorrow.

The need is particularly acute for professionals bound by strong confidentiality — lawyers, accountants, regulated consultants, therapists, doctors, investigative journalists, researchers conducting qualitative interviews — where privacy isn't a preference but a non-negotiable requirement.

The value extends further: anyone managing many clients, projects, or stakeholders in parallel finds in Sonabrief a tool that prevents the slow erosion of what was said, decided, and promised.

### Why Sonabrief exists

The knowledge worker handles dozens or hundreds of clients, each with specific conversations, decisions taken, mutual commitments. Human memory isn't a database — it loses details, forgets who promised what, walks into the next meeting unprepared. Time spent writing post-meeting follow-ups is significant: 30 to 60 minutes for every important meeting.

Current market solutions handle transcription and summarization, but fail on one axis that matters for serious professionals: they upload meeting audio to third-party cloud servers. For anyone with professional secrecy obligations, corporate NDAs, or work in regulated industries, this is unacceptable.

Sonabrief exists to fill this gap. Audio is processed in real time on the user's machine and never saved as a file — there is no audio recording to steal, lose, or be compelled to hand over. Transcription happens locally. Summarization can run in the cloud (in a transparent, controllable mode) or also locally (Local Only mode, using open-source models that run on the user's hardware). The user chooses what leaves and what doesn't.

### What Sonabrief is and isn't

Sonabrief focuses on one specific task: turning professional conversations into usable memory.

It does:

- Record meetings (in-person, phone, browser-based video calls)
- Generate automatic multilingual transcription
- Produce structured summaries (key points, decisions, follow-ups)
- Maintain a searchable personal archive
- Aggregate follow-ups across different meetings
- Export to standard formats (Word, PDF, Markdown, formatted email)

It focuses on conversational memory and derived follow-ups. It's not a full project management tool, not a collaborative documentation platform, not a corporate knowledge base, not a live in-call transcriber, not a wearable always-on recorder.

### Positioning

> *"The open-source meeting assistant for people who can't afford their clients' conversations ending up in someone else's cloud."*

This is the core claim. The shorter tagline used on landing pages and short-form communication:

> *"A private mind for your meetings."*

### Native multilingual support

Sonabrief is designed as a multilingual product from day one. UI, transcription, and summarization are available in the main European languages: Italian, English, French, Spanish, and German at launch, with progressive expansion to more languages based on user feedback and the evolution of underlying transcription models.

For European professionals, working in their native language isn't a preference — it's a requirement. Summarization prompts are curated for each language, so summaries use the appropriate terminology, stylistic conventions, and document structures. An Italian legal consultation gets summarized with the precision of Italian legal register, not translated from an English template.

At launch Sonabrief ships with seven system templates in all five languages (Generic meeting, 1-on-1, Team sync, Client meeting, Discovery, Sales call, Decision meeting). Curated vertical templates for specialized professional contexts — legal, medical, fiscal, therapy, sales discovery, qualitative research, coaching, financial advisory, IT consulting — roll out progressively in the weeks and months after launch. Vertical templates for French, Spanish, and German are released only after review by professionals native to each market: we want them written correctly in each country's terminology, not translated from a single source.

### The five values that guide the product

Five principles, ordered by importance, that guide every product decision.

**1. Privacy as architecture, not marketing.** Every product decision is tested first against the question: does this respect the promise that audio is never saved as a file and never leaves the machine? If the answer is no, the feature is rejected — regardless of how desirable it is otherwise.

**2. Professional quality before completeness.** Better a few features that genuinely work well for professionals than many mediocre ones. Summary quality must be production-grade for contexts where precision matters.

**3. Local-first by default, cloud as explicit option.** The mode that runs entirely on the user's machine is a first-class choice, not a fallback for the paranoid. It's part of the core product experience.

**4. Verifiable open source.** The code is inspectable, architectural decisions are documented, trade-offs are public. The privacy promise doesn't ask to be trusted — it asks to be verified.

**5. Discipline of scope.** Sonabrief does one thing extremely well: turn conversations into usable memory. It won't become an everything-tool. It integrates with other tools rather than replacing them.

---

## 2. The privacy promise

This section describes Sonabrief's privacy architecture in detail. It's treated carefully because it's the core of the product's value proposition, and because privacy promises should be verifiable, not just declared.

### The central promise

> *"Your meeting audio is never saved as a file. The notes and summaries derived from it live where you decide — encrypted on our servers with zero-knowledge, or only locally, or both. Your choice."*

The distinction matters. Audio is the most sensitive data: it contains the exact words of your clients. It's processed in real time on your computer and never written to a file — there is no audio recording to steal, lose, or compel us to produce. Derived data (text transcription, summaries, manual notes) is end-to-end encrypted when synchronized, so that even we cannot read it.

### Audio is never saved as a file

During recording, audio is captured in memory and processed by Whisper in short batches. To stay resilient against browser crashes during long meetings (60-120 minutes), short audio chunks are held in the browser's encrypted local database (IndexedDB) for the few minutes needed to transcribe them, then deleted automatically. The encryption key for these temporary chunks is generated at the start of the recording session and discarded at the end — even if a chunk persisted, it would be unreadable.

Concretely: there is no `.wav`, `.mp3`, or `.webm` file on disk. The temporary chunks live in the browser's database (typical lifetime: 2-3 minutes), are encrypted with XChaCha20-Poly1305, and are erased as soon as their batch is transcribed. By the end of the meeting, zero audio records persist anywhere.

You can verify this yourself. Open your browser's DevTools, go to Application → IndexedDB during a recording, and watch the chunks appear and disappear. At the end of the meeting, no audio remains. The technical detail is documented in the privacy whitepaper and verifiable in the open-source code.

### Privacy modes

Users choose how they want their meeting content processed. Two modes, each with a clear trade-off between absolute privacy and convenience. The choice is per-meeting — switch in one click before recording.

**Standard mode.** Audio is transcribed locally on the user's machine using open-source transcription models that run in-place (no audio upload). The transcription text is then sent to our cloud summarization service, which produces the structured summary. The user sees exactly what's about to be sent before sending.

Audio never reaches the cloud. Only transcription text does, transparently and controllably.

**Local Only mode.** Both transcription and summarization happen entirely on the user's machine. For summarization we use open-source models that run locally, managed by the app itself (the user doesn't have to install anything manually).

Nothing ever leaves the computer. Summary quality is slightly lower than cloud (local models are smaller), but privacy is total.

### Archive retention

Your archive lives as long as the tier you choose. This is a deliberate product decision: the free tier is a demo that works, not a permanent alternative.

- **Free**: 7 days. Transcripts and summaries older than 7 days are deleted automatically.
- **Pro**: 12 months.
- **Pro Unlimited**: forever. Long-term professional memory is the core promise of this tier.

Audio is never saved as a file regardless of tier. Retention applies only to derived data: transcripts, summaries, notes. You can export anything to Markdown, PDF, or Word from inside the app, at any time, on any tier.

### Where data lives

**Audio.** Processed in memory, transcribed in short batches, deleted as it goes. No file on disk, no copy on our servers. See "Audio is never saved as a file" above.

**Transcripts, summaries, notes.** The user chooses between two storage architectures:

- **Synced**: derived data is end-to-end encrypted (zero-knowledge) and synchronized across our servers. Available on web and installable PWA. The encryption key is derived from a passphrase only the user knows — we store encrypted blobs we cannot read. Same model used by 1Password, ProtonMail, Signal.

- **Local Only**: derived data stays on a single machine. No sync, no servers. Backup exportable as an encrypted file the user manages wherever they choose.

### The zero-knowledge trade-off

Synced means verifiable privacy with a responsibility: if the user loses their passphrase, the data is unrecoverable. We can't "reset" it because we never could read it in the first place.

To mitigate this responsibility, onboarding generates recovery codes (BIP39-style 12-word phrases) the user saves somewhere safe. The passphrase is also stored in the device's system keychain, so it isn't requested on every access. We communicate this responsibility explicitly during initial setup.

Pro Unlimited users get automatic encrypted backup: an in-app scheduler syncs the encrypted archive to our servers on a configurable cadence, with no manual intervention. The data remains zero-knowledge — we sync encrypted blobs we cannot read.

### Authentication

Magic link via email is the default authentication method — no passwords to remember, no leaked credentials. Passkey (WebAuthn) is available on all tiers as an alternative: the private key stays on your device's secure enclave, only the public key is registered with us. Magic link remains the recovery fallback.

### What we never do

- We never save your audio as a file
- We never upload your audio to our servers
- We never read the content of summaries or transcriptions in Synced mode
- We never sell data to third parties
- We never use user data to train AI models
- We never integrate third-party tracking pixels in the app
- We never show ads
- We never share data with authorities without a valid legal warrant, and even then we can only share encrypted blobs that we ourselves cannot read
- We never process your data outside the European Union when using cloud synthesis on paid tiers

### Verifiability

The trustworthiness of these promises doesn't ask to be believed. Sonabrief is open source: anyone who wants to verify can open the repository, read the code that handles audio, confirm that it's never written to disk and never uploaded. The open source section below explains how. The security page on sonabrief.com walks through self-verification step by step.

---

## 3. Technical approach

This section describes Sonabrief's technical approach at a high level, focused on what's relevant for contributors and for understanding foundational choices. Specific implementation details evolve over time and are documented in the source code.

### How Sonabrief runs

At launch, Sonabrief is a Progressive Web App: it runs in any modern browser and can be installed as an app on desktop and mobile (add to home screen / install to dock). The installed PWA gets dedicated storage, an app icon, and a window of its own, with no browser chrome.

This single form factor covers the use case for the first 12-24 months without compromise. Native desktop transcription performance is excellent in the browser thanks to WebAssembly and modern Web Audio APIs. A native desktop app (Tauri-based, with deeper OS integration) is a future direction — not a launch requirement.

Mobile use is supported for archive consultation, search, and follow-up tracking. Recording from mobile is intentionally deferred until a native mobile app is built, because mobile browser audio capture is too variable in quality to meet the professional bar Sonabrief sets for itself.

### Stack overview

Sonabrief is built on mature, widely adopted open-source technologies. The stack is chosen to be accessible to external contributors and sustainable long-term.

- **Frontend**: React with TypeScript, built with modern standard tooling (Vite)
- **PWA**: standard service worker, web app manifest, install prompts on supported browsers
- **Transcription**: Whisper, OpenAI's open-source model, executed locally in the browser via WebAssembly
- **Cloud synthesis**: commercial LLM models accessed through a proxy backend that handles authentication, quotas, and rate limits
- **Local synthesis**: open-source models executed locally through open-source runtimes bundled with the app
- **Storage**: IndexedDB in the browser for local data, plus optional zero-knowledge encrypted storage for multi-device sync
- **Authentication**: magic link via email, with passkey (WebAuthn) as an opt-in alternative on all tiers
- **Backend infrastructure**: serverless edge computing, chosen for sustainable costs at small volumes and reliability at scale

### Development philosophy

Three guiding criteria for technical choices:

**Proven technologies, not hype.** We prefer technologies with history, mature communities, extensive documentation. The product is ambitious; the stack should be predictable.

**Sustainable costs at small volumes.** Architecture that allows profitable operation from the first users, without requiring massive scale to justify infrastructure costs.

**Verifiability.** Code that handles sensitive data is always in the open-source client, inspectable. Backend parts that remain closed source are limited to administrative functions (authentication, quotas, billing).

---

## 4. Open source

### The open-core philosophy

Sonabrief is an open-source project with a commercial model that sustains it. The codebase — everything that runs on the user's machine — is open source. Some services we operate (cloud backend, professionally curated templates, managed integrations) are closed source or available as a commercial service.

This is called open-core. We chose it for three reasons: it keeps the critical code inspectable (proof of the privacy promise), it ensures economic sustainability (the commercial service funds development), and it protects against commercial appropriation without contribution (see license section).

### What's open source

- The full client application
- Whisper integration for local transcription
- The chunked recording pipeline with encrypted temporary storage
- Integration with local LLM runtimes
- The zero-knowledge encryption system
- The generic system templates
- The privacy architecture (verifiable by design)

### What's available as a commercial service

- The cloud synthesis backend (managed LLM proxy)
- Synchronized encrypted multi-device storage
- Curated professional vertical templates
- Managed cloud integrations (calendar, third-party export)
- Customer support and SLAs

### The license

Sonabrief is released under AGPL v3 (Affero General Public License version 3). This is a well-established open-source license widely understood in the community. Those who want to know the details can consult the GNU official documentation.

The choice of AGPL v3 may evolve over time if project conditions require it. A note in the repository README transparently documents this possibility.

### Not covered by the open source license

For clarity, certain elements of the Sonabrief project are protected by separate rights:

- The Sonabrief name and logo (trademarks)
- Brand visual identity (palette, typography, voice)
- Commercially curated vertical templates
- Content of sonabrief.com and commercial documentation

---

## 5. Project direction

### Current status

Sonabrief is at version 1.1 of the Project Specification Document, which describes the project's strategic and architectural direction. Product development is underway and approaching public launch. The GitHub repository is public; the product itself opens to public signup per the timelines indicated in official communications.

To be notified of the public launch, subscribe to the mailing list at sonabrief.com.

### Roadmap philosophy

Sonabrief is being built deliberately. There's no race against the market. We want the first public version to be a product that works well for the use case we've defined, not a fragmented MVP requiring months of patches.

The development plan is a compass, not a stopwatch. Specific details of timing and development priorities evolve with the project.

### Future directions

Once the product is stable and adopted, likely evolution directions include:

- Expanded language support beyond initial launch languages
- Curated vertical templates for more specialized professional contexts, in all supported languages, reviewed by native-speaking professionals in each market
- Native desktop app with deeper OS integration
- Native mobile app with proper recording support
- Tools for teams and organizations (beyond the individual use case)
- AI models specialized for specific professional domains

The exact priority of these directions will depend on real user feedback and adoption metrics. Significant updates on these decisions will be publicly communicated.

### Stay informed

- Official website: [sonabrief.com](https://sonabrief.com) (mailing list for major announcements)
- GitHub repository: [github.com/sonabrief/sonabrief](https://github.com/sonabrief/sonabrief)
- Official social accounts: [@sonabrief on X](https://x.com/sonabrief) and [Bluesky](https://bsky.app/profile/sonabrief)
- Contact: hello@sonabrief.com for direct inquiries

---

## Appendix

### Glossary

**AGPL v3** — Affero General Public License version 3. An open-source copyleft license that requires anyone modifying and distributing the code (including as a cloud service) to make their modifications available under the same license.

**Local Only** — Sonabrief mode in which both transcription and summarization happen entirely on the user's machine. Nothing ever leaves the computer.

**Open core** — Business model in which the core code is open source and certain managed services (cloud backend, curated premium content) are offered commercially. Allows sustaining open-source development without compromising the openness of the client code.

**Passkey (WebAuthn)** — A standards-based authentication method that uses public-key cryptography. The private key stays on the user's device (secure enclave); only the public key is registered with the service. Available on all Sonabrief tiers.

**PWA** — Progressive Web App. A web application that can be installed like a native app, with its own icon, window, and dedicated storage, while running on the standard web platform.

**Standard** — Sonabrief mode in which transcription happens locally and summarization is generated through a managed cloud service. Audio is never sent to the cloud, only transcription text.

**Synced** — Storage architecture in which summaries and notes are end-to-end encrypted and synchronized on Sonabrief's servers, providing multi-device access without compromising privacy. We store encrypted blobs we cannot read.

**Whisper** — Open-source voice transcription model released by OpenAI, used by Sonabrief for local transcription.

**Zero-knowledge encryption** — Encryption system in which only the user can read their own data. The encryption key is derived from a passphrase known only to the user; the server only sees encrypted blobs and has no way to decrypt them.

### Resources

- Website: [sonabrief.com](https://sonabrief.com)
- Repository: [github.com/sonabrief/sonabrief](https://github.com/sonabrief/sonabrief)
- Contact: hello@sonabrief.com
- Social: [@sonabrief](https://x.com/sonabrief) on X, [Bluesky](https://bsky.app/profile/sonabrief)

### Decisions log

Significant changes to this document are tracked here with date and context.

**May 2026 — Version 1.1.** Sharpened the audio promise: audio is never saved as a file, in any mode, on any tier. Documented the chunked recording pipeline with encrypted temporary storage in the browser (typical chunk lifetime: 2-3 minutes, encrypted with XChaCha20-Poly1305, deleted automatically post-transcription). Introduced tiered archive retention as a deliberate product decision: 7 days (Free), 12 months (Pro), forever (Pro Unlimited). Clarified that Sonabrief launches as a Progressive Web App; native desktop is a future direction. Removed the "Hybrid mode" concept (mode selection is per-meeting, not a separate mode). Added passkey (WebAuthn) as an authentication option on all tiers. Added automatic encrypted backup for Pro Unlimited. Clarified that vertical templates roll out progressively after launch, with native-speaker review for FR/ES/DE.

**May 2026 — Version 1.0.** Initial Project Specification Document. Confirmation of vision, values, and the project's privacy architecture. Opening of the waitlist at sonabrief.com.

---

*Version 1.1 · May 2026 · Public version*

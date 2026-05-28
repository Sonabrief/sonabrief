# Terms of Service

**Sonabrief · May 2026 · Version 2.0**

---

These Terms of Service govern access to and use of Sonabrief, the open source privacy-first meeting assistant developed and operated under the Sonabrief brand. By using the service you agree to these terms. If you do not agree, do not use the service.

---

## 1. What Sonabrief is

Sonabrief is an AI assistant for professional meetings. It captures the audio of your meetings by processing it in real time on your computer, without saving it as a file. It generates local transcriptions, structured syntheses, and a searchable archive of your professional conversations.

The code running on your device is open source and verifiable at github.com/sonabrief/sonabrief. Some parts of the service (cloud backend, curated templates, synchronized storage) are delivered as a commercial service.

---

## 2. Account

To use Sonabrief you must create an account with a valid email address. Authentication happens via magic link (a single-use link sent by email) or WebAuthn passkey if you have configured one.

You are responsible for the security of your account. In particular:

- Your 12 BIP39 recovery words (generated during onboarding for Synced mode) are the only way to regain access to your encrypted data if you lose your passphrase. Store them securely. We cannot recover them.
- Do not share access to your account with others. Each account is for individual use, except Enterprise plans which include explicit multi-user licenses.

---

## 3. Plans and pricing

### Free

- 3 hours of Standard cloud audio per month (rolling window based on your signup date)
- Once the monthly limit is reached, recording in Standard mode is paused with a clear message until renewal. Local mode remains available and unlimited
- **Archive retention: 7 days.** Transcriptions and syntheses older than 7 days are automatically deleted
- Access to 3 system templates
- Export in Markdown and copy to clipboard
- Cloud Fast mode: not available

### Pro — €9/month or €89/year

- 30 hours of Standard cloud audio per month
- **Cloud Fast mode: 5 hours/month included**, then €0.50/hour extra (max 25h/month hard cap)
- **Archive retention: 12 months**
- All 7 system templates in 5 native languages (IT, EN, FR, ES, DE)
- Professional vertical templates (legal, medical, tax, therapy, coaching, etc.) released progressively after the launch, following review by native-speaking professionals for each market
- Up to 5 custom templates
- Full export: Markdown, PDF, Word, formatted email
- Action items dashboard, pre-meeting briefing, semantic search, client view, calendar OAuth
- Custom tags and labels
- Weekly action items email reminder (opt-in)
- Email support (response within 48 hours)

### Pro Unlimited — €19/month or €189/year

- Unlimited synthesis — no monthly cap on Standard mode
- **Cloud Fast mode: 20 hours/month included**, then €0.30/hour extra (max 80h/month hard cap)
- **Archive retention: forever**
- Automatic E2E encrypted backup to our servers (configurable frequency)
- Multi-device license
- Unlimited custom templates
- All Pro features
- Priority support (response within 24 hours)

### Enterprise — Custom pricing

For firms, companies and teams with specific needs. Includes a commercial license as an alternative to AGPL v3, self-hosting option, SSO, admin dashboard, custom templates, dedicated support. Contact: hello@sonabrief.com.

### Archive retention

Sonabrief retains transcriptions and syntheses for a duration that depends on your plan: 7 days on Free, 12 months on Pro, forever on Pro Unlimited. Audio is never saved as a file, regardless of plan or mode.

In case of a plan downgrade, records beyond the new limit are kept for an additional 30 days with a visible notice in the archive, then permanently deleted. You can export any record to Markdown, PDF, or Word before expiry.

### Discounts and special programs

- **Annual**: approximately 17% discount compared to monthly
- **Friends & Family**: 12 months of Pro free for people personally selected by the team
- **Open source maintainer**: 12 months of Pro free for active maintainers of open source projects (verified via GitHub). Write to hello@sonabrief.com with a link to the repository

---

## 4. Transcription modes

Sonabrief offers three transcription and synthesis modes. You choose explicitly at the start of each recording.

### Standard (default — all tiers)
Transcription runs locally on your computer via Whisper Large-v3-turbo. Synthesis is sent to Mistral Large 3 (Paris, EU) as transcribed text only. Audio never leaves your computer.

### Local (all tiers)
Both transcription and synthesis run entirely on your computer via Whisper and a local Ollama model. Nothing leaves your device. Maximum privacy.

### Cloud Fast (Pro and Pro Unlimited only)
Audio is encrypted end-to-end on your device and sent to Mistral Voxtral (Paris, EU) for transcription. Synthesis follows via Mistral Large 3 as in Standard mode. Audio is never written to disk — neither by Sonabrief servers nor by Mistral (Zero Data Retention active). This mode is designed for hardware where local transcription is too slow (e.g. Windows with integrated Intel GPU).

**Cloud Fast quota.** Pro includes 5 hours per month. Pro Unlimited includes 20 hours per month. Hours beyond the included quota are billed at €0.50/h (Pro) or €0.30/h (Pro Unlimited). A hard monthly cap of 25h (Pro) and 80h (Pro Unlimited) applies. Before exceeding included hours, the app shows a confirmation prompt with the overage cost.

---

## 5. Acceptable use

You may use Sonabrief for any legitimate professional purpose. You may not:

- Use the service for illegal activities or to record conversations without the consent of participants (where required by applicable law)
- Attempt to circumvent authentication, quota, or security mechanisms of the service
- Use the service in a way that compromises availability or security for other users
- Resell or sublicense access to the service without a written agreement

**Recording responsibility.** Consent laws for recording vary by jurisdiction. You are responsible for obtaining any necessary consents before recording conversations with third parties. Sonabrief is not responsible for use of the service in violation of local consent laws.

**Anti-abuse.** The anti-abuse system may in rare cases generate false positives on legitimate users (e.g. multiple devices on the same network, corporate VPNs, upgrades from Free to Pro). Paying users are automatically removed from any watchlist upon the first verified payment. If you experience abnormal blocks or slowdowns, write to hello@sonabrief.com — we respond within 48 hours.

---

## 6. Renewals and cancellation

Subscriptions renew automatically at expiry (monthly or annual) until explicitly cancelled. You can cancel at any time from /profile → Plan and subscription. Cancellation takes effect at the end of the current paid period — we do not issue pro-rata refunds for unused periods, except as provided in the refund policy in §7.

You can delete your entire account from /profile → Privacy and data → Delete account. Account deletion is permanent: all data is deleted and cannot be recovered.

---

## 7. Refund policy

If you encounter a technical problem that prevents use of the service and we are unable to resolve it within 7 days of your report, you may request a refund proportional to the unused period. Write to hello@sonabrief.com.

For recent purchases (within 14 days of first subscription), you may request a full refund if the service does not meet the reasonable expectations described in these terms.

---

## 8. Ownership of your data

Your data — transcriptions, syntheses, notes, action items — belongs to you. We do not use it to train AI models, we do not sell it, we do not transfer it to third parties except as strictly necessary to deliver the service (see subprocessors in the Privacy Policy).

In Synced mode, your data is encrypted with a key only you hold. We are technically unable to read it. You can export it at any time in standard formats (Markdown, PDF, Word) directly from the app. The export is client-side — the app decrypts your data locally and generates the file on your device.

---

## 9. Intellectual property

The Sonabrief client code is released under the AGPL v3 license. Generic system templates are open source. Curated professional vertical templates, the Sonabrief brand (name, logo, visual identity), and the commercial backend are the property of Sonabrief and are not covered by the AGPL v3 license.

If you contribute code to the public repository, your contribution is subject to the Contributor License Agreement (CLA Harmony) available in CLA.md in the repository.

---

## 10. Limitation of liability

Sonabrief is provided "as is". We do not guarantee continuous availability of the cloud service, absolute accuracy of transcriptions, or fitness of the service for specific regulated uses (e.g. medico-legal documentation). Transcription quality depends on audio quality, device hardware, and the Whisper model in use.

In no event shall our liability for damages arising from use of the service exceed the amount paid in the 12 months preceding the event that caused the damage.

---

## 11. Changes to these terms

When we update these terms, the new version is published on this page with an update date. For significant changes that reduce the rights currently guaranteed, we notify by email at least 30 days before they take effect. Continued use of the service after the effective date constitutes acceptance of the new terms.

---

## 12. Governing law

These terms are governed by Italian law. For any dispute, the competent court is that of the location of Sonabrief's registered office, unless a mandatory provision applicable to the consumer provides otherwise.

---

## 13. Contacts

**Email**: hello@sonabrief.com
**Website**: sonabrief.com

---

*Version 2.0 · May 2026*
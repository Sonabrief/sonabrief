# Sonabrief — Whitepaper Architettura Privacy

**Documento tecnico per professionisti con obblighi di riservatezza**  
Versione 1.0 · Maggio 2026  
Classificazione: Pubblico · Verificabile nel codice open source

---

## Premessa

Questo documento descrive l'architettura tecnica di privacy di Sonabrief in modo preciso e verificabile. È destinato a professionisti vincolati da riservatezza professionale — avvocati, commercialisti, consulenti regolamentati, psicologi, medici, giornalisti investigativi — che devono valutare se Sonabrief è compatibile con i propri obblighi deontologici e normativi prima di adottarlo.

Ogni affermazione contenuta in questo documento è verificabile nel codice sorgente pubblico del progetto: [github.com/sonabrief/sonabrief](https://github.com/sonabrief/sonabrief)

Non ci fidiamo della fiducia. Chiediamo verifica.

---

## 1. Il dato più sensibile: l'audio

### 1.1 Cosa non lascia mai il computer

L'audio grezzo delle conversazioni — il dato più sensibile, quello che contiene le parole esatte dei clienti — **non viene mai trasmesso a nessun server**, né di Sonabrief né di terze parti.

Questa non è una policy: è un'impossibilità tecnica by design. Il flusso audio viene catturato dal browser o dall'applicazione desktop, elaborato interamente in locale tramite il modello Whisper (eseguito via WebAssembly nel browser, o come binario nativo nel desktop), e mai serializzato verso alcun endpoint di rete.

**Come verificarlo autonomamente:**

1. Aprire Chrome DevTools → scheda Network
2. Filtrare per "WS" e "Fetch/XHR"
3. Avviare una registrazione in Sonabrief
4. Parlare per 30-60 secondi
5. Verificare: nessuna richiesta di rete conterrà payload audio (nessun file `.wav`, `.mp3`, `.webm`, nessun blob binario di dimensione rilevante verso server esterni)

Il codice che gestisce la cattura audio è in `apps/web/src/audio.ts`. Il codice del worker Whisper è in `apps/web/src/workers/`. Entrambi sono ispezionabili nel repository pubblico.

### 1.2 Il modello di trascrizione locale

Sonabrief usa **Whisper Small** (OpenAI, rilasciato open source sotto licenza MIT), nella variante `Xenova/whisper-small` ottimizzata per WebAssembly.

- Dimensione modello: ~470 MB
- Esecuzione: interamente nel browser/desktop dell'utente
- Lingue supportate al lancio: IT, EN, FR, ES, DE
- Download: primo avvio, poi in cache locale permanente

Il modello non comunica con server OpenAI. È un file di pesi neurali che gira localmente, senza telemetria, senza callback verso l'esterno.

---

## 2. Modalità operative e dati derivati

Sonabrief distingue tra **audio** (mai trasmesso) e **dati derivati** (testo della trascrizione, riassunto, note). Per i dati derivati, l'utente sceglie tra tre modalità:

### 2.1 Modalità Standard

- Trascrizione: locale (Whisper, nessun upload audio)
- Sintesi: il testo della trascrizione viene inviato al backend Sonabrief per elaborazione tramite modello LLM
- L'utente vede il contenuto che sta per essere trasmesso prima dell'invio
- Il testo trasmesso è solo la trascrizione testuale, mai audio

**Provider LLM:** Mistral AI (EU-hosted, sede Parigi, Francia)  
**Zero Data Retention:** attivata sull'organizzazione Sonabrief (confermato da Mistral Support, maggio 2026)  
**Data Processing Addendum:** DPA Mistral in vigore (incluso nei Terms of Service Mistral, accettato all'iscrizione)

### 2.2 Modalità Local Only

- Trascrizione: locale (Whisper)
- Sintesi: locale tramite modello open source via Ollama (installato silenziosamente dall'app)
- **Nessun dato lascia il computer in nessuna fase**
- Qualità sintesi leggermente inferiore rispetto alla modalità Standard (i modelli locali sono più piccoli)

Modelli locali per tier:
- Free: Llama 3.2 3B (~2 GB)
- Pro: Llama 3.1 8B (~5 GB)
- Pro Unlimited: scelta tra Llama 3.1 8B / Qwen 2.5 14B / Qwen 32B

Il software Ollama è open source (github.com/ollama/ollama, licenza MIT). L'interfaccia locale è esposta su `localhost:11434` e non è accessibile dall'esterno.

### 2.3 Modalità Hybrid

L'utente può scegliere la modalità per ogni singola riunione. Meeting sensibili in Local Only, meeting ordinari in Standard. La scelta avviene prima di avviare la registrazione.

---

## 3. Archiviazione dei dati derivati

### 3.1 Modalità Local Only (archiviazione)

Trascrizioni, sintesi e note rimangono sul dispositivo dell'utente in un database locale:
- **Web app:** IndexedDB (Dexie), storage del browser, mai sincronizzato
- **Desktop app:** SQLite locale tramite Tauri, file sul disco dell'utente

Nessuna sincronizzazione. Nessun backup automatico verso server. I dati esistono solo sul dispositivo.

### 3.2 Modalità Synced (zero-knowledge)

L'utente può abilitare la sincronizzazione multi-device. In questo caso i dati derivati vengono cifrati lato client prima di essere trasmessi ai server Sonabrief.

**Stack crittografico:**

| Componente | Implementazione |
|---|---|
| Libreria | `libsodium-wrappers-sumo` (port WebAssembly di libsodium) |
| Cifratura payload | XChaCha20-Poly1305 (AEAD) |
| Key derivation | Argon2id (parametri: MODERATE — 64 MB memoria, 3 iterazioni) |
| Sorgente chiave | Passphrase scelta dall'utente, mai trasmessa |
| Storage chiave locale | macOS Keychain / Windows Credential Manager / browser Credential Management API |
| Recovery | 12 parole BIP39 generate all'onboarding |

**Formato blob cifrato (`.sbb`):**
```
[magic: SBB1 — 4 byte]
[version: 1 byte]
[salt Argon2id: 16 byte]
[nonce XChaCha20: 24 byte]
[ciphertext + tag Poly1305: N byte]
```

**Zero-knowledge garantito:** la chiave di decifratura è derivata dalla passphrase dell'utente tramite Argon2id. Sonabrief non conosce la passphrase, non la riceve mai, non la può recuperare. I server Sonabrief ricevono e archiviano solo blob cifrati che non sono in grado di decifrare.

Questo è lo stesso modello adottato da 1Password, ProtonMail e Signal.

**Conseguenza dichiarata:** se l'utente perde sia la passphrase sia le 12 parole di recovery, i dati sono inaccessibili in modo permanente. Nemmeno Sonabrief può recuperarli. Questa non è una limitazione — è la dimostrazione tecnica della promessa di privacy.

**Come verificare la cifratura:**

1. Abilitare la modalità Synced
2. Aprire DevTools → Network
3. Eseguire una sintesi
4. Osservare la richiesta verso `/v1/sync/upload`: il payload è un blob cifrato opaco (nessun testo leggibile)
5. Il codice di cifratura è in `packages/core/src/crypto.ts`

---

## 4. Provider e subprocessori

Elenco completo dei servizi terzi che ricevono dati nel funzionamento di Sonabrief, con il dato specifico trasmesso:

| Provider | Sede | Dato ricevuto | Scopo | Note |
|---|---|---|---|---|
| **Mistral AI** | Francia (EU) | Testo trascrizione (solo in Standard mode) | Sintesi LLM | ZDR attivata; DPA in vigore |
| **Cloudflare** | USA (Delaware) | Metadati richieste HTTP, IP hashed | CDN, Workers, D1, R2 | DPA Cloudflare; GDPR-compliant; dati EU su EU infrastructure |
| **Resend** | USA | Indirizzo email, magic link token | Email transazionali (autenticazione) | Solo dati tecnici, nessun contenuto meeting |
| **Polar** | USA (Delaware) | Nome, email, dati pagamento | Pagamenti e abbonamenti | MoR; gestisce IVA EU; PCI DSS |
| **MailerLite** | Lituania (EU) | Email, preferenze newsletter | Email marketing (opt-in esplicito) | Solo per utenti iscritti alla waitlist/newsletter |

**Non sono subprocessori** (non ricevono dati):
- OpenAI (Whisper gira in locale)
- Google (nessun tracking, nessuna Analytics)
- Meta / Facebook
- Qualsiasi CDN di terze parti per asset dell'app

### 4.1 Nota su Cloudflare e Cloud Act USA

Cloudflare è una società USA ed è soggetta al Cloud Act americano in teoria. In pratica:
- I metadati che riceve sono tecnici (IP, headers HTTP), non contenuti di conversazioni
- I blob cifrati in R2 sono illeggibili anche per Cloudflare (zero-knowledge)
- L'audio non transita mai per Cloudflare
- Il DPA Cloudflare copre gli obblighi GDPR per dati EU

### 4.2 Nota su Mistral e sub-processing USA

Da febbraio 2025, Mistral utilizza Google Cloud Platform (USA) come sotto-processore per parte dell'infrastruttura. Mitigazione implementata:
- Zero Data Retention attivata: Mistral non conserva i prompt ricevuti oltre il tempo di elaborazione
- DPA in vigore con Mistral
- La trascrizione inviata non contiene metadati identificativi del cliente finale
- In Local Only mode, Mistral non riceve nulla

---

## 5. Dati raccolti da Sonabrief

### 5.1 Dati di account

- Indirizzo email (necessario per autenticazione magic link)
- Tier di abbonamento e quota consumata
- Preferenze utente (lingua, professione indicata, modalità sintesi preferita)
- Timestamp di accesso (necessario per sessioni sliding window 30 giorni)

### 5.2 Segnali anti-abuse (trasparenza completa)

Per prevenire abuso del free tier, al momento della registrazione raccogliamo i seguenti segnali tecnici che qualsiasi browser trasmette naturalmente a qualsiasi server web:

- User-Agent (sistema operativo, browser, versione)
- Accept-Language (lingua del browser)
- Timezone
- Risoluzione schermo (via `window.screen`, non canvas fingerprinting)
- IP hashed SHA-256 (l'IP grezzo non viene mai salvato)

**Non utilizziamo:** canvas fingerprinting, audio fingerprinting, identificatori hardware, cookie di terze parti, pixel di tracking, Google Analytics, o qualsiasi libreria di behavioral analytics.

Questa scelta è documentata nel codice (`workers/api/src/antiabuse.ts`, ispezionabile nel repository) ed è dichiarata esplicitamente nella Privacy Policy pubblica.

### 5.3 Log di utilizzo (sintesi cloud)

Per ogni sintesi cloud viene registrato in D1:
- User ID (non email)
- Provider LLM (sempre "mistral")
- Minuti di audio elaborati
- Token input/output (per calcolo costi)
- Lingua, modalità, tier
- Template ID (non il contenuto)
- Codice errore se applicabile

**Non viene registrato:** il contenuto della trascrizione, il contenuto della sintesi, i nomi dei partecipanti, l'argomento del meeting.

---

## 6. Diritti dell'interessato (GDPR)

| Diritto | Implementazione |
|---|---|
| Accesso | Pagina `/profile` mostra tutti i dati di account |
| Rettifica | Preferenze modificabili in `/profile` |
| Cancellazione (art. 17) | "Cancella account" in `/profile` → elimina blob R2 + tutte le righe D1 correlate |
| Portabilità | Export meeting disponibile in Markdown, PDF, Word |
| Opposizione al trattamento | Local Only mode: nessun dato trasmesso a terze parti |

Per richieste GDPR non gestibili autonomamente: privacy@sonabrief.com

---

## 7. Verifica autonoma — checklist per il professionista

Per chi vuole verificare le promesse senza fidarsi della documentazione:

**Verifica 1 — Audio non trasmesso**
1. DevTools → Network → filtrare "All"
2. Avviare registrazione, parlare 60 secondi, terminare
3. Cercare richieste con payload > 100 KB: non devono esistere durante la registrazione
4. Codice di riferimento: `apps/web/src/audio.ts`, `apps/web/src/workers/whisper.worker.ts`

**Verifica 2 — Cifratura zero-knowledge**
1. Abilitare Synced, completare onboarding con passphrase
2. Eseguire una sintesi
3. DevTools → Network → richiesta `POST /v1/sync/upload`
4. Copiare il body → non contiene testo leggibile (è un blob esadecimale cifrato)
5. Codice di riferimento: `packages/core/src/crypto.ts`

**Verifica 3 — Local Only completo**
1. Impostare modalità "Solo locale" prima della registrazione
2. DevTools → Network → "Preserve log"
3. Eseguire registrazione + sintesi completa
4. Filtrare per richieste verso domini esterni: nessuna richiesta verso `*.mistral.ai`

**Verifica 4 — Nessun tracker**
1. DevTools → Network → filtrare per "third-party"
2. Qualsiasi pagina dell'app: nessuna richiesta verso Google Analytics, Meta Pixel, Hotjar, Mixpanel o simili

---

## 8. Conformità normativa

| Regime | Applicabilità | Stato |
|---|---|---|
| GDPR (UE 2016/679) | Sì — dati di utenti EU | Conforme; DPA con subprocessori; diritti art. 15-22 implementati |
| ePrivacy Directive | Sì — cookie banner | Cookie banner implementato; nessun cookie non essenziale senza consenso |
| Segreto professionale (avvocati, commercialisti, medici) | Compatibile con Local Only mode | In Local Only, i dati non lasciano il dispositivo dell'utente |
| NDA aziendali | Compatibile con Local Only mode | Stesso principio: nessuna trasmissione esterna |
| HIPAA (USA) | Non certificato | Non applicabile per utenti EU; Local Only è comunque più restrittivo |
| ISO 27001 | Non certificato | Certificazione non pianificata per v1; architettura compatibile |

---

## 9. Limitazioni dichiarate

Sonabrief dichiara esplicitamente le proprie limitazioni, perché un professionista ha diritto a valutare i rischi reali:

1. **Mistral sub-processing USA:** in Standard mode, il testo della trascrizione transita per infrastruttura che include GCP USA. ZDR e DPA mitigano il rischio, ma non lo annullano completamente per i professionisti con obblighi assoluti. Soluzione: usare Local Only mode.

2. **Cloudflare Cloud Act:** teoricamente applicabile ai metadati tecnici (non ai contenuti). In pratica il rischio è marginale per dati non identificativi.

3. **Recovery passphrase:** in Synced mode, senza passphrase e 12 parole BIP39, i dati sono inaccessibili permanentemente. Il professionista è responsabile della conservazione delle credenziali di recovery.

4. **Certificazioni di settore:** Sonabrief non è certificato ISO 27001, SOC 2, o HIPAA. Per ambienti che richiedono certificazioni formali, Local Only mode è l'unica opzione raccomandata.

5. **Audit indipendente:** a maggio 2026 non è stato condotto audit di sicurezza indipendente. Pianificato per anno 2 con trazione commerciale adeguata.

---

## Appendice — Riferimenti

| Documento | URL |
|---|---|
| Codice sorgente | github.com/sonabrief/sonabrief |
| Privacy Policy | sonabrief.com/privacy |
| Terms of Service | sonabrief.com/terms |
| DPA Mistral | mistral.ai/terms#data-processing-addendum |
| libsodium | doc.libsodium.org |
| Whisper (OpenAI) | github.com/openai/whisper |
| Argon2 spec | github.com/P-H-C/phc-winner-argon2 |
| BIP39 wordlist | github.com/trezor/python-mnemonic |
| AGPL v3 | gnu.org/licenses/agpl-3.0 |
| Harmony CLA | harmonyagreements.org |

---

*Versione 1.0 · Maggio 2026*  
*Sonabrief è un progetto open source rilasciato sotto licenza AGPL v3.*  
*Per domande tecniche su questo documento: hello@sonabrief.com*

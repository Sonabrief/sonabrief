# Sonabrief — Whitepaper Architettura Privacy

**Documento tecnico per professionisti con obblighi di riservatezza**

Versione 2.0 · Maggio 2026

Classificazione: Pubblico · Verificabile nel codice open source

---

## Premessa

Questo documento descrive l'architettura tecnica di privacy di Sonabrief. È scritto per professionisti — avvocati, commercialisti, medici, psicologi, consulenti regolamentati — che devono valutare se uno strumento è compatibile con i propri obblighi di riservatezza prima di adottarlo.

Non chiediamo di fidarti delle nostre dichiarazioni. Ogni affermazione in questo documento è verificabile: nel codice open source, nei DevTools del browser, nei contratti con i subprocessor. Le istruzioni di verifica sono incluse.

---

## 1. L'audio non viene mai salvato come file

### 1.1 Il flusso di registrazione

Quando avvii una registrazione in Sonabrief, l'audio viene catturato tramite le API Web Audio del browser (`getUserMedia` per il microfono, `getDisplayMedia` con tracce video scartate per l'audio di sistema). Il flusso audio non raggiunge mai un server. Non viene mai scritto su disco come file.

Il flusso di elaborazione è il seguente:

1. `MediaRecorder` cattura chunk audio ogni 30 secondi
2. Ogni chunk viene cifrato immediatamente con XChaCha20-Poly1305 (chiave session-scoped, vedi §1.2) e scritto nell'IndexedDB del browser
3. Quando si accumulano circa 2 minuti di chunk, Whisper (in esecuzione in un Web Worker separato via WebAssembly) trascrive il batch con un overlap di 30 secondi sul batch precedente per preservare la qualità ai confini
4. Immediatamente dopo la trascrizione del batch, i chunk audio corrispondenti vengono eliminati dall'IndexedDB
5. A fine meeting: l'IndexedDB non contiene alcun record audio. Resta solo la trascrizione testuale

Vita media di ogni chunk audio: circa 2-3 minuti (durata batch + tempo di trascrizione Whisper).

### 1.2 Cifratura dei chunk temporanei

I chunk audio temporanei in IndexedDB sono cifrati con XChaCha20-Poly1305, lo stesso algoritmo usato per la crittografia zero-knowledge dell'archivio Synced.

La chiave di cifratura è **session-scoped**: viene generata al boot della sessione di registrazione usando `crypto.getRandomValues()`, usata solo per quella sessione, e mai persistita oltre la fine della registrazione. Se il browser venisse chiuso forzatamente durante una registrazione attiva, i chunk orfani sarebbero tecnicamente presenti in IndexedDB ma computazionalmente inutilizzabili: la chiave che li ha cifrati non esiste più in memoria.

### 1.3 Persistenza temporanea cifrata: perché questa architettura

La scelta di usare chunk cifrati in IndexedDB invece di processare l'audio in streaming puro non è un compromesso sulla privacy — è una scelta tecnica necessaria per la qualità e la resilienza.

**Qualità della trascrizione.** Whisper Large — Alta qualità ha una context window interna di 30 secondi indipendentemente dalla dimensione dell'input. Trascrivere batch da 2 minuti con overlap di 30 secondi produce una qualità misurata inferiore di meno dello 0.5% WER rispetto alla trascrizione monolitica dell'intero meeting. Lo streaming frame-by-frame degraderebbe la qualità in modo significativo.

**Resilienza ai crash.** Un meeting professionale di 60-90 minuti in un browser con decine di tab aperte è un contesto realistico. Senza persistenza temporanea, un crash del browser a 50 minuti farebbe perdere tutto. Con il chunking, al riavvio l'app rileva i chunk orfani e propone il recupero: "Registrazione del 21/05 14:30 (47 minuti). Premi per completare la trascrizione." I chunk vengono trascritti e poi eliminati.

**Confronto con la soluzione alternativa.** L'alternativa sarebbe salvare un file audio completo sul disco e trascriverlo a fine meeting. Questa soluzione è più semplice da implementare ma crea esattamente il file audio che la nostra architettura promette di non creare mai — con tutti i rischi legali e di sicurezza che ne derivano.

### 1.4 Verifica autonoma: DevTools

Per verificare che nessun audio persista a fine meeting:

1. Apri Sonabrief nel browser
2. Apri DevTools (F12 o Cmd+Opt+I)
3. Vai su **Application → IndexedDB → sonabrief-local**
4. Avvia una registrazione
5. Durante la registrazione, osserva l'object store dei chunk audio: vedrai i record apparire ogni 30 secondi e sparire progressivamente dopo la trascrizione di ogni batch
6. Termina la registrazione
7. Verifica che l'object store dei chunk audio sia vuoto

Puoi anche verificare nel codice sorgente: il file che gestisce il chunking e la cancellazione progressiva è nel repository pubblico `github.com/sonabrief/sonabrief`.

---

## 2. Trascrizione locale (Whisper)

### 2.1 Il modello gira sul tuo computer

La trascrizione avviene interamente sul tuo dispositivo. Il modello attivo in produzione è **Whisper Large — Alta qualità** (`onnx-community/whisper-large-v3-turbo (via @huggingface/transformers v4.2.0)`, ~800 MB in formato ONNX), eseguito nel browser via WebAssembly in un Web Worker dedicato.

Il modello viene scaricato una sola volta al primo utilizzo e cachato tramite Cache API / IndexedDB del browser. Le sessioni successive usano il modello già presente localmente — nessun download aggiuntivo.

Su hardware con risorse limitate (RAM < 8 GB o core < 4), l'app passa automaticamente a Whisper Small (~470 MB). La detection avviene tramite `navigator.deviceMemory` e `navigator.hardwareConcurrency`. L'utente può sovrascrivere manualmente la scelta in /profilo.

### 2.2 Qualità della trascrizione

Whisper Large — Alta qualità è il modello di qualità più alta disponibile in esecuzione locale per uso professionale. WER (Word Error Rate) stimato sull'italiano professionale: 5-8%, contro il 10-12% di Whisper Small. Il modello gestisce bene nomi propri, gergo professionale, punteggiatura, e ha un tasso di allucinazioni sui silenzi significativamente inferiore ai modelli più piccoli.

Lo stesso modello è attivo su tutti i tier (Free, Pro, Pro Unlimited). Non differenziamo la qualità della trascrizione per tier perché degradare la qualità sul Free danneggerebbe la percezione del prodotto per esattamente i professionisti che vogliamo convincere.

### 2.3 Configurazione ONNX Runtime WASM

Per ragioni di compatibilità con Chrome su Mac e altri ambienti browser, il runtime è configurato con `numThreads = 1` e `dtype: 'fp32'`. Il multithreading causa un `ERROR_CODE: 1` in determinati scenari ONNX Runtime + WASM. Questa configurazione è documentata nel codice sorgente.

---

## 3. Sintesi: Standard vs Local Only

### 3.1 Modalità Standard

In modalità Standard, la trascrizione testuale viene inviata al nostro backend cloud (Cloudflare Worker) per la generazione della sintesi strutturata tramite Mistral Large 3, modello ospitato in Francia (UE).

**Cosa inviamo**: solo il testo trascritto. Zero audio. L'utente vede un'anteprima del testo che sta per essere inviato prima di confermare.

**Cosa non inviamo**: audio, note personali non esplicitate, dati del cliente, identificativi del meeting.

**Routing per tier**: Free utilizza Mistral Small 3.1, Pro e Pro Unlimited utilizzano Mistral Large 3. Entrambi i modelli sono ospitati nei server Mistral di Parigi.

**Zero Data Retention attiva**: sul nostro account Mistral è attiva la Zero Data Retention (ZDR). Le trascrizioni inviate non vengono conservate da Mistral, non vengono usate per addestrare modelli, non vengono log-gate oltre il tempo di elaborazione. Verificabile nel pannello admin Mistral.

**Nessun fallback su provider USA**: in caso di indisponibilità di Mistral, il backend restituisce un errore esplicito e l'app suggerisce Local Only come alternativa immediata. Non esiste un fallback automatico su provider non-EU.

### 3.2 Modalità Local Only

In modalità Local Only, sia trascrizione che sintesi avvengono interamente sul dispositivo dell'utente. Il modello di sintesi locale è gestito tramite Ollama, installato silenziosamente dall'app al primo utilizzo della modalità.

Il modello locale è differenziato per tier in base alle capacità hardware richieste:

- **Free**: Llama 3.2 3B (~2 GB) — funziona su qualsiasi hardware recente
- **Pro**: Llama 3.1 8B (~5 GB) — richiede ~8 GB RAM
- **Pro Unlimited**: scelta utente tra Llama 3.1 8B, Qwen 2.5 14B (~9 GB), Qwen 32B (~20 GB)

Nulla lascia il dispositivo. Il nome esposto all'utente nell'interfaccia è "Sonabrief Privacy Engine".

### 3.3 Verifica autonoma: nessuna rete durante Local Only

Per verificare che in modalità Local Only nessun dato raggiunga la rete:

1. Apri DevTools → **Network**
2. Avvia una registrazione in modalità Local Only
3. Trascrivi e genera la sintesi
4. Verifica che nessuna richiesta raggiunga domini esterni durante il processo (l'unico traffico di rete lecito è il caricamento del modello Whisper al primo utilizzo)

---

## 4. Archiviazione: Local Only vs Synced

### 4.1 Local Only

I dati derivati (trascrizioni, sintesi, note, action items, embedding semantici, tag) vengono conservati in IndexedDB tramite Dexie.js. Nessun server coinvolto. I dati vivono sul dispositivo e restano lì.

Il backup è esportabile come file cifrato. La gestione del backup è responsabilità dell'utente.

### 4.2 Synced (zero-knowledge)

In modalità Synced, i dati vengono cifrati lato client prima di essere caricati sui server. Il modello crittografico è il seguente:

**Stack crittografico**:
- Libreria: `libsodium-wrappers-sumo`
- Cifratura payload: XChaCha20-Poly1305
- Derivazione chiave: Argon2id con parametri MODERATE dalla passphrase utente
- Formato blob `.sbb`: magic `SBB1` (4 byte) + version (1 byte) + salt (16 byte) + nonce (24 byte) + ciphertext

**Gestione della chiave**: la chiave di cifratura è derivata dalla passphrase dell'utente tramite Argon2id. Non viene mai trasmessa ai nostri server. La passphrase è conservata nel keychain di sistema del dispositivo (macOS Keychain / Windows Credential Manager / browser Credential Management API) per non doverla reinserire a ogni accesso.

**Recovery**: in onboarding vengono generate 12 parole di recovery BIP39. L'utente deve confermarne alcune prima di procedere. Se passphrase e recovery words vengono perse, i dati non sono recuperabili — nemmeno da noi.

**Storage server-side**: i blob cifrati sono conservati su Cloudflare R2 EU-West. Il naming dei blob è `{user_id}/{meeting_id}.sbb`. Noi vediamo solo blob cifrati senza capacità di decifratura.

**Conflict resolution**: in caso di conflitti tra versioni (raro, dato l'uso tipicamente monoutente), la risoluzione avviene tramite timestamp con eventuale intervento manuale dell'utente.

### 4.3 Backup E2E automatico (Pro Unlimited)

I titolari di Pro Unlimited possono attivare un backup automatico programmato. Il cron gira nell'app (non su un server) ed esegue una sincronizzazione incrementale verso R2. La frequenza è configurabile in /profilo (giornaliero per default, ogni 6 ore, ogni ora).

I dati restano zero-knowledge: il cron sincronizza blob già cifrati. Noi non vediamo mai il contenuto.

### 4.4 Retention dell'archivio

La retention si applica ai dati derivati (trascrizioni, sintesi, note). L'audio non è mai conservato in nessun tier.

- **Free**: 7 giorni. Cleanup automatico al boot dell'app (locale) + cron server-side per blob R2.
- **Pro**: 12 mesi.
- **Pro Unlimited**: per sempre.

In caso di downgrade, i record oltre il nuovo limite vengono mantenuti 30 giorni aggiuntivi con segnalazione visibile, poi eliminati.

---

## 5. Autenticazione

### 5.1 Magic link

Il metodo predefinito. Un link a uso singolo con validità 15 minuti viene inviato all'indirizzo email dell'utente tramite Resend. Il link è monouso (viene invalidato dopo il primo utilizzo) e non lascia credenziali persistenti esposte.

Le sessioni usano cookie HttpOnly + SameSite=Strict, con sliding window di 30 giorni e un solo refresh al giorno. L'IP è conservato solo come hash SHA-256.

### 5.2 Passkey (WebAuthn)

Disponibile su tutti i tier come alternativa al magic link. L'implementazione usa `@simplewebauthn/server` (backend) e `@simplewebauthn/browser` (client).

**Architettura**: al momento della registrazione di una passkey, il browser genera una coppia di chiavi asimmetrica. La **chiave privata** resta nel Secure Enclave del dispositivo — non transita mai in rete. Solo la **chiave pubblica** e un identificatore (`credential_id`) vengono inviati ai nostri server e conservati nella tabella `webauthn_credentials` del database.

**All'autenticazione**: il server invia una challenge casuale, il dispositivo firma la challenge con la chiave privata locale, il server verifica la firma con la chiave pubblica registrata. Nessun segreto transita in rete in nessuna fase.

Il magic link resta disponibile come fallback per il recupero account.

---

## 6. Reminder email settimanale (Pro+): architettura zero-knowledge

I titolari di Pro e Pro Unlimited possono attivare un reminder settimanale degli action items aperti. L'architettura è stata progettata per mantenere il modello zero-knowledge.

**Flusso**:
1. L'app (lato client) legge gli action items dall'IndexedDB locale — già decifrati sulla macchina dell'utente
2. Compone l'email HTML strutturata interamente in memoria nel browser
3. Invia il payload (email già composta) al nostro Worker tramite una richiesta HTTPS
4. Il Worker fa da relay: passa l'email a Resend per la consegna. Non conserva il contenuto, non lo logga, non lo processa

Il Worker non ha mai accesso ai dati cifrati dei meeting. Riceve solo un'email già pronta — che potrebbe essere qualsiasi contenuto HTML — e la consegna. Il contenuto dei meeting non transita mai in chiaro sui nostri server.

---

## 7. Subprocessor: dettaglio tecnico

| Subprocessor | Funzione specifica | Dati trasmessi | Garanzie |
|---|---|---|---|
| Cloudflare Workers | Backend API, autenticazione, anti-abuse, routing LLM | Metadati richiesta, token sessione (non contenuto meeting) | DPA, SCCs, SOC 2 Type II |
| Cloudflare D1 | Database: utenti, sessioni, licenze, metadati meeting (ID, timestamp, tier) | Metadati strutturali, nessun contenuto | Come sopra |
| Cloudflare R2 | Storage blob cifrati zero-knowledge | Blob `.sbb` cifrati — contenuto inaccessibile a Cloudflare | Come sopra |
| Mistral AI (Parigi) | Sintesi LLM cloud (solo modalità Standard) | Testo trascritto (no audio, no metadati cliente) | DPA GDPR Art. 28, ZDR attiva, server UE |
| Resend | Delivery email transazionali e reminder action items | Indirizzo email destinatario + corpo email già composto client-side | DPA, SCCs |
| Polar | Pagamenti, gestione abbonamenti, webhook eventi | Dati fatturazione, stato abbonamento | PCI DSS, DPA |

### Nota sul Cloud Act USA

Cloudflare e Resend sono società USA soggette all'USA CLOUD Act. Questo significa che le autorità USA potrebbero richiedere dati conservati su questi servizi tramite ordine giudiziario.

**Per i dati Synced su R2**: le autorità USA riceverebbero blob cifrati `.sbb` che nemmeno noi siamo in grado di decifrare. Senza la passphrase dell'utente, quei dati sono computazionalmente inutilizzabili.

**Per i metadati in D1**: potrebbero essere accessibili (email, tier, timestamp degli accessi, lista di ID meeting). Non contengono il contenuto dei meeting.

**Per Mistral**: sede in Francia, soggetta al GDPR e non al CLOUD Act. I dati inviati a Mistral (testo trascritto) non sono conservati grazie alla Zero Data Retention.

Per professionisti con obblighi di riservatezza particolarmente stringenti, la **modalità Local Only completa** (trascrizione + sintesi sul dispositivo, archivio non Synced) è l'unica modalità che non coinvolge alcun subprocessor per i dati di meeting.

---

## 8. Checklist di verifica autonoma

Per ogni affermazione critica, un metodo di verifica indipendente.

**Verifica 1 — L'audio non raggiunge nessun server**

DevTools → Network → avvia registrazione in modalità Standard → filtra per richieste verso domini esterni → verifica che nessuna richiesta porti payload audio (i soli upload legittimi sono il testo trascritto verso l'endpoint di sintesi, verificabile nel body della richiesta).

**Verifica 2 — I chunk audio temporanei vengono eliminati**

DevTools → Application → IndexedDB → avvia registrazione → osserva i chunk apparire e sparire progressivamente → a fine meeting, verifica che nessun record audio persista nell'object store.

**Verifica 3 — In Local Only nessun dato lascia la macchina**

DevTools → Network → attiva modalità Local Only → registra e genera sintesi → verifica che nessuna richiesta raggiunga Mistral o endpoint cloud durante elaborazione. L'unico traffico lecito è il download iniziale del modello Whisper.

**Verifica 4 — I blob Synced sono illeggibili senza passphrase**

DevTools → Application → IndexedDB (o ispeziona i blob su R2 se hai accesso) → verifica che i dati non siano in formato leggibile. I blob `.sbb` iniziano con il magic `SBB1` seguito da dati binari cifrati.

**Verifica 5 — Whisper non invia dati in rete**

Nel codice sorgente, cerca il file del Web Worker che esegue la trascrizione. Verifica che non contenga chiamate a endpoint di rete durante l'elaborazione audio. L'unica connessione di rete legittima del Worker è il download iniziale del modello da Hugging Face (solo alla prima installazione).

**Verifica 6 — Architettura zero-knowledge del reminder email**

Nel codice sorgente, cerca il modulo che compone e invia il reminder settimanale. Verifica che la composizione dell'email avvenga lato client (nel browser) e che il Worker riceva solo il corpo dell'email già pronto, senza accesso ai dati cifrati dell'archivio.

Il repository pubblico è `github.com/sonabrief/sonabrief`.

---

## 9. Limitazioni dichiarate

Ogni architettura di privacy ha limitazioni. Le dichiariamo esplicitamente.

**Metadati in modalità Synced.** Anche con crittografia zero-knowledge sul contenuto, i metadati strutturali (email utente, timestamp degli accessi, numero e dimensione dei blob) sono visibili a Cloudflare e potenzialmente accessibili tramite ordini giudiziari USA. I metadati non rivelano il contenuto dei meeting, ma rivelano che i meeting esistono e quando sono avvenuti.

**Trascrizione in modalità Standard.** Il testo trascritto viene inviato a Mistral AI (Francia, UE) per la sintesi. Mistral ha Zero Data Retention attiva, ma il testo transita comunque fuori dalla macchina dell'utente. Per chi non può permettersi nemmeno questo, la modalità Local Only è l'unica alternativa.

**Mistral sub-processing.** Mistral AI usa Google Cloud Platform come infrastruttura, con data center in Francia (UE). Google Cloud è soggetta al CLOUD Act USA anche per i server EU. Mistral ha attivato la Zero Data Retention che limita la retention dei dati, ma l'infrastruttura sottostante è di una società USA. Questa è una limitazione strutturale del mercato cloud europeo che monitoriamo attivamente.

**Apple ITP (Safari macOS e iOS).** Safari implementa Intelligent Tracking Prevention che può eliminare i dati IndexedDB di siti web dopo 7 giorni di inattività. Questo significa che un utente che non apre Sonabrief per 7+ giorni su Safari rischia di perdere i dati locali (in modalità Local Only) o di dover ri-sincronizzare l'archivio da R2 (in modalità Synced con auto-restore). Mitigazioni attive: `navigator.storage.persist()` al boot dell'app, warning soft agli utenti Safari per installare Sonabrief come PWA (le PWA installate sono esenti dall'ITP eviction), auto-restore da R2 al primo avvio se l'IndexedDB risulta vuota.

**Modalità privata del browser.** Alcuni browser in modalità di navigazione privata limitano o bloccano l'accesso a IndexedDB. Sonabrief rileva questa condizione al caricamento e mostra una spiegazione didattica: la modalità privata è incompatibile con l'architettura dell'app, e un profilo browser dedicato a Sonabrief è una soluzione privacy equivalente ma tecnicamente compatibile.

**Aggiramento della retention dal codice open source.** Sonabrief è open source e il codice del cleanup della retention è ispezionabile. Un utente tecnicamente competente potrebbe in teoria modificare il codice per aggirare il limite di retention del tier Free. Questa è una limitazione consapevole e accettata della filosofia open core: il cleanup lato client è una regola di prodotto, non un DRM. La retention lato server (blob R2) non è aggirabile dall'utente. Per il Free in modalità Local Only, l'aggiro è tecnicamente possibile ma non costituisce abuso dei nostri servizi.

---

## 10. Domande frequenti per professionisti con obblighi di riservatezza

**Posso usare Sonabrief per sessioni con clienti coperti da segreto professionale?**

In modalità Local Only completa (trascrizione locale + sintesi locale + archivio non Synced): nessun dato del meeting raggiunge mai un server esterno. È compatibile con obblighi di segreto professionale forti. Consigliamo di verificare con il proprio ordine professionale per casi specifici.

In modalità Standard: il testo trascritto raggiunge Mistral AI (Francia, UE) per la sintesi. Per alcune categorie professionali questo potrebbe non essere compatibile con gli obblighi di riservatezza.

**Il mio cliente può richiedere che i suoi dati vengano cancellati?**

Sì. In modalità Local Only, i dati sono sul tuo dispositivo — puoi cancellarli manualmente in qualsiasi momento. In modalità Synced, puoi cancellare singoli meeting dall'app oppure cancellare l'intero account. La cancellazione dell'account elimina tutti i blob da R2 e tutti i metadati dal database.

**Cosa succede se Sonabrief cessa di operare?**

I dati in modalità Local Only restano sul tuo dispositivo — non dipendono dall'operatività di Sonabrief. I dati in modalità Synced sono cifrati con la tua passphrase: puoi esportarli in qualsiasi momento in Markdown, PDF, o Word dall'app. Il codice è open source e può continuare a essere eseguito indipendentemente da noi.

**Le autorità possono ottenere l'accesso ai miei dati?**

Per i dati Synced: le autorità che ottenessero i blob da R2 riceverebbero dati cifrati che nemmeno noi possiamo decifrare. Senza la tua passphrase, sono computazionalmente inutilizzabili.

Per i metadati dell'account (email, timestamp): potrebbero essere soggetti a ordini giudiziari. Non contengono il contenuto dei meeting.

Per i dati in modalità Local Only: risiedono sul tuo dispositivo e non sono in nostro possesso. Non possiamo consegnare ciò che non abbiamo.

---

## Contatti

Per domande tecniche su questo documento o per richiedere informazioni aggiuntive per valutazioni di compliance aziendale:

**Email**: hello@sonabrief.com  
**Repository**: github.com/sonabrief/sonabrief  
**Privacy Policy completa**: sonabrief.com/privacy

---

*Versione 1.2 · Maggio 2026*  
*Versione precedente: 1.0 · Maggio 2026*

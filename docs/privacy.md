# Privacy Policy

**Sonabrief · Maggio 2026 · Versione 3.0**

---

Questa Privacy Policy spiega come Sonabrief tratta i tuoi dati. È scritta in linguaggio diretto, non in legalese, perché la trasparenza è parte del prodotto — non solo un obbligo. Le sezioni tecniche ci sono, ma vengono dopo quella importante: cosa promettiamo e perché puoi verificarlo.

---

## La promessa centrale

> *"L'audio della tua conversazione non viene mai salvato come file. Le note e le sintesi che ne derivano vivono dove decidi tu — cifrate sui nostri server con crittografia zero-knowledge, oppure solo in locale, oppure entrambe le cose. La scelta è tua."*

La distinzione conta. L'audio è il dato più sensibile — contiene le parole esatte dei tuoi clienti. Viene elaborato in tempo reale sul tuo computer e non viene mai scritto su disco come file: non esiste un file audio da rubare, perdere, o consegnare su richiesta. I dati derivati (trascrizione testuale, sintesi, note manuali) sono cifrati end-to-end quando sincronizzati, in modo che nemmeno noi possiamo leggerli.

---

## 1. Cosa raccogliamo e perché

### 1.1 Dati del tuo account

Quando crei un account raccogliamo:

- **Indirizzo email**: per autenticazione (magic link), comunicazioni di servizio, recupero account
- **Nome** (opzionale, raccolto in onboarding): usato solo per personalizzazione UI ("Ciao [nome]" nella dashboard, iniziali nell'app). Mai condiviso con terzi
- **Titoli delle sessioni di registrazione** (opzionale): etichette testuali che tu assegni alle sessioni. Vivono dove vivi gli altri dati derivati (locale o Synced cifrato)
- **Tier di abbonamento, stato pagamento, data di signup**: necessari per la gestione del servizio
- **Preferenze utente**: lingua, modalità di sintesi preferita, impostazioni di notifica. Conservate in locale sul tuo dispositivo e, se usi la modalità Synced, incluse nei blob cifrati

### 1.2 Dati delle sessioni di meeting

I dati derivati dai tuoi meeting sono:

- Trascrizioni testuali
- Sintesi strutturate (punti chiave, decisioni, follow-up)
- Note manuali
- Action items
- Tag e etichette personalizzate
- Embeddings semantici per la ricerca locale

Questi dati non escono mai dal tuo dispositivo senza crittografia zero-knowledge. Vedi §3 per i dettagli tecnici.

### 1.3 Autenticazione: magic link e passkey

Sonabrief usa **magic link via email** come metodo di autenticazione predefinito: nessuna password da ricordare, nessuna credenziale da rubare.

In alternativa, puoi scegliere l'autenticazione con **passkey (WebAuthn)** su tutti i tier. Con le passkey, la chiave privata rimane sul Secure Enclave del tuo dispositivo — noi registriamo solo la chiave pubblica associata (nella tabella `webauthn_credentials` del nostro database). Nessuna credenziale sensibile transita o viene conservata sui nostri server. Il magic link resta disponibile come fallback per il recupero.

### 1.4 Dati tecnici di navigazione

Raccogliamo dati tecnici standard per il funzionamento del servizio:

- Log delle richieste HTTP (IP anonimizzato, User-Agent, endpoint, codice di risposta, timestamp)
- Errori lato client (stack trace anonimizzati per diagnosi)
- Dati di utilizzo aggregati e non identificabili (es. tasso di errore della trascrizione, percentuale di utilizzo per modalità)

Non usiamo strumenti di analytics comportamentale di terze parti. Non esistono pixel di tracking.

### 1.5 Segnali anti-abuse (solo al signup)

Per prevenire la creazione massiva di account abusivi, al signup raccogliamo:

- User-Agent del browser
- Timezone e lingua del browser
- Risoluzione schermo (tramite `window.screen`, non canvas fingerprinting)
- IP anonimizzato tramite hash SHA-256 (mai conservato in chiaro)

Questa logica è interamente lato server, implementata in ~50 righe di TypeScript ispezionabili nel repository open source. Non usiamo canvas fingerprinting, audio fingerprinting, identificatori hardware, o servizi di tracking di terze parti.

**Tutele per gli utenti paganti.** Se il sistema anti-abuse genera un falso positivo su un account pagante (es. più dispositivi sulla stessa rete, VPN aziendale), l'account viene automaticamente rimosso dalla lista di controllo al momento del primo pagamento verificato. Se riscontri blocchi o rallentamenti anomali, scrivi a hello@sonabrief.com — rispondiamo entro 48 ore.

---

## 2. Cosa NON raccogliamo mai

- **Audio come file** — Mai, in nessuna modalità, su nessun server. L'audio viene elaborato in tempo reale in memoria, trascritto in batch progressivi, e scartato. Vedi §3.1 per i dettagli tecnici sull'architettura di registrazione
- **Contenuto di trascrizioni e sintesi in modalità Synced** — I blob sono cifrati lato client prima di essere caricati. Vediamo solo dati cifrati che non possiamo leggere
- **Canvas fingerprint, audio fingerprint, identificatori hardware**
- **Dati di navigazione su altri siti**
- **Contenuto di email, calendario o altri servizi OAuth oltre agli scope minimi richiesti** — Per il calendario OAuth (Google, Microsoft 365) leggiamo solo titolo, orario e partecipanti degli eventi. Non leggiamo corpi delle email, allegati, o qualsiasi dato non strettamente necessario

---

## 3. Come funziona l'architettura di privacy

### 3.1 L'audio non viene mai salvato come file

Durante una registrazione, l'audio viene catturato in memoria tramite le API Web Audio del browser. Per garantire resilienza ai crash del browser durante meeting lunghi (60-120 minuti), brevi chunk audio vengono tenuti nel database locale cifrato del browser (IndexedDB) per i pochi minuti necessari alla trascrizione, poi eliminati automaticamente.

In concreto:

- Non esiste nessun file `.wav`, `.mp3`, o `.webm` sul tuo disco
- I chunk temporanei vivono nell'IndexedDB del browser (vita media: circa 2-3 minuti)
- Ogni chunk è cifrato con XChaCha20-Poly1305, con una chiave generata al boot della sessione di registrazione e mai persistita
- I chunk vengono eliminati immediatamente dopo la trascrizione del batch corrispondente
- A fine meeting: zero record audio persistono ovunque

Puoi verificarlo tu stesso: apri i DevTools del browser, vai su Application → IndexedDB durante una registrazione, e osserva i chunk apparire e sparire progressivamente. A fine meeting, nessun audio rimane.

### 3.2 Trascrizione locale (Whisper)

La trascrizione avviene interamente sul tuo computer tramite Whisper, il modello open source di OpenAI, eseguito nel browser via WebAssembly. L'audio non raggiunge mai un server per la trascrizione.

Il modello attivo è Whisper Large-v3-turbo (~800 MB, scaricato una volta sola alla prima sessione e cachato nel browser). Su hardware con risorse limitate, l'app passa automaticamente a Whisper Small (~470 MB). Puoi gestire la preferenza in /impostazioni.

### 3.3 Sintesi: Standard vs Local Only

In **modalità Standard**, la trascrizione testuale viene inviata al nostro servizio cloud per la generazione della sintesi strutturata. L'audio non raggiunge mai il cloud — solo il testo trascritto, in modo trasparente e controllabile (vedi l'anteprima prima dell'invio).

In **modalità Local Only**, sia trascrizione che sintesi avvengono interamente sul tuo computer. Nulla lascia la macchina. La qualità della sintesi è leggermente inferiore rispetto alla modalità cloud (i modelli locali sono più piccoli), ma la privacy è totale.

La scelta è per-meeting: puoi cambiare modalità prima di ogni registrazione.

### 3.4 Archiviazione: Local Only vs Synced

I dati derivati (trascrizioni, sintesi, note) vivono dove decidi tu.

**Modalità Local Only**: tutti i dati rimangono su un singolo dispositivo in IndexedDB. Nessun server coinvolto. Il backup è esportabile come file cifrato che gestisci tu.

**Modalità Synced**: i dati vengono cifrati lato client con crittografia zero-knowledge (XChaCha20-Poly1305, chiave derivata da Argon2id dalla tua passphrase) prima di essere sincronizzati sui nostri server (Cloudflare R2). Noi conserviamo blob cifrati che non siamo in grado di leggere. Lo stesso modello usato da 1Password, ProtonMail, Signal.

**Backup E2E automatico (Pro Unlimited)**: i titolari di Pro Unlimited possono attivare un backup automatico programmato verso R2. Il cron gira nell'app, i dati restano zero-knowledge — noi sincronizziamo blob cifrati senza mai vedere il contenuto.

### 3.5 Il trade-off zero-knowledge

La crittografia zero-knowledge significa che se perdi sia la passphrase che le tue 12 parole di recovery BIP39, i tuoi dati non possono essere recuperati. Non è un limite — è la dimostrazione concreta della promessa di privacy. Nemmeno noi possiamo aprire quei blob.

In onboarding ti guidiamo a salvare le 12 parole di recovery in modo sicuro, e ti chiediamo di confermarne alcune prima di procedere. La passphrase è conservata nel sistema keychain del tuo dispositivo (macOS Keychain / Windows Credential Manager) per non doverla reinserire a ogni accesso.

---

## 4. Subprocessor e trasferimenti dati

Sonabrief usa i seguenti subprocessor per erogare il servizio. Tutti i dati sensibili (trascrizioni, sintesi) che transitano su questi servizi sono cifrati prima dell'invio.

| Subprocessor | Funzione | Sede | Standard di protezione |
|---|---|---|---|
| Cloudflare (Workers, D1, R2) | Infrastruttura backend, storage blob cifrati, CDN | USA (con sedi EU — dati EU su Workers EU) | DPA, SCCs, certificazione SOC 2 |
| Mistral AI | Sintesi LLM cloud (solo modalità Standard, solo testo trascritto) | Francia (UE) — server Parigi | DPA, Zero Data Retention attiva, GDPR Art. 28 |
| Resend | Email transazionali (magic link, notifiche di servizio) | USA | DPA, SCCs |
| Polar | Pagamenti e gestione abbonamenti | USA | PCI DSS, DPA |

**Nota su Mistral e Zero Data Retention.** La Zero Data Retention (ZDR) è attiva sul nostro account Mistral: le trascrizioni inviate per la sintesi non vengono conservate da Mistral né usate per addestrare modelli. Questo è verificabile nel pannello admin Mistral e documentato nel contratto DPA.

**Nota su Cloudflare.** I blob cifrati zero-knowledge su R2 sono conservati in data center EU-West per gli utenti europei. In ogni caso, essendo cifrati con chiave che solo tu possiedi, anche un accesso non autorizzato allo storage vedrebbe solo dati inutilizzabili.

Nessun dato viene trasferito a paesi terzi senza adeguate garanzie contrattuali (DPA, Clausole Contrattuali Standard EU).

---

## 5. Email di servizio e notifiche opzionali

### 5.1 Email transazionali

Inviamo email per: magic link di accesso, conferme di pagamento, notifiche di variazione dell'abbonamento, comunicazioni di sicurezza dell'account. Queste non sono disattivabili perché necessarie al funzionamento del servizio.

### 5.2 Reminder action items settimanale (Pro+, opt-in)

I titolari di piano Pro e Pro Unlimited possono attivare un reminder email settimanale: ogni lunedì mattina ricevono un riepilogo degli action items aperti, raggruppati per cliente.

**Architettura zero-knowledge mantenuta.** Questa email è generata interamente lato client: l'app legge gli action items locali già decifrati, compone l'email HTML strutturata, e la invia tramite il nostro Worker → Resend come relay TLS. Il Worker non legge mai il contenuto dei meeting — riceve solo l'email già pronta e la recapita. Nessun contenuto di meeting transita in chiaro sui nostri server.

Il reminder è **opt-in, default OFF**. Puoi attivarlo o disattivarlo in /profilo → Notifiche email.

### 5.3 Comunicazioni di prodotto

Occasionali email sugli aggiornamenti del prodotto. Opt-in separato, gestibile dalle preferenze.

---

## 6. Conservazione dei dati

### Audio

L'audio non viene mai salvato come file. Vedi §3.1.

### Trascrizioni, sintesi, note (archivio)

La retention dell'archivio dipende dal tuo piano:

- **Free**: 7 giorni. I record più vecchi di 7 giorni vengono eliminati automaticamente da un cleanup locale (al boot dell'app) e da un cron server-side per i blob Synced.
- **Pro**: 12 mesi.
- **Pro Unlimited**: per sempre.

In caso di downgrade di piano (es. da Pro Unlimited a Pro), i record oltre il nuovo limite vengono mantenuti per 30 giorni aggiuntivi con badge "in scadenza" visibile nell'archivio — tempo sufficiente per rivalutare o esportare. Dopo 30 giorni vengono eliminati.

Puoi esportare qualsiasi record in Markdown, PDF, o Word dall'app in qualsiasi momento, su qualsiasi piano.

### Dati account

Conservati finché il tuo account è attivo. In caso di cancellazione dell'account, tutti i dati vengono eliminati: prima i blob su R2, poi le tabelle collegate nel database. La cancellazione è permanente e conforme all'art. 17 GDPR (diritto all'oblio).

### Log di sistema

Log HTTP e log di errore: conservati per un massimo di 30 giorni a fini diagnostici, poi eliminati automaticamente.

### Segnali anti-abuse

Gli hash degli indirizzi IP e i fingerprint anonimi raccolti al signup vengono conservati per un massimo di 90 giorni, poi eliminati.

---

## 7. I tuoi diritti (GDPR)

Se sei un utente residente nell'Unione Europea, hai i seguenti diritti:

- **Accesso** (art. 15): puoi richiedere copia dei tuoi dati personali che conserviamo. Nota: in modalità Synced possiamo fornirti solo i metadati dell'account (email, tier, data signup, lista ID meeting) — il contenuto dei meeting è cifrato con la tua chiave, non possiamo leggerlo.
- **Rettifica** (art. 16): puoi correggere dati personali errati (es. email).
- **Cancellazione** (art. 17): puoi cancellare il tuo account direttamente dall'app (/profilo → Privacy e dati → Elimina account). La cancellazione è immediata e permanente.
- **Portabilità** (art. 20): puoi esportare trascrizioni e sintesi in Markdown, PDF, o Word direttamente dall'app. L'export è client-side — l'app decifra i tuoi dati localmente e genera il file sul tuo dispositivo. Non esiste un bottone "Esporta dati" server-side perché in modalità Synced non siamo tecnicamente in grado di leggere il contenuto da esportare.
- **Limitazione e opposizione** (artt. 18, 21): puoi richiedere la limitazione del trattamento o opporti a trattamenti specifici scrivendo a hello@sonabrief.com.

Per esercitare questi diritti scrivi a hello@sonabrief.com. Rispondiamo entro 30 giorni.

---

## 8. Sicurezza

Le misure di sicurezza principali implementate:

- Cifratura zero-knowledge dei dati Synced (XChaCha20-Poly1305, derivazione chiave Argon2id MODERATE)
- Trasporto TLS per tutte le comunicazioni di rete
- Cookie di sessione HttpOnly + SameSite=Strict
- Autenticazione a magic link (nessuna password) + passkey WebAuthn opzionale
- Hashing IP tramite SHA-256 (l'IP in chiaro non è mai conservato)
- Nessuna chiave crittografica conservata lato server
- Codice che gestisce dati sensibili interamente nel client open source, ispezionabile

In caso di data breach che coinvolga dati personali, notificheremo le autorità competenti e gli utenti interessati entro 72 ore, come previsto dall'art. 33 GDPR.

---

## 9. Cookie

Usiamo solo cookie tecnici strettamente necessari al funzionamento del servizio:

- **Cookie di sessione** (HttpOnly, SameSite=Strict): per mantenere la sessione autenticata dopo il login via magic link. Durata: sliding window di 30 giorni.

Non usiamo cookie di tracciamento, cookie pubblicitari, o cookie di analisi comportamentale. Nessun banner GDPR sui cookie perché non ci sono cookie non-necessari su cui chiedere consenso.

---

## 10. Modifiche a questa policy

Quando aggiorniamo questa policy, la nuova versione viene pubblicata su questa pagina con una data di aggiornamento. Per modifiche significative che riducono le protezioni attualmente garantite, avvisiamo via email almeno 30 giorni prima dell'entrata in vigore.

La versione corrente è sempre disponibile su sonabrief.com/privacy e nel repository GitHub pubblico.

---

## 11. Contatti e titolare del trattamento

**Titolare del trattamento**: Sonabrief  
**Email**: hello@sonabrief.com  
**Sito**: sonabrief.com

Per qualsiasi domanda su questa policy, per esercitare i tuoi diritti GDPR, o per segnalare un problema di privacy, scrivi a hello@sonabrief.com.

---

*Versione 3.0 · Maggio 2026*  
*Versione precedente: 2.0 · Maggio 2026*

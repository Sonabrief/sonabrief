# Privacy Policy

**Sonabrief · Maggio 2026 · Versione 2.0**

---

Questa Privacy Policy spiega come Sonabrief tratta i tuoi dati. È scritta in linguaggio diretto, non in legalese, perché la trasparenza è parte del prodotto — non solo un obbligo. Le sezioni tecniche ci sono, ma vengono dopo quella in linguaggio umano.

Contatto per qualsiasi questione privacy: hello@sonabrief.com

---

## La promessa centrale

**L'audio delle tue riunioni non lascia mai il tuo computer.**

Questo è il pilastro di tutto. La trascrizione avviene localmente sul tuo dispositivo tramite Whisper, un modello open source che gira sul tuo hardware. L'audio grezzo non viene mai inviato ai nostri server, né a server di terze parti, in nessuna modalità, senza eccezioni.

Puoi verificarlo tu stesso: apri gli strumenti sviluppatore del tuo browser (F12), vai su Network, avvia una registrazione. Vedrai richieste al backend per autenticazione, sintesi e sincronizzazione. Non vedrai mai una richiesta che trasporta un file audio binario verso qualsiasi server. Il codice che gestisce l'audio è pubblico: github.com/Sonabrief/sonabrief

---

## 1. Cosa raccogliamo e perché

### 1.1 Dati account

**Email** — Necessaria per l'autenticazione via magic link. È l'unico identificatore del tuo account. La usiamo per inviarti link di accesso, notifiche importanti sul servizio (non newsletter, a meno che tu non ti sia iscritto alla mailing list separata) e comunicazioni relative al tuo abbonamento.

**Preferenze utente** — Lingua dell'app, professione (opzionale, per personalizzare i prompt AI), contesto lavorativo (opzionale), durata media dei meeting, modalità di sintesi preferita. Queste preferenze sono salvate sul backend per permetterti di ritrovarle su dispositivi diversi.

### 1.2 Dati di utilizzo

**Metadati meeting** — Titolo del meeting (se lo assegni), data, durata, lingua selezionata, template usato, tier dell'account al momento della sintesi, modalità usata (Standard/Local Only), costo LLM associato (solo in Standard mode). Questi metadati ci servono per gestire le quote, calcolare i costi reali e migliorare il servizio.

**Log di sistema** — Log tecnici di accesso, errori, e utilizzo API. Conservati per 90 giorni, poi eliminati automaticamente. Servono a diagnosticare problemi e prevenire abusi.

### 1.3 Blob cifrati (modalità Synced)

Se usi la modalità Synced, le tue trascrizioni, sintesi e note vengono cifrate sul tuo dispositivo prima di essere caricate sui nostri server (Cloudflare R2). La chiave di cifratura è derivata dalla tua passphrase, che noi non conosciamo e non memorizziamo mai.

**Quello che vediamo:** blob binari cifrati, identificati dal tuo user ID e da un ID meeting anonimizzato. Non siamo in grado di leggere il contenuto.

**Quello che non vediamo mai:** il contenuto delle tue trascrizioni, sintesi, note, o qualsiasi informazione ricavata dall'audio — nemmeno nei log.

---

## 2. Cosa NON raccogliamo mai

- **Audio grezzo** — Mai, in nessuna modalità, su nessun server.
- **Contenuto trascrizioni e sintesi in modalità Synced** — Solo blob cifrati che non possiamo decifrare.
- **Canvas fingerprint** — Non usiamo canvas fingerprinting, audio fingerprinting, o qualsiasi tecnica di tracciamento avanzata lato client.
- **Identificatori hardware** — Non raccogliamo MAC address, serial number, o identificatori di dispositivo permanenti.
- **Dati di navigazione di terze parti** — Nessun pixel di tracciamento, nessun tag analytics di terze parti nell'app (usiamo Cloudflare Analytics sul sito marketing, che è privacy-friendly e non usa cookie).
- **Localizzazione GPS** — Mai.

---

## 3. Segnali anti-abuse (trasparenza esplicita)

Per prevenire l'abuso del piano Free (creazione di account multipli per aggirare le quote), raccogliamo al momento del signup alcune informazioni che qualsiasi server web riceve comunque da ogni browser:

- **User-Agent** — Tipo di browser, sistema operativo, versione
- **Timezone** — Fuso orario del browser
- **Lingua del browser** — Header Accept-Language
- **Risoluzione schermo** — Via window.screen (non canvas)
- **IP hashed SHA-256** — L'indirizzo IP viene immediatamente trasformato in un hash non reversibile. L'IP in chiaro non viene mai salvato.

Questi dati combinati formano un'impronta digitale approssimativa del dispositivo (accuratezza ~50-70%), sufficiente a individuare tentativi casuali di multi-account. Non usiamo librerie di terze parti per questo: l'implementazione è una cinquantina di righe di TypeScript nel codice pubblico del Worker.

**Come li usiamo:** se rileviamo lo stesso dispositivo associato a più account nello stesso mese, li trattiamo come un singolo account per la quota. Non blocchiamo, non banniamo senza preavviso. L'enforcement è silenzioso e proporzionale.

**Non li usiamo mai** per profilazione commerciale, pubblicità, o vendita a terze parti.

---

## 4. Subprocessor

Questi sono i servizi di terze parti che processano dati per conto di Sonabrief. La lista è completa e aggiornata a maggio 2026.

| Fornitore | Ruolo | Sede | Note |
|---|---|---|---|
| **Cloudflare** | Infrastruttura (Workers, D1 database, R2 storage, CDN) | USA (Standard Contractual Clauses + EU-U.S. Data Privacy Framework) | Tratta metadati account, log, blob cifrati Synced |
| **Mistral AI** | Sintesi LLM in modalità Standard | Francia (EU) — server Parigi | Zero Data Retention attivata (confermata maggio 2026). DPA firmato. Solo testo trascrizione, mai audio |
| **Resend** | Email transazionali (magic link, notifiche) | USA | Solo indirizzo email destinatario e contenuto del messaggio |
| **Polar** | Pagamenti e gestione abbonamenti | Delaware, USA | Tratta dati fatturazione. Non ha accesso ai dati dell'app |
| **MailerLite** | Email marketing (newsletter, annunci lancio) | Lituania (EU) | Solo per chi si iscrive esplicitamente alla mailing list su sonabrief.com. Separato dall'account app |

### Zero Data Retention Mistral — dettaglio

Mistral AI è il provider LLM che usiamo per la modalità Standard (sintesi cloud). In modalità Standard, la trascrizione testuale del tuo meeting (non l'audio) viene inviata a Mistral per generare la sintesi strutturata.

Abbiamo attivato la Zero Data Retention (ZDR) per la nostra organizzazione su Mistral AI Studio. Questo significa che Mistral non conserva i dati delle richieste API, non li usa per addestrare modelli, e non li analizza. La ZDR è applicabile a tutte le API stateless (chat completion, embeddings). La conferma di attivazione è stata ricevuta da Mistral Support in maggio 2026.

Il Data Processing Addendum (DPA) di Mistral è in vigore tramite i loro termini di servizio standard, accettati all'iscrizione. Una copia è conservata nel nostro archivio amministrativo.

---

## 5. Come usiamo i dati

Usiamo i dati raccolti esclusivamente per:

1. **Erogare il servizio** — autenticazione, gestione quote, sintesi cloud, sincronizzazione Synced
2. **Migliorare il servizio** — analisi aggregate e anonimizzate sull'uso delle funzionalità
3. **Sicurezza e anti-abuse** — rilevamento account multipli fraudolenti, prevenzione abusi API
4. **Comunicazioni di servizio** — notifiche tecniche, aggiornamenti importanti sull'account, fatturazione
5. **Comunicazioni marketing** — solo se ti sei iscritto esplicitamente alla mailing list

**Non facciamo mai:**
- pubblicità targetizzata
- vendita dei dati a terze parti
- uso dei tuoi dati per addestrare modelli AI
- condivisione dei dati con autorità senza un valido ordine giudiziario (e anche in quel caso, in modalità Synced possiamo solo consegnare blob cifrati che non siamo in grado di decifrare)

---

## 6. Conservazione dei dati

**Audio grezzo** — Rimane sul tuo computer. La retention è configurabile da te nelle impostazioni (default 30 giorni, fino a "non eliminare mai"). Non abbiamo accesso all'audio.

**Blob Synced** — Eliminati su tua richiesta entro 30 giorni dalla richiesta. Puoi richiedere l'eliminazione completa scrivendo a hello@sonabrief.com.

**Log di sistema** — Eliminati automaticamente dopo 90 giorni.

**Dati account** — Conservati finché l'account è attivo. In caso di chiusura account, eliminati entro 30 giorni.

**Segnali anti-abuse** — L'hash del dispositivo è conservato per il mese di rilevamento, poi eliminato nel ciclo mensile.

---

## 7. I tuoi diritti (GDPR)

Se sei residente nell'Unione Europea hai i seguenti diritti sui tuoi dati personali:

- **Accesso** — Puoi richiedere una copia di tutti i dati che abbiamo su di te.
- **Rettifica** — Puoi chiederci di correggere dati inesatti.
- **Cancellazione ("diritto all'oblio")** — Puoi chiederci di eliminare i tuoi dati. I blob Synced, essendo cifrati con la tua chiave, sono de facto inaccessibili per noi — la tua richiesta di cancellazione risulta comunque nell'eliminazione fisica dei blob dal nostro storage.
- **Portabilità** — Puoi esportare i tuoi dati in formato standard (Markdown, PDF, Word) direttamente dall'app.
- **Opposizione al trattamento** — Puoi opporti al trattamento dei tuoi dati per finalità non strettamente necessarie all'erogazione del servizio.
- **Limitazione del trattamento** — Puoi chiederci di limitare il trattamento in determinate circostanze.

Per esercitare qualsiasi diritto: **hello@sonabrief.com**, oggetto "GDPR – [diritto richiesto]". Risponderemo entro 30 giorni.

Se ritieni che il trattamento dei tuoi dati violi il GDPR, puoi presentare reclamo all'Autorità Garante per la Protezione dei Dati Personali (Garante Privacy Italia): garanteprivacy.it

---

## 8. Cookie e tecnologie di tracciamento

**App Sonabrief:** Usiamo un cookie HttpOnly (SameSite=None+Secure) per la gestione della sessione autenticata. Nessun cookie di tracciamento, nessun cookie pubblicitario.

**Sito sonabrief.com:** Usiamo Cloudflare Web Analytics, che non usa cookie e non traccia utenti individuali. Nessun Google Analytics, Facebook Pixel, o strumenti di tracciamento di terze parti.

Il cookie di sessione è strettamente necessario al funzionamento del servizio e non richiede consenso ai sensi dell'ePrivacy Directive.

---

## 9. Trasferimenti internazionali

Alcuni dei nostri subprocessor hanno sede fuori dall'UE (Cloudflare, Resend, Polar — tutti USA). Il trasferimento dei dati verso gli USA avviene sulla base delle garanzie appropriate previste dal GDPR (Standard Contractual Clauses o adeguacy decisions applicabili).

Mistral AI ha sede in Francia (UE): nessun trasferimento extra-UE per i dati LLM con ZDR attivata. Nota: Mistral utilizza Google Cloud Platform come infrastruttura, includendo il sotto-processore GCP. Con ZDR attivata, i dati non vengono conservati al termine della chiamata API.

---

## 10. Minori

Sonabrief è un servizio professionale destinato ad adulti. Non raccogliamo consapevolmente dati di persone di età inferiore ai 16 anni. Se sei un genitore o tutore e ritieni che tuo figlio abbia creato un account, contattaci a hello@sonabrief.com per la rimozione.

---

## 11. Modifiche a questa Policy

Quando modifichiamo questa Policy in modo sostanziale ti notifichiamo via email con almeno 14 giorni di preavviso. La versione corrente con data di ultimo aggiornamento è sempre disponibile su sonabrief.com/privacy.

---

## 12. Contatti

**Per questioni privacy e richieste GDPR:** hello@sonabrief.com

Sonabrief non ha l'obbligo di nominare un DPO formale (Data Protection Officer) ai sensi del GDPR nelle condizioni attuali del progetto. Il punto di contatto per tutte le questioni privacy è l'indirizzo sopra indicato.

---

Sonabrief · sonabrief.com · Maggio 2026

# Sonabrief — Audit codebase (sola lettura)

**Data:** 1 giugno 2026
**Scope:** `apps/web/src`, `workers/api/src`, migrations. Audit di sola lettura — nessun file modificato, nessun commit.
**Metodo:** lettura diretta dei file critici (crypto, auth, pagamenti, anti-abuse, pipeline trascrizione, routing Worker) + confronto con `PROJECT_SPEC.md` e PSD privato v3.1.

> Nota di calibrazione: dove un problema è esplicitamente documentato nel PSD come trade-off accettato (es. aggiramento retention via DevTools, soft enforcement), è segnalato come tale e non gonfiato.

---

## 1. Performance

### ALTA — Audio inviato a Cloud Veloce come base64 in un singolo body JSON
**File:** [transcribeCloud.ts:40-64](apps/web/src/lib/transcribeCloud.ts#L40-L64), [transcribe-cloud.ts:168-204](workers/api/src/routes/transcribe-cloud.ts#L168-L204)
**Impatto:** un meeting da 30-60 min produce un blob audio di svariati MB; `blobToBase64` lo carica interamente in memoria, lo gonfia del +33% (base64) e lo spedisce in un unico `JSON.stringify`. Il Worker poi fa `atob` + `JSON.parse` dell'intero payload in memoria. Rischio OOM sul Worker (limite 128 MB) e latenza alta su upload. `String.fromCharCode(...bytes.subarray(...))` con spread può anche superare il limite di argomenti su chunk grandi.
**Fix:** inviare l'audio come `multipart/form-data` binario (niente base64), in streaming verso Mistral; il Worker fa da proxy pass-through senza bufferizzare tutto.

### ALTA — `@huggingface/transformers` non è in v4.2.0 come dichiarato dal PSD
**File:** [package.json](apps/web/package.json) (`3.5.2`), node_modules confermato `3.5.2`; PSD sessione 42b dichiara upgrade a 4.2.0
**Impatto:** la v3.5.2 è esclusa da `optimizeDeps` e contiene il runtime ONNX completo (WASM + WebGPU); è la dipendenza singola più pesante del bundle. Le ottimizzazioni dtype `fp16`/WebGPU in [whisper.worker.ts:69-71](apps/web/src/workers/whisper.worker.ts#L69-L71) presuppongono comportamenti v4. Disallineamento doc↔codice + bundle non ottimizzato.
**Fix:** allineare la versione (decidere se restare su 3.5.2 e correggere il PSD, o completare l'upgrade) e verificare il tree-shaking effettivo.

### MEDIA — Nessun code-splitting manuale; pagine pesanti caricate eager
**File:** [App.tsx:6-29](apps/web/src/App.tsx#L6-L29), [vite.config](apps/web/vite.config.ts)
**Impatto:** tutte le 18 pagine sono importate staticamente in `App.tsx` (no `React.lazy`). `AdminPage` trascina `recharts` (~150 KB), `export.ts` trascina `jspdf` + `docx`, tutte nel bundle iniziale anche per chi fa solo login. Nessun `manualChunks` in `vite.config`.
**Fix:** `React.lazy` + `Suspense` su AdminPage, PricingPage, ArchivePage e dynamic `import()` di `jspdf`/`docx` solo al click di export.

### MEDIA — `semanticSearch` carica tutti gli embedding in memoria + N+1 query Dexie
**File:** [semanticSearch.ts:24-52](apps/web/src/lib/semanticSearch.ts#L24-L52)
**Impatto:** `db.embeddings.toArray()` carica ogni vettore (Float32, ~1.5 KB ciascuno) e calcola cosine in JS su tutto il set; per i top-K poi fa 2 query separate per meeting (`meetings.get` + `notes.where`) → N+1. Su archivi PU "forever" (migliaia di meeting) degrada. Il PSD (Rischio 18) prevede la paginazione ma la ricerca semantica la bypassa.
**Fix:** limitare il set di candidati, fare `bulkGet` invece di loop, e considerare un indice approssimato quando l'archivio cresce.

### MEDIA — `RecordingPage` con 40 `useState` → re-render a cascata
**File:** [RecordingPage.tsx](apps/web/src/pages/RecordingPage.tsx) (1879 righe, 40 `useState`)
**Impatto:** il timer di registrazione aggiorna `duration` ogni 500 ms ([useAudioRecorder.ts:162](apps/web/src/hooks/useAudioRecorder.ts#L162)); in un componente da 1879 righe con 40 stati ogni tick ri-renderizza l'intero albero (waveform, editor Tiptap, briefing). `ProGatedButton` è ridefinito inline come funzione modulo (ok) ma molti handler sono inline.
**Fix:** isolare il timer/waveform in sotto-componenti memoizzati; scomporre la pagina (vedi §2).

### BASSA — `getBatchSize()` e `isIntelGPU()` rivalutano WebGL ad ogni chiamata
**File:** [whisper.worker.ts:6-35](apps/web/src/workers/whisper.worker.ts#L6-L35)
**Impatto:** `getBatchSize()` è chiamata 3 volte per trascrizione (load log, transcribe, options); `IS_INTEL` è cachato ma `getBatchSize` no. Costo trascurabile ma ridondante.
**Fix:** calcolare `BATCH_SIZE` una volta a load-time.

### BASSA — `/auth/me`, `getPreferences`, `getBillingStatus` chiamati separatamente al boot
**File:** [api.ts](apps/web/src/lib/api.ts), consumati da più pagine
**Impatto:** ogni pagina autenticata fa più round-trip indipendenti al Worker (me + preferences + billing). Su edge è tollerabile ma sono 3 RTT seriali sul primo paint.
**Fix:** endpoint aggregato `/v1/bootstrap` o caching client condiviso.

---

## 2. Qualità del codice

### ALTA — Doppia/tripla sovrapposizione nella logica di quota (3 sistemi paralleli)
**File:** [synthesize.ts:10-14 + 95-152](workers/api/src/routes/synthesize.ts#L95-L152), [quota.ts:7-11 + 37-91](workers/api/src/quota.ts#L7-L11), [billing.ts:13-17](workers/api/src/routes/billing.ts#L13-L17)
**Impatto:** esistono **tre** definizioni di quota free divergenti: `synthesize.ts` `QUOTA_CAP.pro = 3000`, `quota.ts` `TIER_QUOTA_MINUTES.pro = 3000` ma commento "50h" (3000 min = 50h, ok) e `unlimited = 30000`, mentre `synthesize.ts` usa `unlimited = null`. Inoltre `synthesize` fa **due** check quota in sequenza (blocco "5." righe 112-135 e di nuovo `checkQuotaAndBudget` riga 138) con due `BUDGET_CAP_USD` diversi (30 in synthesize, 50 in quota.ts). Logica duplicata e numeri incoerenti = bug latenti su enforcement.
**Fix:** un'unica fonte di verità per quota/budget per tier, importata ovunque.

### ALTA — Tier resolution incoerente tra route
**File:** [synthesize.ts:64-69](workers/api/src/routes/synthesize.ts#L64-L69) vs [tier.ts:3-10](workers/api/src/lib/tier.ts#L3-L10) (usato da transcribe-cloud, templates, email-reminder)
**Impatto:** `synthesize` legge `licenses WHERE status='active' ORDER BY created_at DESC LIMIT 1`; `billing.ts` legge `licenses WHERE user_id=?` senza filtro status; `getUserTier` filtra `status='active'`. Un utente con licenza `cancelled` ma ancora dentro `ends_at` viene trattato in modi diversi a seconda dell'endpoint. Possibile downgrade/upgrade percepito incoerente.
**Fix:** centralizzare in `getUserTier` (già esiste) e usarlo anche in `synthesize` e `billing`, con gestione esplicita di `cancelled` + `ends_at`.

### MEDIA — `RecordingPage` (1879) e `ProfilePage` (987) / `AdminPage` (832) troppo grandi
**File:** [RecordingPage.tsx](apps/web/src/pages/RecordingPage.tsx), [ProfilePage.tsx](apps/web/src/pages/ProfilePage.tsx), [AdminPage.tsx](apps/web/src/pages/AdminPage.tsx)
**Impatto:** componenti monolitici, difficili da testare e mantenere; il PSD (sessione 48) documenta esplicitamente che lo split è "rimandato post-lancio".
**Fix:** estrarre il blocco modalità/sorgente, il pannello sintesi, e il blocco recovery di RecordingPage in componenti dedicati.

### MEDIA — Dead code: pipeline chunked transcription disabilitata ma presente
**File:** [useChunkedTranscription.ts:10](apps/web/src/hooks/useChunkedTranscription.ts#L10) (`CHUNKED_TRANSCRIPTION_ENABLED = false`), [whisper.worker.ts:118-133](apps/web/src/workers/whisper.worker.ts#L118-L133) (`transcribe_chunk`), [whisper.ts:79-81](apps/web/src/lib/whisper.ts#L79-L81) (`transcribeChunk`)
**Impatto:** catena orfana confermata dal PSD (sessione 55). `getFirstChunkBlob`/`getWebMHeader`/`blobToFloat32ArrayChunk` esistono solo per questo path morto. Confonde lettori e aumenta la superficie. **Attenzione:** `chunkStore.ts` (cifratura chunk) **è vivo** — usato da `useAudioRecorder` — non rimuoverlo.
**Fix:** rimuovere `useChunkedTranscription.ts`, l'handler `transcribe_chunk`, `whisper.transcribeChunk` e `blobToFloat32ArrayChunk`.

### MEDIA — `WhisperEvent` dichiara `chunk_progress` mai emesso; `model_info` simulato con setTimeout
**File:** [whisper.ts:54-63](apps/web/src/lib/whisper.ts#L54-L63)
**Impatto:** `_loadModel` emette `model_info` via `setTimeout(…, 0)` ai listener — race-prone (listener registrato dopo lo 0ms tick lo perde). Tipi che non corrispondono ai messaggi reali del worker.
**Fix:** emettere `model_info` in modo sincrono nel flusso, allineare l'union type ai messaggi realmente prodotti.

### MEDIA — `@ts-ignore` diffusi sui worker transformers + `as any` su `request.cf`
**File:** [whisper.worker.ts:48,75,103,118,122](apps/web/src/workers/whisper.worker.ts), [auth.ts:64](workers/api/src/routes/auth.ts#L64) (`(request as any).cf?.asn`)
**Impatto:** `@ts-ignore` sulle chiamate `transcriber()` è giustificato (tipi libreria), ma `(navigator as any).deviceMemory` e `(request as any).cf` aggirano il tipo invece di estenderlo.
**Fix:** dichiarare `deviceMemory` su un'interfaccia Navigator estesa e tipizzare `request.cf` con `IncomingRequestCfProperties`.

### BASSA — Commenti numerati fuori sequenza in `synthesize.ts`
**File:** [synthesize.ts](workers/api/src/routes/synthesize.ts) (due blocchi "5.", due "6.")
**Impatto:** leggibilità; segnala refactor incrementali non ripuliti.
**Fix:** rinumerare.

### BASSA — `mode: 'hybrid'` ancora nel tipo `Meeting` benché "escluso by design"
**File:** [db.ts:9](apps/web/src/lib/db.ts#L9)
**Impatto:** il PSD dichiara Hybrid abolito; il tipo lo ammette ancora. Dead type.
**Fix:** rimuovere `'hybrid'` dall'union.

---

## 3. Sicurezza

### ALTA — Recovery phrase BIP39 usa solo i primi 32 byte del seed (entropia ridotta + rischio di aliasing del buffer)
**File:** [crypto.ts:69-72](apps/web/src/lib/crypto.ts#L69-L72)
**Impatto:** `recoveryPhraseToKey` fa `new Uint8Array(seed.buffer, seed.byteOffset, 32)` su un seed BIP39 da 64 byte. (1) Usa una **vista** sul buffer originale, non una copia — se `seed` viene azzerato/riutilizzato altrove la chiave cambia sotto i piedi; `memzero` su questa chiave azzererebbe parte del seed. (2) La chiave di recovery è derivata in modo completamente diverso dalla chiave da passphrase (`deriveKey` Argon2id) — sono **due chiavi distinte**: i dati cifrati con la passphrase **non** sono decifrabili con la recovery phrase e viceversa, a meno che l'onboarding non salvi/migri esplicitamente. Va verificato il flusso onboarding (rischio: recovery phrase che non recupera nulla). Il PSD vende la recovery come "unica strada per riaprire l'archivio".
**Fix:** copiare i byte (`.slice()`), e unificare la derivazione: la recovery phrase dovrebbe ricostruire **la stessa** master key usata in Synced (es. la passphrase-derived key viene wrappata con la recovery key all'onboarding), non una key parallela.

### ALTA — Magic link punta a `sonabrief.com`, ma l'app SPA è su `app.sonabrief.com`
**File:** [auth.ts:21-27 + 131-132](workers/api/src/routes/auth.ts#L21-L27), [VerifyPage.tsx:15](apps/web/src/pages/VerifyPage.tsx#L15)
**Impatto:** `getMagicLinkBase` ritorna l'Origin se finisce per `sonabrief.com` (quindi `app.sonabrief.com` ok) **oppure** il fallback `https://sonabrief.com`. Se la richiesta `/auth/request` parte da un Origin non riconosciuto (o senza Origin) il link va a `sonabrief.com/auth/verify?token=…` — dominio del **sito Astro**, dove `/auth/verify` non esiste (404) → il token non viene mai consumato. Da verificare in produzione: il routing del magic link dipende dall'header Origin del fetch, fragile.
**Fix:** hardcodare la base del magic link su `https://app.sonabrief.com` in produzione (l'unico posto dove `VerifyPage` esiste), indipendentemente dall'Origin.

### ALTA — Endpoint `synthesize` accetta `system_prompt` arbitrario dal client
**File:** [synthesize.ts:21-30 + 93](workers/api/src/routes/synthesize.ts#L21-L30)
**Impatto:** il `system_prompt` è inviato dal client e usato direttamente verso Mistral (`buildSystemPrompt` lo antepone solo). Un utente Free può inviare qualsiasi system prompt (jailbreak, prompt injection, uso del modello come chatbot generico a spese dell'azienda) entro la quota. Il PSD descrive i template come "curati con istruzioni rigide anti-allucinazione", ma il server non verifica che il prompt provenga da un template reale.
**Fix:** passare `template_id` e ricostruire il system prompt **server-side** dal DB `templates`; non fidarsi del prompt client. In subordine, validare che corrisponda a un template noto.

### MEDIA — Throttle IP solo su nuovi signup; `existingUser` bypassa datacenter/throttle
**File:** [auth.ts:54-85](workers/api/src/routes/auth.ts#L54-L85)
**Impatto:** coerente col PSD (re-login non deve essere bloccato), ma combinato con il rate-limit a "max 3 token attivi" per utente esistente ([auth.ts:107-120](workers/api/src/routes/auth.ts#L107-L120)): un attaccante che conosce email esistenti può comunque innescare fino a 3 invii email per utente prima del blocco, e i token scadono a 15 min → email bombing limitato ma possibile su molte email. Il blocco datacenter ha prefissi IP sovrapposti e incompleti ([antiabuse.ts:8-23](workers/api/src/lib/antiabuse.ts#L8-L23)) — prefissi come `'13.'`,`'52.'`,`'104.'` catturano anche IP residenziali legittimi (falsi positivi) e mancano interi range cloud.
**Fix:** affidarsi a `request.cf.asn` (già disponibile) per il check datacenter invece dei prefissi stringa; rate-limit anche per coppia (IP, email) sul re-login.

### MEDIA — CORS: `credentialless` in prod vs `require-corp` in dev + lista origin con dominio preview hardcoded
**File:** [_headers](apps/web/public/_headers) (COEP `credentialless`, blocco duplicato), [vite.config](apps/web/vite.config.ts) (dev `require-corp`), [cors.ts:3-10](workers/api/src/lib/cors.ts#L3-L10)
**Impatto:** (1) Il `_headers` ha il blocco `/*` **duplicato** — innocuo ma sintomo di errore. (2) Mismatch COEP dev/prod può cambiare il comportamento di `crossOriginIsolated` (richiesto da Whisper WASM threads) tra ambienti. (3) `ALLOWED_ORIGINS` contiene un dominio preview Pages hardcoded (`7f4917c7.sonabrief-app.pages.dev`) e fa fallback silenzioso ad `ALLOWED_ORIGINS[0]` per origin sconosciuti — un origin non in lista riceve comunque header CORS validi verso sonabrief.com (non sfruttabile per credential theft grazie a `Allow-Credentials` + origin specifico, ma sporco).
**Fix:** deduplicare `_headers`, allineare COEP dev/prod, rimuovere il dominio preview, e per origin non riconosciuti non emettere header CORS permissivi.

### MEDIA — `subscription.updated` con qualsiasi status attiva tier + auto-whitelist
**File:** [webhooks-polar.ts:103-130](workers/api/src/routes/webhooks-polar.ts#L103-L130)
**Impatto:** `subscription.created` e `subscription.updated` sono trattati identicamente: scrivono `tier` dal product_id e, se `status==='active'`, auto-whitelistano l'utente. Lo `status` non-active viene scritto raw (`data.status`) in `licenses.status`, e `getUserTier`/synthesize filtrano `status='active'` — ma un evento `updated` con status arbitrario potrebbe lasciare la riga in stati non previsti. La firma HMAC è verificata correttamente (timing-safe ok), quindi l'attacco richiede un webhook Polar valido. Rischio principale: logica di stato fragile più che bypass.
**Fix:** mappare esplicitamente gli status Polar consentiti; non scrivere status raw.

### MEDIA — Cancellazione account: lista tabelle incompleta + nessuna transazione
**File:** [account.ts:4-40](workers/api/src/routes/account.ts#L4-L40)
**Impatto:** `TABLES_WITH_USER_ID` **non include** `webauthn_credentials`, `webauthn_challenges`, `user_whitelist`, `cloud_transcription_usage`, `webhook_events`, `ip_throttle`. Dopo cancellazione restano: passkey dell'utente (riassociabili?), record whitelist, usage Cloud Veloce. Viola GDPR Art. 17 (cancellazione completa) che il PSD rivendica. Inoltre i `DELETE` non sono in `db.batch()` → cancellazione parziale possibile su errore a metà.
**Fix:** aggiungere tutte le tabelle con `user_id`, eseguire in batch atomico, e gestire `webauthn_challenges` (per email/user_id).

### MEDIA — Anti-abuse `fingerprint` flagga ma il flagged passa solo per soft enforcement (aggirabile)
**File:** [antiabuse.ts:121-142](workers/api/src/lib/antiabuse.ts#L121-L142), [synthesize.ts:154-188](workers/api/src/routes/synthesize.ts#L154-L188)
**Impatto:** il fingerprint è solo UA+lang+timezone+risoluzione → altissima collisione naturale (molti utenti legittimi con stesso setup vengono flaggati → latenza artificiale 8-15s su clienti veri). È documentato come trade-off, ma la soglia "≥1 collisione = flag" è aggressiva. Coerente col PSD ma rischio falsi positivi su Fascia A reale.
**Fix:** alzare la soglia di collisione e/o includere più segnali entropici non invasivi; whitelisting già mitiga i paganti.

### BASSA — IP hashing senza salt (SHA-256 puro su IPv4 → reversibile per forza bruta)
**File:** [sessions.ts:134-146](workers/api/src/lib/sessions.ts#L134-L146), [antiabuse.ts:25-30](workers/api/src/lib/antiabuse.ts#L25-L30)
**Impatto:** lo spazio IPv4 è 2³² — un SHA-256 senza salt è invertibile in minuti con una rainbow table. Il PSD vende "IP hashed (mai in chiaro)" come garanzia privacy; tecnicamente l'hash non protegge molto.
**Fix:** HMAC con secret server-side (pepe) invece di SHA-256 nudo.

### BASSA — `recoveryPhraseToKey`/`saveVerificationBlob` su `localStorage` (non sopravvive a clear, leggibile da XSS)
**File:** [keystore.ts:60-85](apps/web/src/lib/keystore.ts#L60-L85)
**Impatto:** il verification blob e la session key (`sessionStorage`) sono accessibili a qualunque XSS. Per un prodotto privacy-first è un vettore da dichiarare. Mitigato dal fatto che la key è derivata, non la passphrase.
**Fix:** documentare il modello di minaccia; valutare WebCrypto non-extractable keys dove possibile.

---

## 4. Architettura

### ALTA — Disallineamento codice ↔ PROJECT_SPEC su più promesse pubbliche

| Promessa (PSD/PROJECT_SPEC) | Realtà nel codice | File |
|---|---|---|
| "Audio mai salvato come file" + chunk cancellati in ~2-3 min | Vero per i chunk, **ma** `useAudioRecorder` tiene `chunksRef` (audio intero in RAM) e `setAudioBlob(blob)` mantiene il blob completo per tutta la sessione `done`; in Cloud Veloce l'intero audio è spedito al server | [useAudioRecorder.ts:138-156](apps/web/src/hooks/useAudioRecorder.ts#L138-L156) |
| Local Only "disponibile su tutti i tier" | Backend `synthesize` per `mode:'local'` ritorna **placeholder "non ancora disponibile"** | [synthesize.ts:161-171](workers/api/src/routes/synthesize.ts#L161-L171) |
| transformers v4.2.0 (PSD s.42b) | Installato 3.5.2 | [package.json](apps/web/package.json) |
| Retention "Free 7 giorni" cleanup client+server | Cron server c'è (free 7gg/pro 365gg); cleanup client `useRetentionCleanup` esiste; ok | [cron-retention.ts:3-6](workers/api/src/routes/cron-retention.ts#L3-L6) |

**Impatto:** le prime due voci sono claim pubblici (sito + privacy policy). "Local Only su tutti i tier" è centrale nel posizionamento ma il path cloud-LLM locale passa per Ollama lato client ([ollama.ts](apps/web/src/lib/ollama.ts)) mentre l'endpoint server lo nega — va chiarito che la sintesi locale **non** tocca il Worker (allora il placeholder è morto e fuorviante).
**Fix:** rimuovere il branch `mode:'local'` placeholder dal Worker (la sintesi locale è interamente client-side via Ollama); allineare PSD su versione transformers; sul claim audio, mantenere la formulazione precisa già usata in `/security`.

### MEDIA — Tre sistemi di pagamento coesistono (Polar attivo, Lemon Squeezy, checkout duplicati)
**File:** [webhooks.ts](workers/api/src/routes/webhooks.ts) (LS completo), [webhooks-polar.ts](workers/api/src/routes/webhooks-polar.ts), [checkout.ts](workers/api/src/routes/checkout.ts) + [checkout-polar.ts](workers/api/src/routes/checkout-polar.ts), schema `licenses` con colonne `ls_*` **e** `polar_*`
**Impatto:** doppia superficie di webhook attiva contemporaneamente (`/v1/webhooks/lemonsqueezy` e `/v1/webhooks/polar` entrambi registrati in [index.ts:91-96](workers/api/src/index.ts#L91-L96)). Lo schema `licenses` mescola entrambi i fornitori. Il PSD dichiara Polar come MoR e LS come "backup documentato" — ma entrambi i webhook sono live e scrivono sulla stessa tabella con `ON CONFLICT(user_id)`. Confusione di stato e attack surface.
**Fix:** se Polar è la scelta, disattivare la route webhook LS (o gate dietro flag) e isolare le colonne legacy.

### MEDIA — Routing Worker: catena di `if/else` su 50+ branch in un singolo file
**File:** [index.ts:57-139](workers/api/src/index.ts#L57-L139)
**Impatto:** routing manuale lungo, error-prone (ordine, method matching ripetuto). `MAINTENANCE_MODE` blocca **tutto** incluso `/v1/webhooks/polar` → durante manutenzione i webhook Polar ricevono 503 e i pagamenti non vengono registrati (Polar ritenta ma può perdere eventi oltre il retry window).
**Fix:** estrarre una tabella di routing; escludere le route webhook dal maintenance gate.

### MEDIA — `_headers`, dominio preview, e DB `sonabrief-prod` vuoto: residui infrastrutturali
**File:** [_headers](apps/web/public/_headers) (duplicato), [cors.ts:7](workers/api/src/lib/cors.ts#L7), PSD sessione 51 ("database vuoto `sonabrief-prod` creato per errore, non eliminato")
**Impatto:** rischio di confusione operativa (binding sul DB sbagliato) e header duplicati.
**Fix:** pulizia: eliminare il DB orfano, deduplicare `_headers`, rimuovere domini preview dal CORS.

### BASSA — `apps/desktop` presente nel monorepo benché Tauri "mai sviluppato"
**File:** `apps/desktop/`
**Impatto:** il PSD v3.1 dichiara l'eliminazione completa di Tauri dal lancio e "Tauri non è mai stato sviluppato". La cartella esiste comunque → potenziale dead scaffold che confonde i contributor.
**Fix:** verificare il contenuto e rimuovere o documentare lo stato.

### BASSA — `consumeOpenAIStream` ignora silenziosamente errori di parsing chunk
**File:** [stream.ts:24-32](workers/api/src/providers/stream.ts#L24-L32)
**Impatto:** `catch { /* ignora */ }` può nascondere cambi di formato API Mistral (es. nuovi campi `usage`) → token usage a 0 → budget tracking sottostimato → budget cap inefficace.
**Fix:** loggare i parse-failure a campione per diagnostica.

---

## Sintesi priorità

**Da chiudere prima del lancio pubblico (ALTA):**
1. Recovery phrase: verificare che recuperi davvero l'archivio Synced ([crypto.ts:69-72](apps/web/src/lib/crypto.ts#L69-L72)) — rischio perdita dati permanente per gli utenti.
2. Magic link → forzare `app.sonabrief.com` ([auth.ts:21-27](workers/api/src/routes/auth.ts#L21-L27)) — rischio login rotto in prod.
3. `system_prompt` server-side dai template ([synthesize.ts:93](workers/api/src/routes/synthesize.ts#L93)) — abuso LLM a spese dell'azienda.
4. Cloud Veloce audio in base64/JSON → multipart streaming ([transcribeCloud.ts:40](apps/web/src/lib/transcribeCloud.ts#L40)) — OOM Worker su meeting lunghi.
5. Cancellazione account incompleta ([account.ts:4](workers/api/src/routes/account.ts#L4)) — GDPR.
6. Unificare quota/tier resolution (3 sistemi divergenti).
7. Allineare doc↔codice (transformers v3.5.2, Local Only placeholder).

**Igiene pre-lancio (MEDIA):** disattivare webhook LS se Polar è definitivo, escludere webhook dal maintenance gate, dedup `_headers`, rimuovere dead code chunked-transcription, scomporre RecordingPage.

**Nota positiva:** crypto sync (XChaCha20-Poly1305 + Argon2id MODERATE + AAD versionato + nonce random), WebAuthn (counter anti-replay, challenge consume-on-lookup, no user enumeration), firma webhook HMAC timing-safe, sync endpoint zero-knowledge (solo blob cifrati + magic check), e gating tier sui template/custom sono implementati correttamente e coerenti col PSD.

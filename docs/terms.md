# Terms of Service

**Sonabrief · Maggio 2026 · Versione 1.1**

---

Questi Termini di Servizio regolano l'accesso e l'uso di Sonabrief, il meeting assistant open source privacy-first sviluppato e gestito sotto il brand Sonabrief. Usando il servizio accetti questi termini. Se non li accetti, non usare il servizio.

---

## 1. Cos'è Sonabrief

Sonabrief è un assistente AI per meeting professionali. Cattura l'audio dei tuoi meeting elaborandolo in tempo reale sul tuo computer, senza salvarlo come file. Genera trascrizioni locali, sintesi strutturate, e un archivio ricercabile delle tue conversazioni professionali.

Il codice che gira sul tuo dispositivo è open source e verificabile su github.com/sonabrief/sonabrief. Alcune parti del servizio (backend cloud, template curati, storage sincronizzato) sono erogate come servizio commerciale.

---

## 2. Account

Per usare Sonabrief devi creare un account con un indirizzo email valido. L'autenticazione avviene tramite magic link (link monouso inviato via email) o passkey WebAuthn se ne hai configurata una.

Sei responsabile della sicurezza del tuo account. In particolare:

- Le tue 12 parole di recovery BIP39 (generate in onboarding per la modalità Synced) sono l'unica strada per recuperare l'accesso ai tuoi dati cifrati se perdi la passphrase. Conservale in modo sicuro. Noi non possiamo recuperarle.
- Non condividere l'accesso al tuo account con altri. Ogni account è per uso individuale, salvo piani Enterprise che includono licenze multi-utente esplicite.

---

## 3. Piani e prezzi

### Free

- 3 ore di audio cloud al mese (rolling window basata sulla data di signup)
- Superato il limite mensile, la registrazione in modalità Standard si blocca con un messaggio chiaro fino al rinnovo. La modalità Local Only resta disponibile e illimitata
- **Retention archivio: 7 giorni.** Trascrizioni e sintesi più vecchie di 7 giorni vengono eliminate automaticamente
- Accesso a 3 template di sistema
- Export in Markdown e copia testo

### Pro — €9/mese o €89/anno

- 30 ore di audio cloud al mese
- **Retention archivio: 12 mesi**
- Tutti i 7 template di sistema in 5 lingue native (IT, EN, FR, ES, DE)
- Template verticali professionali (legale, medico, fiscale, terapia, coaching, ecc.) disponibili progressivamente nei mesi successivi al lancio, dopo review da professionisti madrelingua per ciascun mercato
- Fino a 5 template personalizzati
- Export completi: Markdown, PDF, Word, Email formattata
- Dashboard action items, briefing pre-meeting, ricerca semantica, vista cliente, calendario OAuth
- Tag e etichette personalizzate
- Reminder action items email settimanale (opt-in)
- Supporto via email (risposta entro 48 ore)

### Pro Unlimited — €19/mese o €189/anno

- Sintesi illimitata — nessun limite mensile
- **Retention archivio: per sempre**
- Backup E2E automatico cifrato verso i nostri server (frequenza configurabile)
- Licenza multi-device
- Template personalizzati illimitati
- Tutte le feature Pro
- Supporto prioritario (risposta entro 24 ore)

### Enterprise — Pricing su misura

Per studi, società e team con esigenze specifiche. Include licenza commerciale alternativa all'AGPL v3, opzione self-hosting, SSO, admin dashboard, template custom, supporto dedicato. Contatto: hello@sonabrief.com.

### Retention dell'archivio

Sonabrief conserva trascrizioni e sintesi per una durata che dipende dal piano: 7 giorni nel Free, 12 mesi nel Pro, per sempre nel Pro Unlimited. L'audio non viene mai salvato come file, indipendentemente dal piano.

In caso di downgrade di piano, i record oltre il nuovo limite vengono mantenuti per 30 giorni aggiuntivi con segnalazione visibile nell'archivio, poi eliminati permanentemente. Puoi esportare qualsiasi record in Markdown, PDF o Word prima della scadenza.

### Sconti e programmi speciali

- **Annuale**: circa 17% di sconto rispetto al mensile
- **Friends & Family**: 12 mesi di Pro gratis per persone selezionate dal team
- **Open source maintainer**: 12 mesi di Pro gratis per maintainer attivi di progetti open source (verifica via GitHub). Scrivi a hello@sonabrief.com con link al repository

---

## 4. Uso accettabile

Puoi usare Sonabrief per qualsiasi scopo professionale legittimo. Non puoi:

- Usare il servizio per attività illegali o per registrare conversazioni senza il consenso dei partecipanti (dove richiesto dalla legge applicabile)
- Tentare di aggirare i meccanismi di autenticazione, quota o sicurezza del servizio
- Usare il servizio in modo da compromettere la disponibilità o la sicurezza per altri utenti
- Rivendere o sublicenziare l'accesso al servizio senza accordo scritto

**Responsabilità delle registrazioni.** Le leggi sul consenso alla registrazione variano per giurisdizione. Sei responsabile di ottenere i consensi necessari prima di registrare conversazioni con terzi. Sonabrief non è responsabile per l'uso del servizio in violazione di leggi locali sul consenso.

**Anti-abuse.** Il sistema anti-abuse può in rari casi generare falsi positivi su utenti legittimi (es. più dispositivi sulla stessa rete, VPN aziendali, conversioni da Free a Pro). Gli utenti paganti vengono rimossi automaticamente da qualsiasi lista di controllo al momento del primo pagamento verificato. Se riscontri blocchi o rallentamenti anomali, scrivi a hello@sonabrief.com — rispondiamo entro 48 ore.

---

## 5. Rinnovo e cancellazione

Gli abbonamenti si rinnovano automaticamente alla scadenza (mensile o annuale) fino a cancellazione esplicita. Puoi cancellare in qualsiasi momento da /profilo → Piano e abbonamento. La cancellazione è efficace a fine periodo già pagato — non effettuiamo rimborsi pro-rata per periodi non usati, salvo quanto previsto dalla politica di rimborso al §6.

Puoi cancellare l'intero account da /profilo → Privacy e dati → Elimina account. La cancellazione dell'account è permanente: tutti i dati vengono eliminati e non sono recuperabili.

---

## 6. Politica di rimborso

Se riscontri un problema tecnico che impedisce l'uso del servizio e non riusciamo a risolverlo entro 7 giorni dalla segnalazione, puoi richiedere un rimborso proporzionale al periodo non usufruito. Scrivi a hello@sonabrief.com.

Per acquisti recenti (entro 14 giorni dalla prima sottoscrizione), puoi richiedere il rimborso completo se il servizio non soddisfa le aspettative ragionevoli descritte in questi termini.

---

## 7. Proprietà dei tuoi dati

I tuoi dati — trascrizioni, sintesi, note, action items — sono tuoi. Non li usiamo per addestrare modelli AI, non li vendiamo, non li cediamo a terzi salvo quanto strettamente necessario all'erogazione del servizio (vedi subprocessor nella Privacy Policy).

In modalità Synced, i tuoi dati sono cifrati con una chiave che solo tu possiedi. Tecnicamente non siamo in grado di leggerli. Puoi esportarli in qualsiasi momento in formato standard (Markdown, PDF, Word) direttamente dall'app. L'export avviene lato client — l'app decifra i dati localmente e genera il file sul tuo dispositivo.

---

## 8. Proprietà intellettuale

Il codice client di Sonabrief è rilasciato sotto licenza AGPL v3. I template di sistema generici sono open source. I template verticali professionali curati, il brand Sonabrief (nome, logo, identità visiva), e il backend commerciale sono proprietà di Sonabrief e non sono coperti dalla licenza AGPL v3.

Se contribuisci codice al repository pubblico, la tua contribuzione è soggetta al Contributor License Agreement (CLA Harmony) disponibile in CLA.md nel repository.

---

## 9. Limitazione di responsabilità

Sonabrief è fornito "così com'è". Non garantiamo disponibilità continua del servizio cloud, accuratezza assoluta delle trascrizioni, o idoneità del servizio per usi specifici regolamentati (es. documentazione medico-legale). La qualità della trascrizione dipende dalla qualità dell'audio, dall'hardware del dispositivo, e dal modello Whisper in uso.

In nessun caso la nostra responsabilità per danni derivanti dall'uso del servizio supera l'importo pagato nei 12 mesi precedenti all'evento che ha causato il danno.

---

## 10. Modifiche ai termini

Quando aggiorniamo questi termini, la nuova versione viene pubblicata su questa pagina con data di aggiornamento. Per modifiche significative che riducono i diritti attualmente garantiti, avvisiamo via email almeno 30 giorni prima dell'entrata in vigore. L'uso continuato del servizio dopo l'entrata in vigore costituisce accettazione dei nuovi termini.

---

## 11. Legge applicabile

Questi termini sono regolati dalla legge italiana. Per qualsiasi controversia, il foro competente è quello del luogo in cui ha sede Sonabrief, salvo diversa disposizione imperativa applicabile al consumatore.

---

## 12. Contatti

**Email**: hello@sonabrief.com  
**Sito**: sonabrief.com

---

*Versione 1.2 · Maggio 2026*  
*Versione precedente: 1.0 · Maggio 2026*

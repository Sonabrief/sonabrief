# Terms of Service

**Sonabrief · Maggio 2026 · Versione 1.0**

---

Questi Termini di Servizio regolano l'accesso e l'uso di Sonabrief, il meeting assistant open source privacy-first sviluppato e gestito sotto il brand Sonabrief. Usando il servizio accetti questi termini. Se non li accetti, non usare Sonabrief.

Contatto per qualsiasi questione relativa a questi termini: hello@sonabrief.com

---

## 1. Cos'è Sonabrief

Sonabrief è un assistente AI per riunioni professionali. Registra l'audio dei tuoi meeting direttamente sul tuo computer, lo trascrive localmente tramite modelli open source (Whisper), e genera riassunti strutturati tramite modelli LLM — europei e con Zero Data Retention attivata nella modalità Standard, oppure completamente locali nella modalità Local Only.

**L'audio dei tuoi meeting non lascia mai il tuo computer.** Questo non è marketing: è una scelta architetturale verificabile nel codice sorgente pubblico.

Il software client è rilasciato sotto licenza AGPL v3 (vedi sezione 8). Alcune funzionalità avanzate e i servizi cloud sono disponibili tramite abbonamento.

---

## 2. Account e accesso

Per usare Sonabrief è necessario un account registrato con un indirizzo email valido. L'autenticazione avviene tramite magic link — nessuna password da memorizzare.

Sei responsabile di:
- mantenere il tuo indirizzo email accessibile e aggiornato
- non condividere l'accesso al tuo account con altre persone
- qualsiasi attività che avviene sotto il tuo account

Se sospetti un accesso non autorizzato, contattaci immediatamente a hello@sonabrief.com.

---

## 3. Piani e prezzi

Sonabrief è disponibile in quattro piani:

**Free** — Gratuito, senza carta di credito.
Accesso alle funzionalità base: 3 ore di audio cloud al mese (sintesi via LLM europeo), Local Only illimitato con modello Llama 3.2 3B, 3 template di sistema, export solo Markdown e copia testo, storage Synced fino a 100 MB.

**Pro** — €9/mese oppure €89/anno (circa 17% di sconto).
30 ore di audio cloud al mese, Local Only illimitato con modello Llama 3.1 8B, tutti i 7 template di sistema più template verticali professionali, export completi (PDF, Word, email formattata), dashboard action items, briefing pre-meeting, ricerca semantica, speaker labeling, vista cliente/progetto, calendario OAuth (Google e Microsoft 365), template personalizzati fino a 5, storage Synced fino a 5 GB, supporto email con risposta entro 48 ore.

**Pro Unlimited** — €19/mese oppure €189/anno.
Audio cloud in modalità fair-use, Local Only illimitato con scelta del modello (Llama 8B, Qwen 14B, Qwen 32B), storage Synced fino a 25 GB, multi-device, backup encrypted automatico, template personalizzati illimitati, tutte le funzionalità Pro, supporto prioritario con risposta entro 24 ore.

**Enterprise** — Prezzo su richiesta (indicativamente €2.000–15.000/anno).
Per studi, società e team. Include licenza commerciale Sonabrief (alternativa all'AGPL v3 per deployment self-hosted modificati), template custom, supporto dedicato, opzione self-hosting. Contattaci a hello@sonabrief.com per una demo.

I prezzi sono IVA esclusa. L'IVA applicabile viene calcolata automaticamente al momento dell'acquisto in base al tuo paese.

---

## 4. Pagamenti e merchant of record

I pagamenti sono gestiti da **Polar** (Polar Software Inc., società del Delaware, USA), che agisce come Merchant of Record per tutti gli abbonamenti Sonabrief. Polar gestisce la fatturazione, la raccolta dell'IVA nei paesi EU e le transazioni con carta.

Acquistando un abbonamento a pagamento, accetti anche i termini di servizio di Polar applicabili alle transazioni.

I dati di pagamento (carta di credito, IBAN, ecc.) non transitano mai per i nostri sistemi: sono gestiti interamente da Polar e dai suoi partner certificati PCI DSS.

---

## 5. Rinnovo e cancellazione

Gli abbonamenti mensili si rinnovano automaticamente ogni mese. Gli abbonamenti annuali si rinnovano ogni anno.

Puoi cancellare il tuo abbonamento in qualsiasi momento dalla sezione Billing del tuo profilo. La cancellazione ha effetto al termine del periodo già pagato: continui ad avere accesso alle funzionalità del piano fino alla scadenza naturale.

Non effettuiamo addebiti dopo la cancellazione.

---

## 6. Politica di rimborso

**Abbonamenti mensili:** nessun rimborso. Puoi cancellare quando vuoi, ma non emettiamo rimborsi per periodi già fatturati.

**Abbonamenti annuali:** rimborso proporzionale ai mesi rimanenti se la richiesta arriva entro 14 giorni dall'acquisto o dal rinnovo. Oltre i 14 giorni, nessun rimborso.

**Motivi tecnici documentati:** se un'interruzione del servizio imputabile a noi ha reso il prodotto inutilizzabile per più di 72 ore consecutive, valutiamo richieste di rimborso o estensione caso per caso. Scrivici a hello@sonabrief.com con i dettagli.

Per richiedere un rimborso nelle condizioni previste: hello@sonabrief.com, oggetto "Rimborso – [email account]".

---

## 7. Uso accettabile

Sonabrief è uno strumento professionale. Non puoi usarlo per:

- registrare conversazioni di terze parti senza il loro consenso, dove tale consenso è richiesto dalla legge applicabile
- automatizzare chiamate o sintesi in modo fraudolento (bot, multi-account abuse)
- tentare di estrarre, replicare o ingegnerizzare inversamente il backend proprietario di Sonabrief
- attività illegali, diffamatorie, o che violino diritti di terzi

Il piano Free ha limiti tecnici per prevenire abusi. Se rileviamo utilizzo anomalo (vedi Privacy Policy, sezione anti-abuse), possiamo degradare silenziosamente le performance o sospendere l'account. Non blocchiamo utenti legittimi: i limiti sono progettati per fermare automazione e account multipli fraudolenti, non uso intenso genuino.

---

## 8. Licenza software

**Codice client (open source):** Il client Sonabrief — tutto ciò che gira sul tuo computer — è rilasciato sotto **AGPL v3** (Affero General Public License versione 3). Puoi usarlo, studiarlo, modificarlo e redistribuirlo secondo i termini di quella licenza. Il testo completo è disponibile nel repository: github.com/Sonabrief/sonabrief

**Licenza commerciale (Enterprise):** Le organizzazioni che necessitano di fare deployment self-hosted con modifiche senza gli obblighi di disclosure del sorgente previsti da AGPL possono acquisire una licenza commerciale separata. Questa opzione è disponibile esclusivamente nel piano Enterprise. Il dual licensing è possibile grazie al Contributor License Agreement (Harmony CLA) firmato da tutti i contributori del progetto.

**Servizi backend:** Il backend cloud (proxy LLM, storage Synced, sistema di autenticazione) non è open source. È un servizio gestito da Sonabrief accessibile tramite abbonamento.

**Template curati verticali:** I template professionali verticali curati dal team Sonabrief non sono coperti dalla licenza AGPL. I template di sistema generici inclusi nel client sono open source.

**Brand e identità visiva:** Il nome "Sonabrief", il logo, la palette e l'identità visiva del brand sono protetti come marchi. Non puoi usarli per prodotti derivati senza autorizzazione scritta.

---

## 9. Proprietà dei tuoi dati

I tuoi dati sono tuoi. Sonabrief non rivendica alcuna proprietà su audio, trascrizioni, sintesi, note o qualsiasi contenuto che produci usando il servizio.

Puoi esportare i tuoi dati in qualsiasi momento in formato standard (Markdown, PDF, Word). In modalità Synced, i tuoi dati sono cifrati end-to-end con una chiave derivata dalla tua passphrase: nemmeno noi possiamo leggerli.

---

## 10. Disponibilità del servizio

Ci impegniamo a mantenere il servizio disponibile, ma non garantiamo uptime del 100%. Il backend cloud può essere temporaneamente non disponibile per manutenzione o guasti. In caso di indisponibilità del cloud, la modalità Local Only continua a funzionare indipendentemente sul tuo computer.

Non siamo responsabili per danni derivanti da interruzioni del servizio, salvo dolo o colpa grave da parte nostra.

---

## 11. Limitazione di responsabilità

Sonabrief è uno strumento di supporto professionale, non un servizio legale, medico o finanziario. Le sintesi generate dall'AI possono contenere errori: verifica sempre il contenuto prima di usarlo in contesti professionali critici.

Nei limiti consentiti dalla legge italiana, la nostra responsabilità totale verso di te non supera quanto hai pagato per il servizio negli ultimi 12 mesi.

---

## 12. Sospensione e chiusura account

**Da parte tua:** puoi chiudere il tuo account in qualsiasi momento. Prima della chiusura definitiva puoi esportare tutti i tuoi dati. I dati sul nostro backend vengono eliminati entro 30 giorni dalla richiesta.

**Da parte nostra:** possiamo sospendere o chiudere un account in caso di violazione materiale di questi Termini (es. abuso sistematico, attività fraudolente, violazione della licenza). In caso di sospensione, ti notifichiamo via email salvo impossibilità tecnica o legale. Hai sempre il diritto di esportare i tuoi dati prima della chiusura definitiva.

---

## 13. Modifiche ai termini

Possiamo aggiornare questi Termini. In caso di modifiche sostanziali ti notifichiamo via email con almeno 14 giorni di preavviso. L'uso continuato del servizio dopo la data di entrata in vigore delle modifiche costituisce accettazione dei nuovi termini.

La versione corrente è sempre disponibile su sonabrief.com/terms.

---

## 14. Legge applicabile e foro competente

Questi Termini sono regolati dalla **legge italiana**. Per qualsiasi controversia che non si risolve amichevolmente, il foro competente è quello del domicilio del consumatore (per utenti consumer) o del Tribunale di Milano per i rapporti B2B.

Per le controversie con consumatori residenti nell'UE, puoi anche accedere alla piattaforma ODR della Commissione Europea: ec.europa.eu/consumers/odr

---

## 15. Contatti

Per qualsiasi domanda su questi Termini: **hello@sonabrief.com**

Sonabrief · sonabrief.com · Maggio 2026

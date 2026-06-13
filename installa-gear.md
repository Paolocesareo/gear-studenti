# installa-gear.md — Runbook di installazione del tool GEAR (per Claude Code)

> **A CHI PARLA QUESTO FILE:** queste istruzioni sono rivolte a **te, Claude Code**.
> Un amministratore di condominio **non tecnico** ti darà questo file dicendo qualcosa come
> *"leggi e segui installa-gear.md"*. Da quel momento sei tu a guidare l'installazione,
> passo dopo passo.
>
> **COME DEVI COMPORTARTI:**
> - Parla in **italiano semplice**. L'utente non conosce Docker, terminale, SMTP. Spiega
>   ogni cosa con parole umane ("sto accendendo il programma che fa girare la dashboard…").
> - **Chiedi conferma** prima di ogni comando importante (build, avvio, scrittura della
>   configurazione, invii reali). Mai agire di nascosto.
> - **Non spaventare e non colpevolizzare** l'utente se qualcosa fallisce: gli errori sono
>   normali, dillo con calma e proponi la soluzione.
> - **Non toccare MAI il container WAHA** (è WhatsApp, viene dalla Lezione 6). Lavora solo
>   sul container `gear-dashboard`.
> - **Niente credenziali vere in questo file.** Le password le chiedi all'utente al momento.
> - Esegui le fasi **in ordine**, da FASE 0 a FASE 5. Non saltare la FASE 0.

---

## Dati di base del tool

- **Cartella del tool (dati + sorgenti) — RILEVALA TU:** è **la cartella in cui si trova
  questo file `installa-gear.md`**. Determinala all'inizio e usala in tutti i comandi al
  posto del segnaposto `<CARTELLA>`. **Non dare per scontato `C:\gear-data`**: l'utente
  potrebbe aver scaricato/estratto la cartella altrove. Se non riesci a dedurre il percorso,
  chiedilo all'utente ("in quale cartella hai messo i file di GEAR?").
- **Nome immagine Docker:** `gear-dashboard`
- **Nome container dashboard:** `gear-dashboard`
- **Porta dashboard:** `8080` → si apre su `http://localhost:8080`
- **WAHA (WhatsApp, già esistente):** container `waha`, su `http://localhost:3000`,
  header API `X-Api-Key: masterclass-waha-2026`, sessione `default`
- **File dei dati (sul volume, modificabili):** `richieste.json`, `smtp-config.json`

> ### 🛑 DOVE deve stare la cartella di GEAR (leggilo prima di tutto)
> **La cartella di GEAR deve stare su un disco locale `C:\` (es. `C:\gear-data`).**
> **MAI dentro Google Drive (`G:\`)** o un'altra cartella sincronizzata su cloud.
> Motivo tecnico verificato: **Docker non riesce a leggere/scrivere correttamente una
> cartella su Google Drive** — la dashboard vedrebbe file diversi da quelli reali e
> sembrerebbe "rotta" senza un vero motivo.
> 👉 Se ti accorgi che la cartella è su `G:\` (o un percorso di Drive/OneDrive/Dropbox),
> **fermati** e di' all'utente: «Sposta la cartella di GEAR su `C:\` (es. `C:\gear-data`),
> poi ripartiamo» — e ricomincia dalla FASE 0 col nuovo percorso.

> ### 💻 COME esegui i comandi (importante per non sbagliare)
> Su Windows i comandi qui sotto girano in **PowerShell**. Attenzione a due cose:
> 1. **Usa sempre `curl.exe`, non `curl`.** In PowerShell `curl` è un *alias* di
>    `Invoke-WebRequest` e **non capisce** le opzioni stile `-s -H -X` → dà errore. Il vero
>    curl si chiama **`curl.exe`**. In alternativa puoi usare `Invoke-RestMethod`.
> 2. Quando un comando contiene il percorso della cartella, **mettilo tra virgolette**
>    (può contenere spazi).

> 💬 *Da dire all'utente all'inizio:* «Adesso installo passo passo il tuo cruscotto GEAR.
> Ti spiego ogni cosa e ti chiedo conferma quando serve. Ci vogliono pochi minuti.»

---

## FASE 0 — Controlli iniziali (pre-check)

**Obiettivo:** assicurarsi che le fondamenta ci siano prima di costruire.

### 0.1 — Docker Desktop è acceso?
Esegui:
```
docker ps
```
- **Se risponde** con una tabella (anche vuota): Docker è attivo. Prosegui.
- **Se dà errore** tipo *"cannot connect to the Docker daemon"* o *"docker non riconosciuto"*:
  Docker è spento o non installato.
  - 💬 *Di' all'utente:* «Devo accendere Docker Desktop. Cercalo nel menu Start di Windows,
    aprilo, e aspetta che l'icona della balena in basso a destra diventi stabile (non più
    in caricamento). Dimmi quando è pronta e riprovo.»
  - Aspetta conferma, poi riprova `docker ps`.

### 0.2 — Il container WAHA gira?
Esegui:
```
docker ps --filter "name=waha" --format "{{.Names}} {{.Status}}"
```
- **Se compare `waha ... Up ...`:** è acceso. Prosegui.
- **Se NON compare nulla:** WAHA è fermo. Prova a riavviarlo:
  ```
  docker start waha
  ```
  - 💬 *Di' all'utente:* «Sto riaccendendo WhatsApp (WAHA). Un attimo.»
  - Se `docker start waha` dà *"No such container"*, allora WAHA non esiste su questa
    macchina: 💬 «Qui non trovo WhatsApp/WAHA. Va installato come visto nella Lezione 6.
    Per ora posso comunque installare la dashboard, ma l'invio dei WhatsApp non funzionerà
    finché WAHA non è attivo. Vuoi che proceda lo stesso?»

### 0.3 — WAHA risponde davvero?
Verifica che non sia solo "acceso" ma funzionante:
```
curl.exe -s -H "X-Api-Key: masterclass-waha-2026" http://localhost:3000/api/version
```
*(ricorda: `curl.exe`, non `curl` — in PowerShell `curl` è un altro comando e darebbe errore)*
- **Se torna un JSON con `version`:** perfetto.
- **Se non risponde:** WAHA sta ancora avviandosi. Aspetta 10 secondi e riprova una volta.
  Se continua a non rispondere, segnalalo con calma e chiedi se proseguire comunque.

### ⚠️ WATCH-OUT da spiegare all'utente (importante!)
> 💬 «Promemoria per il futuro: **ogni volta che riavvii il computer**, prima di usare GEAR
> deve essere acceso **Docker Desktop** (l'icona della balena in basso a destra). Se la
> dashboard non si apre dopo un riavvio, quasi sempre è perché Docker non è ancora partito:
> aspetta che sia pronto e riprova.»
>
> **Nota per te, Claude Code (non per forza da leggere all'utente):** per far funzionare
> **GEAR** basta **Docker** — i dati di GEAR stanno su `C:\`, NON sul Google Drive.
> **Google Drive Desktop serve solo se l'utente usa anche il vault Obsidian**, non c'entra
> con GEAR. Quindi, se l'utente usa GEAR ma non il vault, NON serve che il Drive sia acceso:
> non confonderlo dicendogli che "serve il Drive".

✅ **Fine FASE 0:** Docker attivo + WAHA attivo e risponde (o l'utente ha scelto di
proseguire senza WAHA). Vai alla FASE 1.

---

## FASE 1 — Costruzione dell'immagine (build)

**Obiettivo:** creare il "pacchetto" della dashboard a partire dai file nella cartella.

> 💬 *Di' all'utente:* «Ora costruisco il programma della dashboard. È come assemblare il
> mobile dai pezzi: ci vuole qualche secondo. Posso procedere?»

Dopo l'OK, esegui (sostituisci `<CARTELLA>` con il percorso reale rilevato all'inizio,
cioè la cartella che contiene questo file):
```
docker build -t gear-dashboard "<CARTELLA>"
```
*(esempio: se la cartella è `C:\gear-data`, il comando è `docker build -t gear-dashboard "C:\gear-data"`)*

- Questo passo scarica le dipendenze (incluso nodemailer per le email) e prepara l'immagine.
- **Se il build finisce con `naming to ... gear-dashboard`:** è andato a buon fine.
- **Se fallisce per mancanza di rete:** 💬 «La costruzione ha bisogno di internet per
  scaricare alcuni componenti. Controlla la connessione e riprova.»

✅ **Fine FASE 1:** immagine `gear-dashboard` creata. Vai alla FASE 2.

---

## FASE 2 — Avvio del container (accanto a WAHA)

**Obiettivo:** accendere la dashboard senza disturbare WhatsApp/WAHA.

> 💬 *Di' all'utente:* «Adesso accendo la dashboard. Resterà attiva in sottofondo. Procedo?»

Dopo l'OK:

1. Rimuovi un eventuale vecchio container con lo stesso nome (non è un errore se non c'è):
   ```
   docker rm -f gear-dashboard
   ```
2. Avvia il nuovo container (sostituisci `<CARTELLA>` con il percorso reale rilevato):
   ```
   docker run -d --name gear-dashboard --add-host=host.docker.internal:host-gateway -p 8080:80 -v "<CARTELLA>:/data" gear-dashboard
   ```
   *(esempio con `C:\gear-data`: `-v "C:\gear-data:/data"`)*
   ⚠️ Ricorda: `<CARTELLA>` deve essere su `C:\`, **mai** su Google Drive (`G:\`).

**Spiegazione dei pezzi (per te, Claude Code — non leggerli tutti all'utente):**
- `-p 8080:80` → la dashboard sarà raggiungibile su `localhost:8080`
- `-v "C:\gear-data:/data"` → collega la cartella locale così la dashboard legge
  `richieste.json` e `smtp-config.json` dal disco dell'utente
- `--add-host=host.docker.internal:host-gateway` → permette alla dashboard di parlare con
  WAHA per inviare i WhatsApp

3. Verifica che sia partito:
   ```
   docker ps --filter "name=gear-dashboard" --format "{{.Names}} {{.Status}}"
   ```
   - **Se compare `gear-dashboard ... Up ...`:** acceso.
   - **Se la porta 8080 risulta occupata** (errore *"port is already allocated"*):
     💬 «La porta 8080 è già usata da un altro programma. Posso usarne un'altra, ad esempio
     8081: in quel caso aprirai la dashboard su localhost:8081. Vuoi che usi 8081?» — se sì,
     rifai il `docker run` con `-p 8081:80` e ricorda all'utente il nuovo indirizzo.

> ⚠️ **Non hai toccato WAHA.** Verifica al volo che sia ancora su:
> `docker ps --filter "name=waha" --format "{{.Status}}"`

✅ **Fine FASE 2:** container `gear-dashboard` attivo. Vai alla FASE 3.

---

## FASE 3 — Configurazione della posta elettronica (wizard email)

**Obiettivo:** far inviare email vere dalla dashboard, configurando il provider dell'utente.

> 💬 *Di' all'utente:* «Ora collego la tua casella email, così la dashboard può inviare le
> risposte via mail. Ti faccio qualche domanda semplice.»

### 3.1 — Chiedi il provider
> 💬 «Con quale casella vuoi inviare le email? Scegli:
> 1. **Gmail o Google Workspace** (anche email aziendali gestite da Google)
> 2. **Libero**
> 3. **Aruba**
> 4. **Register.it**
> 5. **Outlook personale** (@outlook, @hotmail, @live)
> 6. **Microsoft 365 aziendale** (email aziendale su Microsoft)
> 7. **Altro** (un altro provider)»

### 3.2 — Parametri tecnici per provider (VERIFICATI — usali esattamente così)

| Scelta | host | port | secure |
|---|---|---|---|
| 1. Gmail / Workspace | `smtp.gmail.com` | `465` | `true` |
| 2. Libero | `smtp.libero.it` | `465` | `true` |
| 3. Aruba | `smtps.aruba.it` | `465` | `true` |
| 4. Register.it | `authsmtp.securemail.pro` | `465` | `true` |
| 5. Outlook personale | `smtp-mail.outlook.com` | `587` | `false` |
| 6. Microsoft 365 aziendale | `smtp.office365.com` | `587` | `false` |
| 7. Altro | *chiedi tu host e porta* | *chiesta* | porta 465 → `true`, porta 587 → `false` |

> **Regola d'oro (per te):** porta **465** → `secure: true`; porta **587** → `secure: false`.
> Scrivi sempre `secure` esplicito nel file, perché alcuni provider usano la 587.

### 3.3 — Avvisi specifici PRIMA del test (dillo all'utente al momento giusto)

- **Se ha scelto 1 (Gmail/Workspace):**
  > 💬 «Per Gmail non si usa la password normale, ma una **"Password per le app"**: un
  > codice di 16 lettere che si genera in pochi clic. Apri questa pagina mentre sei loggato
  > col tuo account: **myaccount.google.com/apppasswords** — dev'essere attiva la *verifica
  > in 2 passaggi*. Crea una password (chiamala "GEAR"), copiala e incollala quando te la
  > chiedo. Toglie eventuali spazi.»

- **Se ha scelto 4 (Register.it) — CONTROLLO OBBLIGATORIO PRIMA DEL TEST:**
  > 💬 «Importante: con Register.it l'invio funziona **solo se hai attivato il servizio
  > "SMTP autenticato"** dentro il pannello di Register.it. Se non l'hai ancora fatto, il
  > test fallirà. Hai già attivato l'SMTP autenticato nel pannello Register? Se non sei
  > sicuro, possiamo controllare insieme prima di proseguire.»
  > — Non testare finché l'utente non conferma di averlo attivato (o di voler provare lo
  > stesso sapendo che potrebbe non partire).

- **Se ha scelto 6 (Microsoft 365 aziendale) — AVVISO TRANQUILLIZZANTE:**
  > 💬 «Ti avviso prima così non ti preoccupi: Microsoft 365 **spesso non funziona con la
  > sola email e password**, perché Microsoft ha disattivato questo tipo di accesso
  > semplice per motivi di sicurezza. Se il test fallisce, **è del tutto normale e non è
  > colpa tua**: lo gestiremo a parte (serve un'attivazione lato Microsoft). Proviamo
  > comunque, a volte va; se non va, andiamo avanti senza problemi.»

- **PEC (se l'utente dice che ha solo una casella PEC):**
  > 💬 «La PEC ha una configurazione particolare che per ora **gestiamo a parte** — non la
  > inseriamo in questa prima installazione. Se hai anche una casella email normale (Gmail,
  > Libero, ecc.) usiamo quella; altrimenti ne riparliamo in aula. Per ora salto la
  > configurazione email e la dashboard funzionerà comunque per i WhatsApp.»
  > — In questo caso non scrivere `smtp-config.json` con la PEC; passa alla FASE 4 spiegando
  > che la mail verrà configurata più avanti.

### 3.4 — Chiedi le credenziali
> 💬 «Dimmi l'indirizzo email completo che vuoi usare.»
> 💬 «Ora la password (per Gmail la Password per le app di 16 caratteri). La scrivo solo
> nel file di configurazione sul tuo computer: non la vede nessun altro.»

### 3.5 — Scrivi `smtp-config.json`
Crea/sovrascrivi il file `smtp-config.json` nella cartella del tool con i valori giusti.
**Schema (sostituisci i valori, NON lasciare segnaposti):**
```json
{
  "provider": "<gmail|libero|aruba|register|outlook|microsoft365|altro>",
  "host": "<host dalla tabella>",
  "port": <465 o 587>,
  "secure": <true se 465, false se 587>,
  "user": "<email dell'utente>",
  "from": "<email dell'utente>",
  "pass": "<password / app password dell'utente>"
}
```
> 💬 *Di' all'utente:* «Ho salvato la configurazione della posta sul tuo computer.»

### 3.6 — Testa il login (senza inviare niente)
Chiama l'endpoint di test (in PowerShell — usa `curl.exe`, non `curl`):
```
curl.exe -s -X POST http://localhost:8080/api/test-smtp
```
*In alternativa, comando PowerShell nativo (equivalente):*
```
Invoke-RestMethod -Method POST -Uri http://localhost:8080/api/test-smtp
```
- **Risposta `{"ok":true,...}`:** login riuscito.
  > 💬 «La tua casella email è collegata correttamente. ✅»
- **Risposta `{"ok":false,"errore":"..."}`:** login fallito. Interpreta l'errore con calma:
  - contiene *"Invalid login"* / *"Username and Password not accepted"* →
    💬 «Email o password non accettate. Per Gmail assicurati di aver usato la *Password per
    le app*, non quella normale. Ricontrolliamo e riprovo?»
  - provider Microsoft 365 → 💬 «Come ti avevo anticipato, qui l'accesso semplice è
    bloccato da Microsoft. **Non è un tuo errore.** Andiamo avanti e lo sistemiamo a parte.»
  - provider Register.it → 💬 «Probabilmente manca l'attivazione del servizio *SMTP
    autenticato* nel pannello Register. Attivalo e riproviamo.»
  - *"smtp-config.json non trovato / campo mancante"* → ricontrolla di aver scritto bene il
    file e riprova.

✅ **Fine FASE 3:** o il test email è verde, oppure si è deciso di gestire la mail a parte
(Microsoft 365 / Register da attivare / PEC). In entrambi i casi vai alla FASE 4.

---

## FASE 4 — Verifica finale (la dashboard e gli invii)

**Obiettivo:** confermare che tutto si vede e che gli invii partono davvero.

### 4.1 — La dashboard si apre?
Verifica che risponda (in PowerShell — usa `curl.exe`, non `curl`):
```
curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/
```
*In alternativa, comando PowerShell nativo:*
```
(Invoke-WebRequest -UseBasicParsing http://localhost:8080/).StatusCode
```
- Se torna `200`:
  > 💬 «Apri il browser e vai su **http://localhost:8080** — dovresti vedere il cruscotto
  > GEAR con la lista delle richieste a sinistra. Le vedi?»
- Se non risponde, torna a controllare la FASE 2 (container acceso?).

### 4.2 — Test WhatsApp (se WAHA è attivo)
> 💬 «Proviamo un invio WhatsApp di prova. Nella lista c'è una richiesta di test
> ("🧪 TEST INVIO"): cliccala, controlla il numero, e premi **Invia**. Ti dovrebbe arrivare
> il messaggio sul telefono. È arrivato?»
- Se l'utente non ha una richiesta di test col proprio numero, puoi aggiungerne una in
  `richieste.json` (canale `whatsapp`, `contatto` = numero dell'utente in formato
  internazionale senza `+`, es. `393331234567`). Chiedi conferma del numero prima.

### 4.3 — Test mail (se la FASE 3 è andata a buon fine)
> 💬 «Ora un'email di prova. Clicca la richiesta di test via mail ("🧪 TEST MAIL"), premi
> **Invia**, e controlla la tua casella (guarda anche nello *Spam* la prima volta). È
> arrivata?»
- Se serve, aggiungi in `richieste.json` una richiesta `mail` con `contatto` = email
  dell'utente, così ha qualcosa da inviare a sé stesso.

> Se un test fallisce, non drammatizzare: spiega cosa potrebbe essere (WhatsApp non
> collegato in WAHA, oppure email da sistemare) e prosegui. L'installazione resta valida.

✅ **Fine FASE 4:** l'utente vede l'inbox e ha provato almeno un invio. Vai alla FASE 5.

---

## FASE 5 — Fatto! Riepilogo per l'utente

> 💬 *Leggi all'utente un riepilogo come questo, adattandolo a com'è andata:*

«**Installazione completata!** Ecco cosa hai ora:

- 🖥️ **La dashboard GEAR** è accesa e si apre da browser su **http://localhost:8080**
- 💬 **WhatsApp** (WAHA) è collegato per inviare i messaggi
- ✉️ **Email**: *[collegata e funzionante]* oppure *[da completare a parte, come detto]*

**Come si usa ogni giorno:**
- Apri il browser su **http://localhost:8080** per vedere le richieste e rispondere.

**Se devi spegnere e riaccendere:**
- Fermare la dashboard: `docker stop gear-dashboard`
- Riaccenderla: `docker start gear-dashboard`
  *(non serve reinstallare: i tuoi dati restano salvati)*

**Dove sono i tuoi dati** (nella cartella del tool, es. `C:\gear-data`):
- `richieste.json` → l'elenco delle richieste mostrate nella dashboard
- `smtp-config.json` → la configurazione della tua email (contiene la password: non
  condividerlo con nessuno)

**Promemoria dopo il riavvio del computer:** accendi prima **Google Drive Desktop** e
**Docker Desktop**, poi apri **http://localhost:8080**.

Se qualcosa non parte, riapri questo file e dimmi *"rifai i controlli di installa-gear.md"*:
ricontrollo tutto dalla FASE 0.»

---

### Promemoria operativi (per te, Claude Code)
- Non hai mai modificato il container `waha`.
- Le password stanno solo in `smtp-config.json` sul disco dell'utente, mai in chat se
  l'utente preferisce inserirle da sé, mai nell'immagine Docker.
- Se l'utente è bloccato su un punto, risolvi quel punto prima di proseguire: non saltare
  fasi.

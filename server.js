// GEAR dashboard - mini server senza dipendenze (solo moduli built-in Node)
// STEP 1: serve la dashboard e legge richieste.json dal volume montato.
//         I bottoni Invia/Salta per ora LOGGANO soltanto, nessun invio reale.

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PORT = 80;
const DATA_FILE = '/data/richieste.json';  // volume: C:\gear-data -> /data
const SMTP_FILE = '/data/smtp-config.json'; // credenziali SMTP, SOLO sul volume
const APP_DIR = '/app';                     // file dell'app, dentro l'immagine

// Legge la config SMTP dal volume (mai hardcoded). Lancia errore parlante se manca.
function leggiSmtpConfig() {
  let raw;
  try { raw = fs.readFileSync(SMTP_FILE, 'utf8'); }
  catch (e) { throw new Error('smtp-config.json non trovato in C:\\gear-data'); }
  let c;
  try { c = JSON.parse(raw); }
  catch (e) { throw new Error('smtp-config.json non e\' un JSON valido'); }
  for (const campo of ['host', 'port', 'user', 'pass']) {
    if (!c[campo]) throw new Error('smtp-config.json: campo mancante "' + campo + '"');
  }
  return c;
}

// Crea un transporter nodemailer dalla config corrente (riletta a ogni chiamata).
function creaTransporter() {
  const c = leggiSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure !== false, // true per 465 (default sicuro)
    auth: { user: c.user, pass: c.pass }
  });
  return { transporter, cfg: c };
}

// --- Config WAHA (l'API key vive SOLO qui, lato server, mai nel browser) ---
const WAHA_HOST = 'host.docker.internal';
const WAHA_PORT = 3000;
const WAHA_KEY = 'masterclass-waha-2026';
const WAHA_SESSION = 'default';

// Normalizza un numero in chatId WAHA: "393737522136" -> "393737522136@c.us"
function toChatId(numero) {
  const digits = String(numero).replace(/[^0-9]/g, '');
  return digits + '@c.us';
}

// Inoltra un testo a WAHA via POST /api/sendText. Ritorna una Promise.
function inviaWaha(numero, testo) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      session: WAHA_SESSION,
      chatId: toChatId(numero),
      text: testo
    });
    const opt = {
      host: WAHA_HOST, port: WAHA_PORT, path: '/api/sendText', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': WAHA_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const r = http.request(opt, (resp) => {
      let body = '';
      resp.on('data', c => (body += c));
      resp.on('end', () => resolve({ status: resp.statusCode, body }));
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // --- API: elenco richieste (legge dal volume montato) ---
  if (req.method === 'GET' && url === '/api/richieste') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ errore: 'Impossibile leggere richieste.json', dettaglio: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // --- STEP 1: i bottoni loggano soltanto (nessun invio reale) ---
  if (req.method === 'POST' && url === '/api/log') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      console.log('[GEAR][azione]', body);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, nota: 'STEP1: solo log, nessun invio reale' }));
    });
    return;
  }

  // --- SALVA STATO: marca una richiesta come "gestita" e persiste su /data ---
  if (req.method === 'POST' && url === '/api/stato') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const id = dati.id;
      const nuovoStato = dati.stato || 'gestita';
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'id obbligatorio' }));
        return;
      }
      fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Impossibile leggere richieste.json', dettaglio: err.message }));
          return;
        }
        let lista;
        try { lista = JSON.parse(data); }
        catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'richieste.json non e\' un JSON valido' }));
          return;
        }
        const r = lista.find(x => x.id === id);
        if (!r) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'richiesta non trovata: ' + id }));
          return;
        }
        r.stato = nuovoStato;
        fs.writeFile(DATA_FILE, JSON.stringify(lista, null, 2), 'utf8', (werr) => {
          if (werr) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, errore: 'Impossibile salvare richieste.json', dettaglio: werr.message }));
            return;
          }
          console.log('[GEAR][stato]', id, '->', nuovoStato);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, id: id, stato: nuovoStato }));
        });
      });
    });
    return;
  }

  // --- INVIO REALE WhatsApp via WAHA ---
  if (req.method === 'POST' && url === '/api/invia') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const { numero, testo } = dati;
      if (!numero || !testo) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'numero e testo sono obbligatori' }));
        return;
      }
      try {
        const esito = await inviaWaha(numero, testo);
        const ok = esito.status >= 200 && esito.status < 300;
        console.log('[GEAR][invia]', numero, '-> WAHA', esito.status, ok ? 'OK' : esito.body);
        res.writeHead(ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok, status: esito.status, rispostaWaha: esito.body }));
      } catch (e) {
        console.error('[GEAR][invia] errore rete verso WAHA:', e.message);
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'WAHA non raggiungibile: ' + e.message }));
      }
    });
    return;
  }

  // --- TEST connessione SMTP (login senza inviare) ---
  if (req.method === 'POST' && url === '/api/test-smtp') {
    (async () => {
      try {
        const { transporter, cfg } = creaTransporter();
        await transporter.verify(); // autentica senza spedire
        console.log('[GEAR][test-smtp] OK come', cfg.user);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, user: cfg.user, host: cfg.host }));
      } catch (e) {
        console.error('[GEAR][test-smtp] errore:', e.message);
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: e.message }));
      }
    })();
    return;
  }

  // --- INVIO MAIL REALE via SMTP ---
  if (req.method === 'POST' && url === '/api/invia-mail') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const { destinatario, oggetto, testo } = dati;
      if (!destinatario || !testo) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'destinatario e testo sono obbligatori' }));
        return;
      }
      try {
        const { transporter, cfg } = creaTransporter();
        const info = await transporter.sendMail({
          from: cfg.from || cfg.user,
          to: destinatario,
          subject: oggetto || '(senza oggetto)',
          text: testo
        });
        console.log('[GEAR][invia-mail]', destinatario, '-> OK', info.messageId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, messageId: info.messageId, accepted: info.accepted }));
      } catch (e) {
        console.error('[GEAR][invia-mail] errore:', e.message);
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: e.message }));
      }
    });
    return;
  }

  // --- File statici dell'app ---
  const file = url === '/' ? '/index.html' : url;
  const full = path.join(APP_DIR, file);
  if (!full.startsWith(APP_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('GEAR dashboard in ascolto su :' + PORT));

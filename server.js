const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const PORT           = 80;
const DATA_FILE      = '/data/richieste.json';
const SMTP_FILE      = '/data/smtp-config.json';
const GMAIL_FILE     = '/data/gmail-config.json';
const QUEUE_FILE     = '/data/email-queue.json';
const APP_DIR        = '/app';

// ─── GMAIL CONFIG ─────────────────────────────────────────────────────────────

function leggiGmailConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(GMAIL_FILE, 'utf8'));
    return (c.user && c.app_password) ? c : null;
  } catch (e) { return null; }
}

function salvaGmailConfig(cfg) {
  fs.writeFileSync(GMAIL_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// ─── EMAIL QUEUE (buffer server → client Supabase) ────────────────────────────

function leggiQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); }
  catch (e) { return []; }
}

function salvaQueue(q) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2), 'utf8');
}

// ─── SMTP CONFIG (gmail-config.json ha precedenza su smtp-config.json) ────────

function leggiSmtpConfig() {
  const g = leggiGmailConfig();
  if (g) {
    return { host: 'smtp.gmail.com', port: 465, secure: true,
             user: g.user, from: g.user, pass: g.app_password };
  }
  let raw;
  try { raw = fs.readFileSync(SMTP_FILE, 'utf8'); }
  catch (e) { throw new Error('smtp-config.json non trovato in C:\\gear-data'); }
  let c;
  try { c = JSON.parse(raw); }
  catch (e) { throw new Error('smtp-config.json non è un JSON valido'); }
  for (const campo of ['host', 'port', 'user', 'pass']) {
    if (!c[campo]) throw new Error('smtp-config.json: campo mancante "' + campo + '"');
  }
  return c;
}

function creaTransporter() {
  const c = leggiSmtpConfig();
  return {
    transporter: nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure !== false,
      auth: { user: c.user, pass: c.pass }
    }),
    cfg: c
  };
}

// ─── WAHA (WhatsApp) ──────────────────────────────────────────────────────────

const WAHA_HOST    = 'host.docker.internal';
const WAHA_PORT    = 3000;
const WAHA_KEY     = 'masterclass-waha-2026';
const WAHA_SESSION = 'default';

function toChatId(numero) {
  return String(numero).replace(/[^0-9]/g, '') + '@c.us';
}

function inviaWaha(numero, testo) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      session: WAHA_SESSION, chatId: toChatId(numero), text: testo
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

// ─── IMAP POLLING ─────────────────────────────────────────────────────────────

let imapPollingAttivo = false;

async function pollImap() {
  const cfg = leggiGmailConfig();
  if (!cfg) return;

  let client;
  try {
    const { ImapFlow } = await import('imapflow');
    client = new ImapFlow({
      host: 'imap.gmail.com', port: 993, secure: true,
      auth: { user: cfg.user, pass: cfg.app_password },
      logger: false
    });
    await client.connect();

    const queue   = leggiQueue();
    const seenIds = new Set(queue.map(m => m.messageId).filter(Boolean));
    let aggiunte  = 0;

    const lock = await client.getMailboxLock(cfg.casella || 'INBOX');
    try {
      const nonLette = await client.search({ seen: false });
      if (nonLette.length > 0) {
        for await (const msg of client.fetch(nonLette, { envelope: true, source: true })) {
          const msgId = msg.envelope?.messageId;
          if (msgId && seenIds.has(msgId)) continue;

          const parsed = await simpleParser(msg.source);
          const from   = msg.envelope?.from?.[0];
          const nome   = from?.name || from?.address || 'Sconosciuto';
          const email  = from?.address || '';
          const testo  = (parsed.text || '').trim()
                      || (parsed.html || '').replace(/<[^>]+>/g, ' ').trim()
                      || '(testo vuoto)';

          queue.push({
            id:        'MAIL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            canale:    'mail',
            mittente:  nome,
            contatto:  email,
            oggetto:   msg.envelope?.subject || '(senza oggetto)',
            testo,
            categoria: null,
            fornitore_suggerito: null,
            urgenza:   'media',
            bozza:     null,
            stato:     'aperta',
            messageId: msgId
          });
          aggiunte++;
          await client.messageFlagsAdd(msg.seq, ['\\Seen']);
        }
      }
    } finally {
      lock.release();
    }

    if (aggiunte > 0) {
      salvaQueue(queue);
      console.log('[GEAR][imap] +' + aggiunte + ' email in coda');
    }
    await client.logout();
  } catch (e) {
    console.error('[GEAR][imap] errore:', e.responseText || e.serverResponseCode || e.message, e.stack ? e.stack.split('\n')[1] : '');
    try { if (client) await client.logout(); } catch (_) {}
  }
}

function avviaImapPolling() {
  if (imapPollingAttivo) return;
  const cfg = leggiGmailConfig();
  if (!cfg) return;
  imapPollingAttivo = true;
  console.log('[GEAR][imap] polling attivo per', cfg.user, '(ogni 60s)');
  pollImap();
  setInterval(pollImap, 60_000);
}

avviaImapPolling();

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // --- Configura Gmail (SMTP + IMAP) ---
  if (req.method === 'POST' && url === '/api/config-gmail') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const { user, app_password } = dati;
      if (!user || !app_password) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'user e app_password obbligatori' }));
        return;
      }
      try {
        salvaGmailConfig({ user, app_password, casella: 'INBOX' });
        avviaImapPolling();
        pollImap();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: e.message }));
      }
    });
    return;
  }

  // --- Stato Gmail ---
  if (req.method === 'GET' && url === '/api/gmail-status') {
    const cfg = leggiGmailConfig();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ configurata: !!cfg, user: cfg?.user || null }));
    return;
  }

  // --- Test connessione IMAP ---
  if (req.method === 'POST' && url === '/api/test-imap') {
    (async () => {
      const cfg = leggiGmailConfig();
      if (!cfg) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'Gmail non configurata' }));
        return;
      }
      let client;
      try {
        const { ImapFlow } = await import('imapflow');
        client = new ImapFlow({
          host: 'imap.gmail.com', port: 993, secure: true,
          auth: { user: cfg.user, pass: cfg.app_password },
          logger: false
        });
        await client.connect();
        await client.logout();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, user: cfg.user }));
      } catch (e) {
        try { if (client) await client.logout(); } catch (_) {}
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: e.message }));
      }
    })();
    return;
  }

  // --- Coda email IMAP → Supabase ---
  if (req.method === 'GET' && url === '/api/email-queue') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(leggiQueue()));
    return;
  }

  // --- ACK email elaborate ---
  if (req.method === 'POST' && url === '/api/email-queue/ack') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const ids = new Set(Array.isArray(dati.ids) ? dati.ids : []);
      const rimaste = leggiQueue().filter(m => !ids.has(m.id));
      salvaQueue(rimaste);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, rimaste: rimaste.length }));
    });
    return;
  }

  // --- Elenco richieste (JSON locale, fallback legacy) ---
  if (req.method === 'GET' && url === '/api/richieste') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ errore: 'Impossibile leggere richieste.json' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // --- Log azione ---
  if (req.method === 'POST' && url === '/api/log') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      console.log('[GEAR][azione]', body);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // --- Salva stato richiesta (JSON locale, fallback legacy) ---
  if (req.method === 'POST' && url === '/api/stato') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const { id, stato: nuovoStato = 'gestita' } = dati;
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'id obbligatorio' }));
        return;
      }
      fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'Impossibile leggere richieste.json' }));
          return;
        }
        let lista;
        try { lista = JSON.parse(data); } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'richieste.json non valido' }));
          return;
        }
        const r = lista.find(x => x.id === id);
        if (!r) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, errore: 'non trovata: ' + id }));
          return;
        }
        r.stato = nuovoStato;
        fs.writeFile(DATA_FILE, JSON.stringify(lista, null, 2), 'utf8', (werr) => {
          if (werr) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, errore: 'Impossibile salvare' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, id, stato: nuovoStato }));
        });
      });
    });
    return;
  }

  // --- Invio WhatsApp via WAHA ---
  if (req.method === 'POST' && url === '/api/invia') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const { numero, testo } = dati;
      if (!numero || !testo) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'numero e testo obbligatori' }));
        return;
      }
      try {
        const esito = await inviaWaha(numero, testo);
        const ok    = esito.status >= 200 && esito.status < 300;
        console.log('[GEAR][invia]', numero, '-> WAHA', esito.status);
        res.writeHead(ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok, status: esito.status, rispostaWaha: esito.body }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'WAHA non raggiungibile: ' + e.message }));
      }
    });
    return;
  }

  // --- Test SMTP ---
  if (req.method === 'POST' && url === '/api/test-smtp') {
    (async () => {
      try {
        const { transporter, cfg } = creaTransporter();
        await transporter.verify();
        console.log('[GEAR][test-smtp] OK come', cfg.user);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, user: cfg.user, host: cfg.host }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: e.message }));
      }
    })();
    return;
  }

  // --- Invio email via SMTP ---
  if (req.method === 'POST' && url === '/api/invia-mail') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      let dati;
      try { dati = JSON.parse(body || '{}'); } catch (e) { dati = {}; }
      const { destinatario, oggetto, testo } = dati;
      if (!destinatario || !testo) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: 'destinatario e testo obbligatori' }));
        return;
      }
      try {
        const { transporter, cfg } = creaTransporter();
        const info = await transporter.sendMail({
          from: cfg.from || cfg.user, to: destinatario,
          subject: oggetto || '(senza oggetto)', text: testo
        });
        console.log('[GEAR][invia-mail]', destinatario, '->', info.messageId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, messageId: info.messageId }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, errore: e.message }));
      }
    });
    return;
  }

  // --- File statici ---
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

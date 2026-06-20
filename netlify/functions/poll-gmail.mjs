import { ImapFlow }    from 'imapflow';
import { simpleParser } from 'mailparser';
import { makeSupabase } from './_supabase.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!jwt) return Response.json({ ok: false, errore: 'Non autenticato' }, { status: 401 });

  const supabase = makeSupabase(jwt);

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ ok: false, errore: 'Sessione non valida' }, { status: 401 });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('gmail_user, gmail_app_password')
    .single();

  if (!settings?.gmail_user || !settings?.gmail_app_password) {
    return Response.json({ ok: true, inserite: 0, nota: 'Gmail non configurata' });
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: settings.gmail_user, pass: settings.gmail_app_password },
    logger: false
  });

  let inserite = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const tutteNonLette = await client.search({ seen: false });
      const nonLette = tutteNonLette.slice(-20);
      if (nonLette.length > 0) {
        for await (const msg of client.fetch(nonLette, { envelope: true, source: true })) {
          const parsed = await simpleParser(msg.source);
          const from   = msg.envelope?.from?.[0];

          const { error } = await supabase.from('richieste').insert({
            id:        'MAIL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            user_id:   user.id,
            canale:    'mail',
            mittente:  from?.name || from?.address || 'Sconosciuto',
            contatto:  from?.address || '',
            oggetto:   msg.envelope?.subject || '(senza oggetto)',
            testo:     (parsed.text || '').trim() || (parsed.html || '').replace(/<[^>]+>/g, ' ').trim() || '(vuoto)',
            urgenza:   'media',
            stato:     'aperta'
          });

          if (!error) {
            await client.messageFlagsAdd(msg.seq, ['\\Seen']);
            inserite++;
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch (_) {}
    return Response.json({ ok: false, errore: e.message }, { status: 500 });
  }

  return Response.json({ ok: true, inserite });
}

import { makeSupabase } from './_supabase.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!jwt) return Response.json({ ok: false, errore: 'Non autenticato' }, { status: 401 });

  const supabase = makeSupabase(jwt);
  const { data: settings } = await supabase
    .from('user_settings').select('waha_host, waha_key').single();

  if (!settings?.waha_host) {
    return Response.json({ ok: false, errore: 'WAHA non configurato (richiede URL pubblico)' }, { status: 400 });
  }

  const { numero, testo } = await req.json();
  const chatId  = String(numero).replace(/[^0-9]/g, '') + '@c.us';
  const wahaUrl = settings.waha_host.replace(/\/$/, '') + '/api/sendText';

  try {
    const resp = await fetch(wahaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': settings.waha_key || '' },
      body: JSON.stringify({ session: 'default', chatId, text: testo })
    });
    return Response.json({ ok: resp.ok, status: resp.status });
  } catch (e) {
    return Response.json({ ok: false, errore: e.message }, { status: 502 });
  }
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://xxddmyglmjgibgvgfoit.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZGRteWdsbWpnaWJndmdmb2l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDQ4NTEsImV4cCI6MjA5NzUyMDg1MX0.yJw0YBxIV5q_YZ0SUt7HQ3Zj518H3t76EK-draOsnn8';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!jwt) return Response.json({ ok: false, errore: 'Non autenticato' }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('waha_host, waha_key')
    .single();

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
    const ok = resp.ok;
    return Response.json({ ok, status: resp.status });
  } catch (e) {
    return Response.json({ ok: false, errore: e.message }, { status: 502 });
  }
}

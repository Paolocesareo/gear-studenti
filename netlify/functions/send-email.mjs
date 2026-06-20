import { createClient } from '@supabase/supabase-js';
import nodemailer       from 'nodemailer';

const SUPABASE_URL  = 'https://xxddmyglmjgibgvgfoit.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZGRteWdsbWpnaWJndmdmb2l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDQ4NTEsImV4cCI6MjA5NzUyMDg1MX0.yJw0YBxIV5q_YZ0SUt7HQ3Zj518H3t76EK-draOsnn8';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!jwt) return Response.json({ ok: false, errore: 'Non autenticato' }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ ok: false, errore: 'Sessione non valida' }, { status: 401 });

  const { destinatario, oggetto, testo } = await req.json();
  if (!destinatario || !testo) {
    return Response.json({ ok: false, errore: 'destinatario e testo obbligatori' }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('gmail_user, gmail_app_password')
    .single();

  if (!settings?.gmail_user) {
    return Response.json({ ok: false, errore: 'Gmail non configurata per questo account' }, { status: 400 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: settings.gmail_user, pass: settings.gmail_app_password }
    });
    const info = await transporter.sendMail({
      from:    settings.gmail_user,
      to:      destinatario,
      subject: oggetto || '(senza oggetto)',
      text:    testo
    });
    return Response.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    return Response.json({ ok: false, errore: e.message }, { status: 502 });
  }
}

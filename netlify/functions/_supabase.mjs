import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL  = 'https://xxddmyglmjgibgvgfoit.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZGRteWdsbWpnaWJndmdmb2l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDQ4NTEsImV4cCI6MjA5NzUyMDg1MX0.yJw0YBxIV5q_YZ0SUt7HQ3Zj518H3t76EK-draOsnn8';

export function makeSupabase(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
    realtime: { transport: ws }
  });
}

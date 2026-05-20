// Direct test of the deployed send-email function with a real ticket payload.
const SECRET = process.env.NOTIFY_WEBHOOK_SECRET;
const URL = 'https://warwicksupport.netlify.app/api/send-email';

// Pick a recent ticket
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: t } = await s.from('tickets').select('*').order('created_at', { ascending: false }).limit(1).single();
console.log('Using ticket:', t.ref, t.id);

const payload = { type: 'INSERT', table: 'tickets', schema: 'public', record: t, old_record: null };

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-webhook-secret': SECRET },
  body: JSON.stringify(payload),
});
console.log('status:', res.status);
console.log('body:', await res.text());

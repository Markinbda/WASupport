import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s
  .from('locations')
  .update({ is_active: true })
  .ilike('label', '%I.T. Office%')
  .select('id,label');
if (error) console.error(error);
else console.log('Re-enabled:', data);

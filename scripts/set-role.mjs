#!/usr/bin/env node
/**
 * Promote a user to a given role using the service-role key.
 *
 *   node scripts/set-role.mjs <email> <role>
 *
 * Roles: admin, manager, support, it_tech, fac_tech, hs_officer, leadership, submitter
 *
 * Useful for bootstrapping the first admin account.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const [email, role] = process.argv.slice(2);
if (!email || !role) {
  console.error('Usage: node scripts/set-role.mjs <email> <role>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from('profiles')
  .update({ role })
  .eq('email', email)
  .select('id, email, role')
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
console.log('Updated:', data);

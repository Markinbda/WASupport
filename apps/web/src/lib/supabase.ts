import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Build marker: 2026-05-21T17:40Z (force fresh Netlify bundle after env-var fix)
// Allow the app to render even before Supabase is configured so the
// "Hello AcademyDesk" page is useful on day one.
export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function StatusPage() {
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(`API OK @ ${d.time}`))
      .catch(() => setHealth('API unreachable (run `pnpm netlify:dev`)'));
  }, []);

  const hasSupabaseConfig =
    !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  function Row({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
    return (
      <li className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span
          className={
            ok === undefined
              ? 'text-sm text-slate-600'
              : ok
                ? 'badge-resolved'
                : 'badge-high'
          }
        >
          {value}
        </span>
      </li>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="page-title">System status</h1>
      <p className="page-subtitle">Quick health check of the application stack.</p>
      <div className="card-pad">
        <ul>
          <Row label="Web" value="running" ok />
          <Row
            label="API"
            value={health}
            ok={health.startsWith('API OK')}
          />
          <Row
            label="Supabase config"
            value={hasSupabaseConfig ? 'detected' : 'missing'}
            ok={hasSupabaseConfig}
          />
          <Row
            label="Supabase client"
            value={supabase ? 'initialised' : 'not initialised'}
            ok={!!supabase}
          />
        </ul>
      </div>
    </section>
  );
}

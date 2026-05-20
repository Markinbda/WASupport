import { Route, Routes, Link } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useEffect, useState } from 'react';

function Home() {
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(`API OK @ ${d.time}`))
      .catch(() => setHealth('API unreachable (run `pnpm netlify:dev`)'));
  }, []);

  const hasSupabaseConfig =
    !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-warwick-navy">AcademyDesk</h1>
        <p className="text-slate-600">
          Warwick Academy — Custom Helpdesk &amp; AI Resource Platform
        </p>
      </header>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold">System status</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <strong>Web:</strong> running ✓
          </li>
          <li>
            <strong>API:</strong> {health}
          </li>
          <li>
            <strong>Supabase config:</strong>{' '}
            {hasSupabaseConfig ? (
              <span className="text-emerald-600">detected</span>
            ) : (
              <span className="text-amber-600">
                missing — add <code>VITE_SUPABASE_URL</code> &amp;{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>
              </span>
            )}
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Supabase client initialised: <code>{supabase ? 'yes' : 'no'}</code>
        </p>
      </section>

      <nav className="mt-8 flex gap-4 text-sm">
        <Link className="text-warwick-navy underline" to="/tickets">
          Tickets (stub)
        </Link>
      </nav>
    </main>
  );
}

function Tickets() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold text-warwick-navy">Tickets</h1>
      <p className="mt-2 text-slate-600">Phase 1 will replace this with the real queue.</p>
      <Link className="mt-4 inline-block text-warwick-navy underline" to="/">
        ← back
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tickets" element={<Tickets />} />
    </Routes>
  );
}

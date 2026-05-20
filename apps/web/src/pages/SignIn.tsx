import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function SignIn() {
  const { user, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res =
      mode === 'in' ? await signIn(email, password) : await signUp(email, password, fullName);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (mode === 'up') {
      setInfo('Account created. Check your email if confirmation is enabled, then sign in.');
      setMode('in');
    } else {
      navigate('/');
    }
  }

  const tabClass = (active: boolean) =>
    [
      'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200',
      active
        ? 'bg-brand-navy text-white shadow-sm'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    ].join(' ');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-navy" style={{ letterSpacing: '0.5px' }}>
          AcademyDesk
        </h1>
        <p className="mt-1 text-sm italic text-slate-500">
          Warwick Academy helpdesk &amp; AI assistant
        </p>
      </div>

      <div className="card-pad">
        <div className="mb-6 flex gap-2">
          <button type="button" onClick={() => setMode('in')} className={tabClass(mode === 'in')}>
            Sign in
          </button>
          <button type="button" onClick={() => setMode('up')} className={tabClass(mode === 'up')}>
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {mode === 'up' && (
            <div>
              <label htmlFor="full-name" className="field-label">
                Full name
              </label>
              <input
                id="full-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="field"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
            />
          </div>

          {error && <p className="alert-error">{error}</p>}
          {info && <p className="alert-success">{info}</p>}

          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}

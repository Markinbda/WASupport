import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL, type Profile, type UserRole } from '../lib/types';

const ASSIGNABLE_ROLES: UserRole[] = [
  'submitter',
  'support',
  'it_tech',
  'fac_tech',
  'hs_officer',
  'manager',
  'leadership',
  'admin',
];

export default function AdminUsers() {
  const { isAdmin, role } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('submitter');
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    enabled: isAdmin,
    queryFn: async (): Promise<Profile[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase
        .from('profiles')
        .select('id, email, full_name, role, department, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (search.trim()) {
        const s = search.trim().replace(/[%_]/g, '');
        q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Profile[];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, newRole }: { id: string; newRole: UserRole }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e: Error) => setError(e.message),
  });

  const createUser = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('No active session');
      let res: Response;
      try {
        res = await fetch('/api/admin-create-user', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: newEmail.trim(),
            full_name: newName.trim() || undefined,
            role: newRole,
          }),
        });
      } catch (e) {
        // TypeError: failed to fetch — the API endpoint is unreachable.
        // In local dev this means `netlify dev` isn't running alongside Vite
        // (Vite proxies /api/* to http://localhost:8888).
        throw new Error(
          `Could not reach /api/admin-create-user. In local dev, run \`pnpm netlify:dev\` instead of \`pnpm dev\`, or start \`netlify dev\` in a second terminal. (${(e as Error).message})`,
        );
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      setCreateMsg(`Invitation sent to ${newEmail.trim()}.`);
      setNewEmail('');
      setNewName('');
      setNewRole('submitter');
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!isAdmin) {
    return <p className="alert-warn">Admins only. Your role: {role ?? 'unknown'}.</p>;
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">User management</h1>
          <p className="text-sm italic text-slate-500">
            Assign roles. <strong>Admin</strong> = full access. <strong>Manager</strong> = view,
            edit, reply on all tickets. <strong>Support</strong> = view all, close/resolve only.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search name or email…"
          className="field-sm w-72"
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setShowAdd((s) => !s);
            setError(null);
            setCreateMsg(null);
          }}
          className="btn-primary"
        >
          {showAdd ? 'Cancel' : '+ Add user'}
        </button>
        {createMsg && <p className="text-sm text-emerald-700">{createMsg}</p>}
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setCreateMsg(null);
            createUser.mutate();
          }}
          className="card-pad mb-6 grid gap-3 md:grid-cols-4"
        >
          <div>
            <label htmlFor="nu-email" className="field-label">Email</label>
            <input
              id="nu-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="field"
              placeholder="person@warwick.bm"
            />
          </div>
          <div>
            <label htmlFor="nu-name" className="field-label">Full name</label>
            <input
              id="nu-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="field"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="nu-role" className="field-label">Role</label>
            <select
              id="nu-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="field-select"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={createUser.isPending || !newEmail.trim()}
              className="btn-primary w-full"
            >
              {createUser.isPending ? 'Sending invite…' : 'Send invite'}
            </button>
          </div>
          <p className="md:col-span-4 text-xs text-slate-500">
            An invitation email is sent via Supabase. The user sets their own password on first sign-in.
          </p>
        </form>
      )}

      {error && <p className="mb-4 alert-error">{error}</p>}
      {isLoading && <p className="text-sm text-slate-500">Loading users…</p>}

      {data && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-slate-800">
                    <Link to={`/admin/users/${u.id}`} className="ref-link">
                      {u.full_name ?? '—'}
                    </Link>
                  </td>
                  <td className="text-slate-600">
                    <Link to={`/admin/users/${u.id}`} className="hover:underline">
                      {u.email}
                    </Link>
                  </td>
                  <td>
                    <select
                      value={u.role}
                      disabled={updateRole.isPending}
                      onChange={(e) =>
                        updateRole.mutate({ id: u.id, newRole: e.target.value as UserRole })
                      }
                      className="field-select-sm"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

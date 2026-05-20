import { useState } from 'react';
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
                  <td className="font-medium text-slate-800">{u.full_name ?? '—'}</td>
                  <td className="text-slate-600">{u.email}</td>
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

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  DEPARTMENT_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  ROLE_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type Department,
  type Profile,
  type Ticket,
  type UserRole,
} from '../lib/types';

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

const DEPARTMENTS: Department[] = ['IT', 'FAC', 'HS'];

export default function UserProfile() {
  const { id = '' } = useParams<{ id: string }>();
  const { isAdmin, role: viewerRole, user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('submitter');
  const [department, setDepartment] = useState<Department | ''>('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', id],
    enabled: !!id && isAdmin,
    queryFn: async (): Promise<Profile | null> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, department, created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
    },
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setUserRole(profile.role);
      setDepartment(profile.department ?? '');
    }
  }, [profile]);

  const { data: tickets } = useQuery({
    queryKey: ['user-profile-tickets', id],
    enabled: !!id && isAdmin,
    queryFn: async (): Promise<Ticket[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .or(`submitter_id.eq.${id},assignee_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Ticket[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const patch: Partial<Profile> = {
        full_name: fullName.trim() || null,
        role: userRole,
        department: department === '' ? null : (department as Department),
      };
      const { error } = await supabase.from('profiles').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaveMsg('Saved.');
      setSaveErr(null);
      queryClient.invalidateQueries({ queryKey: ['user-profile', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (user?.id === id) refreshProfile();
    },
    onError: (e: Error) => {
      setSaveErr(e.message);
      setSaveMsg(null);
    },
  });

  if (!isAdmin) {
    return <p className="alert-warn">Admins only. Your role: {viewerRole ?? 'unknown'}.</p>;
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading user…</p>;
  if (!profile) return <p className="alert-warn">User not found.</p>;

  const submitted = (tickets ?? []).filter((t) => t.submitter_id === id);
  const assigned = (tickets ?? []).filter((t) => t.assignee_id === id);

  return (
    <section>
      <div className="page-header">
        <div>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="mb-2 text-sm text-slate-500 hover:underline"
          >
            ← Back to users
          </button>
          <h1 className="page-title">{profile.full_name ?? profile.email}</h1>
          <p className="text-sm italic text-slate-500">
            {profile.email} · joined {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaveErr(null);
          setSaveMsg(null);
          save.mutate();
        }}
        className="card-pad mb-6 grid gap-4 md:grid-cols-2"
      >
        <div>
          <label htmlFor="up-name" className="field-label">Full name</label>
          <input
            id="up-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="field"
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label htmlFor="up-email" className="field-label">Email</label>
          <input
            id="up-email"
            value={profile.email}
            disabled
            className="field bg-slate-100 text-slate-500"
          />
        </div>
        <div>
          <label htmlFor="up-role" className="field-label">Role</label>
          <select
            id="up-role"
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as UserRole)}
            className="field-select"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="up-dept" className="field-label">Assignable department</label>
          <select
            id="up-dept"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department | '')}
            className="field-select"
          >
            <option value="">— None —</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Used for department-scoped filters and assignment.
          </p>
        </div>

        <div className="md:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {saveMsg && <span className="text-sm text-emerald-700">{saveMsg}</span>}
          {saveErr && <span className="text-sm text-rose-700">{saveErr}</span>}
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <TicketMiniList title={`Submitted (${submitted.length})`} tickets={submitted} emptyHint="No submitted tickets." />
        <TicketMiniList title={`Assigned (${assigned.length})`} tickets={assigned} emptyHint="No assigned tickets." />
      </div>
    </section>
  );
}

function TicketMiniList({
  title,
  tickets,
  emptyHint,
}: {
  title: string;
  tickets: Ticket[];
  emptyHint: string;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {tickets.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyHint}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tickets/${t.id}`} className="ref-link">
                      {t.ref}
                    </Link>
                  </td>
                  <td className="text-slate-700">{t.subject}</td>
                  <td>
                    <span className={PRIORITY_BADGE[t.priority]}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </td>
                  <td>
                    <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
                  </td>
                  <td className="text-xs text-slate-500">
                    {new Date(t.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

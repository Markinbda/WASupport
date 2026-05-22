import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  DEPARTMENT_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type Ticket,
} from '../lib/types';

type Filter = 'mine' | 'all' | 'open_dept' | 'closed_dept';

const CLOSED_STATUSES = ['resolved', 'closed'] as const;

const FILTER_DESCRIPTIONS: Record<Filter, string> = {
  mine: 'Tickets assigned to or submitted by you.',
  all: 'Every ticket you have access to.',
  open_dept: 'Open tickets in your department.',
  closed_dept: 'Resolved and closed tickets in your department.',
};

function formatDuration(fromIso: string, toIso: string | null): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  let ms = Math.max(0, to - from);
  const day = 24 * 60 * 60 * 1000;
  const hr = 60 * 60 * 1000;
  const min = 60 * 1000;
  const days = Math.floor(ms / day);
  ms -= days * day;
  const hours = Math.floor(ms / hr);
  ms -= hours * hr;
  const mins = Math.floor(ms / min);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

export default function TicketsList() {
  const { user, profile, isStaff } = useAuth();
  const [filter, setFilter] = useState<Filter>('mine');
  const [search, setSearch] = useState('');

  const dept = profile?.department ?? null;
  const hasDept = !!dept;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', filter, user?.id, dept, search],
    enabled: !!user,
    queryFn: async (): Promise<Ticket[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filter === 'mine') {
        if (isStaff && user) {
          q = q.or(`assignee_id.eq.${user.id},submitter_id.eq.${user.id}`);
        } else if (user) {
          q = q.eq('submitter_id', user.id);
        }
      } else if (filter === 'open_dept') {
        if (!dept) return [];
        q = q.eq('department', dept).not('status', 'in', `(${CLOSED_STATUSES.join(',')})`);
      } else if (filter === 'closed_dept') {
        if (!dept) return [];
        q = q.eq('department', dept).in('status', CLOSED_STATUSES as unknown as string[]);
      }
      // 'all' applies no extra filter

      if (search.trim()) {
        const s = search.trim().replace(/[%_]/g, '');
        q = q.or(
          `subject.ilike.%${s}%,ref.ilike.%${s}%,legacy_ref.ilike.%${s}%,description.ilike.%${s}%,legacy_submitter_name.ilike.%${s}%`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as Ticket[];
    },
  });

  const userIds = Array.from(
    new Set(
      (data ?? [])
        .flatMap((t) => [t.submitter_id, t.assignee_id])
        .filter((x): x is string => !!x),
    ),
  );

  const { data: people } = useQuery({
    queryKey: ['ticket-list-profiles', userIds.sort().join(',')],
    enabled: userIds.length > 0 && !!supabase,
    queryFn: async (): Promise<Record<string, string>> => {
      if (!supabase) return {};
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; email: string }>) {
        map[p.id] = p.full_name ?? p.email;
      }
      return map;
    },
  });

  const nameFor = (id: string | null, fallback: string | null): string => {
    if (id && people && people[id]) return people[id];
    return fallback ?? '—';
  };

  const pillBase =
    'rounded-full border px-3 py-1 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1';
  const pillActive = 'border-slate-900 bg-slate-900 text-white';
  const pillIdle = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  const pillDisabled = 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400';

  const deptLabel = dept ? DEPARTMENT_LABEL[dept] : 'your department';

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="text-sm italic text-slate-500">{FILTER_DESCRIPTIONS[filter]}</p>
        </div>
        <Link to="/new" className="btn-primary">
          + Submit a new ticket
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search subject / ref / description…"
          className="field-sm w-72"
        />
        <button
          type="button"
          onClick={() => setFilter('mine')}
          className={`${pillBase} ${filter === 'mine' ? pillActive : pillIdle}`}
        >
          My tickets
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`${pillBase} ${filter === 'all' ? pillActive : pillIdle}`}
        >
          All tickets
        </button>
        <button
          type="button"
          onClick={() => hasDept && setFilter('open_dept')}
          disabled={!hasDept}
          title={hasDept ? '' : 'No department assigned to your profile.'}
          className={`${pillBase} ${
            !hasDept ? pillDisabled : filter === 'open_dept' ? pillActive : pillIdle
          }`}
        >
          Open · {deptLabel}
        </button>
        <button
          type="button"
          onClick={() => hasDept && setFilter('closed_dept')}
          disabled={!hasDept}
          title={hasDept ? '' : 'No department assigned to your profile.'}
          className={`${pillBase} ${
            !hasDept ? pillDisabled : filter === 'closed_dept' ? pillActive : pillIdle
          }`}
        >
          Closed · {deptLabel}
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading tickets…</p>}
      {error && <p className="alert-error">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="empty-state">
          {filter === 'mine' ? (
            <>
              <p className="mb-4">You haven&apos;t submitted any tickets yet.</p>
              <Link to="/new" className="btn-primary">
                Submit your first ticket
              </Link>
            </>
          ) : (
            <p>No tickets match this filter.</p>
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Subject</th>
                <th>Department</th>
                <th>Submitted by</th>
                <th>Assigned to</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => {
                return (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="ref-link">
                        {t.ref}
                      </Link>
                    </td>
                    <td className="text-slate-700">
                      <Link to={`/tickets/${t.id}`} className="hover:underline">
                        {t.subject}
                      </Link>
                    </td>
                    <td className="text-slate-600">{DEPARTMENT_LABEL[t.department]}</td>
                    <td className="text-slate-700">
                      {nameFor(t.submitter_id, t.legacy_submitter_name)}
                    </td>
                    <td className="text-slate-700">
                      {nameFor(t.assignee_id, t.legacy_assignee_name)}
                    </td>
                    <td>
                      <span className={PRIORITY_BADGE[t.priority]}>
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                    </td>
                    <td>
                      <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
                    </td>
                    <td className="text-xs text-slate-500">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="text-xs text-slate-500">
                      {formatDuration(t.created_at, null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

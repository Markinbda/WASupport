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

export default function TicketsList() {
  const { user, profile, isStaff } = useAuth();
  const [filter, setFilter] = useState<Filter>('mine');

  const dept = profile?.department ?? null;
  const hasDept = !!dept;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', filter, user?.id, dept],
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

      const { data, error } = await q;
      if (error) throw error;
      return data as Ticket[];
    },
  });

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
                <th>Priority</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tickets/${t.id}`} className="ref-link">
                      {t.ref}
                    </Link>
                  </td>
                  <td className="text-slate-700">{t.subject}</td>
                  <td className="text-slate-600">{DEPARTMENT_LABEL[t.department]}</td>
                  <td>
                    <span className={PRIORITY_BADGE[t.priority]}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </td>
                  <td>
                    <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
                  </td>
                  <td className="text-xs text-slate-500">
                    {new Date(t.updated_at).toLocaleString()}
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

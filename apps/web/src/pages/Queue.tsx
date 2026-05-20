import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import SlaBadge from '../components/SlaBadge';
import {
  DEPARTMENT_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type Department,
  type Ticket,
  type TicketStatus,
} from '../lib/types';

const PAGE_SIZE = 50;

export default function Queue() {
  const { isStaff, role } = useAuth();
  const [dept, setDept] = useState<Department | 'ALL'>('ALL');
  const [status, setStatus] = useState<TicketStatus | 'ALL'>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const queryKey = ['queue', dept, status, search, page];

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: isStaff,
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (dept !== 'ALL') q = q.eq('department', dept);
      if (status !== 'ALL') q = q.eq('status', status);
      if (search.trim()) {
        const s = search.trim().replace(/[%_]/g, '');
        q = q.or(
          `subject.ilike.%${s}%,ref.ilike.%${s}%,legacy_ref.ilike.%${s}%,legacy_submitter_name.ilike.%${s}%`,
        );
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data as Ticket[], count: count ?? 0 };
    },
  });

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1),
    [data],
  );

  if (!isStaff) {
    return (
      <p className="alert-warn">
        Your account is a submitter ({role ?? 'no role'}). The queue is staff-only.
      </p>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ticket queue</h1>
          <p className="text-sm italic text-slate-500">
            Showing {data?.rows.length ?? 0} of {data?.count ?? 0}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dept}
            onChange={(e) => {
              setDept(e.target.value as Department | 'ALL');
              setPage(0);
            }}
            className="field-select-sm"
          >
            <option value="ALL">All depts</option>
            <option value="IT">IT</option>
            <option value="FAC">Facilities</option>
            <option value="HS">Health &amp; Safety</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TicketStatus | 'ALL');
              setPage(0);
            }}
            className="field-select-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="awaiting_triage">Needs triage</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="search subject / ref / submitter…"
            className="field-sm w-72"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="alert-error">{(error as Error).message}</p>}

      {data && data.rows.length === 0 && (
        <div className="empty-state">No tickets match these filters.</div>
      )}

      {data && data.rows.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Subject</th>
                <th>Dept</th>
                <th>Priority</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Submitter</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tickets/${t.id}`} className="ref-link">
                      {t.ref}
                    </Link>
                    {t.legacy_ref && (
                      <div className="mt-0.5 text-[10px] text-slate-400">SW #{t.legacy_ref}</div>
                    )}
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
                  <td>
                    <SlaBadge slaDueAt={t.sla_due_at} status={t.status} />
                  </td>
                  <td className="text-xs text-slate-600">{t.legacy_submitter_name ?? '—'}</td>
                  <td className="text-xs text-slate-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.count > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium transition hover:bg-slate-50 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium transition hover:bg-slate-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}

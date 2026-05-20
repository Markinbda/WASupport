import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  DEPARTMENT_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type Ticket,
} from '../lib/types';

export default function TicketsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'mine'],
    queryFn: async (): Promise<Ticket[]> => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Ticket[];
    },
  });

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">My tickets</h1>
          <p className="text-sm italic text-slate-500">Recent activity, newest first.</p>
        </div>
        <Link to="/new" className="btn-primary">
          + Submit a new ticket
        </Link>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading tickets…</p>}
      {error && <p className="alert-error">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="empty-state">
          <p className="mb-4">You haven&apos;t submitted any tickets yet.</p>
          <Link to="/new" className="btn-primary">
            Submit your first ticket
          </Link>
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

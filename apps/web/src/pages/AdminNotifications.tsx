import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type NotificationEvent = 'ticket.created' | 'ticket.reply' | 'ticket.status_changed';
type NotificationStatus = 'sent' | 'skipped' | 'error';

interface NotificationRow {
  id: string;
  ticket_id: string | null;
  event: NotificationEvent;
  recipients: string[];
  status: NotificationStatus;
  error: string | null;
  created_at: string;
}

interface TicketRefRow {
  id: string;
  ref: string;
  subject: string;
}

const EVENT_LABEL: Record<NotificationEvent, string> = {
  'ticket.created': 'Created',
  'ticket.reply': 'Reply',
  'ticket.status_changed': 'Status changed',
};

const STATUS_BADGE: Record<NotificationStatus, string> = {
  sent: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-slate-100 text-slate-700',
  error: 'bg-rose-100 text-rose-800',
};

export default function AdminNotifications() {
  const { isAdmin, isManager, role } = useAuth();
  const canView = isAdmin || isManager;

  const [statusFilter, setStatusFilter] = useState<'' | NotificationStatus>('');
  const [eventFilter, setEventFilter] = useState<'' | NotificationEvent>('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-notifications', statusFilter, eventFilter],
    enabled: canView,
    queryFn: async (): Promise<{ rows: NotificationRow[]; tickets: Record<string, TicketRefRow> }> => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase
        .from('notifications_log')
        .select('id, ticket_id, event, recipients, status, error, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (statusFilter) q = q.eq('status', statusFilter);
      if (eventFilter) q = q.eq('event', eventFilter);
      const { data: rows, error: rowsErr } = await q;
      if (rowsErr) throw rowsErr;
      const list = (rows ?? []) as NotificationRow[];

      const ticketIds = Array.from(new Set(list.map((r) => r.ticket_id).filter((v): v is string => !!v)));
      let tickets: Record<string, TicketRefRow> = {};
      if (ticketIds.length > 0) {
        const { data: t, error: tErr } = await supabase
          .from('tickets')
          .select('id, ref, subject')
          .in('id', ticketIds);
        if (tErr) throw tErr;
        tickets = Object.fromEntries((t ?? []).map((row) => [row.id, row as TicketRefRow]));
      }
      return { rows: list, tickets };
    },
  });

  if (!canView) {
    return <p className="alert-warn">Admins and managers only. Your role: {role ?? 'unknown'}.</p>;
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications log</h1>
          <p className="text-sm italic text-slate-500">
            Last 200 email send attempts. <strong>sent</strong> = delivered to SendGrid.
            <strong> skipped</strong> = no recipients or SendGrid disabled.
            <strong> error</strong> = SendGrid rejected; check the error column.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="field-select-sm"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="skipped">Skipped</option>
            <option value="error">Error</option>
          </select>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value as typeof eventFilter)}
            className="field-select-sm"
          >
            <option value="">All events</option>
            <option value="ticket.created">Created</option>
            <option value="ticket.reply">Reply</option>
            <option value="ticket.status_changed">Status changed</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 alert-error">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-slate-500">Loading notifications…</p>}

      {data && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Ticket</th>
                <th>Event</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                    No notifications match the current filters.
                  </td>
                </tr>
              )}
              {data.rows.map((r) => {
                const t = r.ticket_id ? data.tickets[r.ticket_id] : null;
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap">
                      {t ? (
                        <a
                          href={`/tickets/${t.id}`}
                          className="font-mono text-xs text-sky-700 hover:underline"
                          title={t.subject}
                        >
                          {t.ref}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-sm text-slate-700">
                      {EVENT_LABEL[r.event]}
                    </td>
                    <td className="text-xs text-slate-600">
                      {r.recipients.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        r.recipients.join(', ')
                      )}
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="max-w-xs text-xs text-rose-700">
                      {r.error ? (
                        <span title={r.error} className="line-clamp-2 break-all">
                          {r.error}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
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

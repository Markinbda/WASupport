import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import SlaBadge from '../components/SlaBadge';
import {
  DEPARTMENT_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type Ticket,
  type TicketMessage,
  type TicketPriority,
  type TicketStatus,
} from '../lib/types';

type AssigneeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  department: string | null;
};

const PRIORITY_SLA_HINT: Record<TicketPriority, string> = {
  urgent: 'Urgent — 4 hours',
  critical: 'Critical — 4 hours',
  high: 'High — same day (8h)',
  normal: 'Normal — 48 hours',
  low: 'Low — 1 week',
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isStaff, isManager, role } = useAuth();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triagePriority, setTriagePriority] = useState<TicketPriority>('normal');
  const [triageAssignee, setTriageAssignee] = useState<string>('');

  const ticketQ = useQuery({
    queryKey: ['ticket', id],
    queryFn: async (): Promise<Ticket> => {
      if (!supabase || !id) throw new Error('not ready');
      const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Ticket;
    },
    enabled: !!id,
  });

  const msgsQ = useQuery({
    queryKey: ['ticket', id, 'messages'],
    queryFn: async (): Promise<TicketMessage[]> => {
      if (!supabase || !id) throw new Error('not ready');
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at');
      if (error) throw error;
      return data as TicketMessage[];
    },
    enabled: !!id,
  });

  const post = useMutation({
    mutationFn: async () => {
      if (!supabase || !id || !user) throw new Error('not ready');
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: id,
        author_id: user.id,
        body: reply,
        is_internal: internal && isStaff,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply('');
      setInternal(false);
      queryClient.invalidateQueries({ queryKey: ['ticket', id, 'messages'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (newStatus: TicketStatus) => {
      if (!supabase || !id) throw new Error('not ready');
      const patch: Partial<Ticket> = { status: newStatus };
      if (newStatus === 'resolved') patch.resolved_at = new Date().toISOString();
      if (newStatus === 'closed') patch.closed_at = new Date().toISOString();
      const { error } = await supabase.from('tickets').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
    onError: (e: Error) => setError(e.message),
  });

  // Eligible assignees: dept tech matching ticket dept, plus managers/admins.
  const t0 = ticketQ.data;
  const assigneesQ = useQuery({
    queryKey: ['assignees', t0?.department],
    enabled: !!supabase && !!t0 && isStaff,
    queryFn: async (): Promise<AssigneeOption[]> => {
      if (!supabase || !t0) return [];
      const deptRoleMap: Record<string, string> = {
        IT: 'it_tech',
        FAC: 'fac_tech',
        HS: 'hs_officer',
      };
      const techRole = deptRoleMap[t0.department];
      const roles = ['manager', 'admin'];
      if (techRole) roles.push(techRole);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department')
        .in('role', roles)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssigneeOption[];
    },
  });

  const assigneeProfileQ = useQuery({
    queryKey: ['profile', t0?.assignee_id],
    enabled: !!supabase && !!t0?.assignee_id,
    queryFn: async (): Promise<AssigneeOption | null> => {
      if (!supabase || !t0?.assignee_id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department')
        .eq('id', t0.assignee_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AssigneeOption | null;
    },
  });

  const triage = useMutation({
    mutationFn: async () => {
      if (!supabase || !id || !user) throw new Error('not ready');
      if (!triageAssignee) throw new Error('Pick an assignee');
      const { error } = await supabase
        .from('tickets')
        .update({
          priority: triagePriority,
          assignee_id: triageAssignee,
          triaged_by: user.id,
          status: 'in_progress',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
    onError: (e: Error) => setError(e.message),
  });

  const reassign = useMutation({
    mutationFn: async (newAssignee: string) => {
      if (!supabase || !id) throw new Error('not ready');
      const { error } = await supabase
        .from('tickets')
        .update({ assignee_id: newAssignee || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
    onError: (e: Error) => setError(e.message),
  });

  if (ticketQ.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (ticketQ.error)
    return <p className="alert-error">{(ticketQ.error as Error).message}</p>;

  const t = ticketQ.data!;
  const assigneeName =
    assigneeProfileQ.data?.full_name || assigneeProfileQ.data?.email || null;

  const allStatuses: TicketStatus[] = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];
  const supportStatuses: TicketStatus[] = ['resolved', 'closed'];
  const availableStatuses =
    role === 'support' ? supportStatuses : isStaff ? allStatuses : [];

  return (
    <section className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-navy transition hover:text-brand-navy-hover"
      >
        ← Back to tickets
      </Link>

      <header className="card-pad">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-brand-navy">
            {t.ref}
          </span>
          {t.legacy_ref && (
            <span className="rounded-md bg-slate-200 px-2 py-1 font-mono text-xs text-slate-600">
              SW #{t.legacy_ref}
            </span>
          )}
          <span className="badge-slate">{DEPARTMENT_LABEL[t.department]}</span>
          <span className={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABEL[t.priority]}</span>
          <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
          <SlaBadge slaDueAt={t.sla_due_at} status={t.status} />
        </div>

        <h1 className="text-2xl font-bold text-brand-navy">{t.subject}</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {t.description}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-5 text-xs md:grid-cols-4">
          <div>
            <dt className="section-title">Opened</dt>
            <dd className="mt-1 text-slate-700">{new Date(t.created_at).toLocaleString()}</dd>
          </div>
          {t.legacy_submitter_name && (
            <div>
              <dt className="section-title">Submitted by</dt>
              <dd className="mt-1 text-slate-700">{t.legacy_submitter_name}</dd>
            </div>
          )}
          {t.legacy_assignee_name && (
            <div>
              <dt className="section-title">Assigned to</dt>
              <dd className="mt-1 text-slate-700">{t.legacy_assignee_name}</dd>
            </div>
          )}
          {(t.building || t.room) && (
            <div>
              <dt className="section-title">Location</dt>
              <dd className="mt-1 text-slate-700">
                {[t.building, t.room].filter(Boolean).join(' · ')}
              </dd>
            </div>
          )}
          {t.legacy_location && !t.building && !t.room && (
            <div>
              <dt className="section-title">Location</dt>
              <dd className="mt-1 text-slate-700">{t.legacy_location}</dd>
            </div>
          )}
          {t.closed_at && (
            <div>
              <dt className="section-title">Closed</dt>
              <dd className="mt-1 text-slate-700">{new Date(t.closed_at).toLocaleString()}</dd>
            </div>
          )}
          {t.imported_from && (
            <div>
              <dt className="section-title">Source</dt>
              <dd className="mt-1 text-slate-700">imported from {t.imported_from}</dd>
            </div>
          )}
          {assigneeName && (
            <div>
              <dt className="section-title">Assignee</dt>
              <dd className="mt-1 text-slate-700">{assigneeName}</dd>
            </div>
          )}
          {t.sla_due_at && t.status !== 'awaiting_triage' && (
            <div>
              <dt className="section-title">SLA due</dt>
              <dd className="mt-1 text-slate-700">
                {new Date(t.sla_due_at).toLocaleString()}
              </dd>
            </div>
          )}
        </dl>

        {isStaff && t.status === 'awaiting_triage' && (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="badge-triage">Needs triage</span>
              <p className="text-sm text-rose-900">
                Set a priority and assign someone to start the SLA clock.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="field-label">Priority</span>
                <select
                  className="field-select"
                  value={triagePriority}
                  onChange={(e) => setTriagePriority(e.target.value as TicketPriority)}
                >
                  <option value="low">{PRIORITY_SLA_HINT.low}</option>
                  <option value="normal">{PRIORITY_SLA_HINT.normal}</option>
                  <option value="high">{PRIORITY_SLA_HINT.high}</option>
                  <option value="critical">{PRIORITY_SLA_HINT.critical}</option>
                  <option value="urgent">{PRIORITY_SLA_HINT.urgent}</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label">Assignee</span>
                <select
                  className="field-select"
                  value={triageAssignee}
                  onChange={(e) => setTriageAssignee(e.target.value)}
                >
                  <option value="">Select…</option>
                  {(assigneesQ.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id} ({p.role})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!triageAssignee || triage.isPending}
                onClick={() => {
                  setError(null);
                  triage.mutate();
                }}
                className="btn-primary"
              >
                {triage.isPending ? 'Starting…' : 'Start work'}
              </button>
            </div>
          </div>
        )}

        {isStaff && t.status !== 'awaiting_triage' && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
            <span className="section-title mr-2">Assignee</span>
            <select
              className="field-select-sm"
              value={t.assignee_id ?? ''}
              onChange={(e) => reassign.mutate(e.target.value)}
              disabled={reassign.isPending}
            >
              <option value="">Unassigned</option>
              {(assigneesQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email || p.id} ({p.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {availableStatuses.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
            <span className="section-title mr-2">Change status</span>
            {availableStatuses.map((s) => (
              <button
                key={s}
                disabled={updateStatus.isPending || s === t.status}
                onClick={() => updateStatus.mutate(s)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-navy hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </header>

      <div>
        <h2 className="section-title mb-3">Conversation</h2>
        <ul className="space-y-3">
          {(msgsQ.data ?? []).map((m) => (
            <li
              key={m.id}
              className={`rounded-2xl p-5 shadow-card ${
                m.is_internal
                  ? 'border-l-[3px] border-amber-400 bg-amber-50'
                  : 'border-l-[3px] border-brand-navy bg-white'
              }`}
            >
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  {m.author_id === user?.id ? 'You' : 'Staff'}
                  {m.is_internal && (
                    <span className="ml-2 rounded bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                      Internal note
                    </span>
                  )}
                </span>
                <span className="text-slate-500">{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {m.body}
              </p>
            </li>
          ))}
          {msgsQ.data && msgsQ.data.length === 0 && (
            <li className="empty-state">No replies yet.</li>
          )}
        </ul>
      </div>

      {(isStaff || t.submitter_id === user?.id) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (reply.trim()) post.mutate();
          }}
          className="card-pad space-y-4"
        >
          <div>
            <label htmlFor="reply" className="field-label">
              Add a reply
            </label>
            <textarea
              id="reply"
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="field resize-y"
              placeholder="Type your reply…"
            />
          </div>
          {isStaff && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-2 focus:ring-brand-navy focus:ring-offset-1"
              />
              Internal note (not visible to submitter)
            </label>
          )}
          {error && <p className="alert-error">{error}</p>}
          <div className="flex justify-end gap-3">
            {isManager && t.status !== 'closed' && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (reply.trim()) post.mutate();
                  updateStatus.mutate('closed');
                }}
                className="btn-ghost"
              >
                Reply &amp; close
              </button>
            )}
            <button
              type="submit"
              disabled={post.isPending || !reply.trim()}
              className="btn-primary"
            >
              {post.isPending ? 'Sending…' : 'Post reply'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

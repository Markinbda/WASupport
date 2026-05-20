/**
 * Email notifications via SendGrid.
 *
 * Triggered by Supabase Database Webhooks (Database → Webhooks in the dashboard)
 * configured against `tickets` (INSERT, UPDATE) and `ticket_messages` (INSERT).
 *
 * Required headers:
 *   x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>   shared secret
 *
 * Required env vars:
 *   SENDGRID_API_KEY
 *   SENDGRID_FROM_EMAIL
 *   NOTIFY_WEBHOOK_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL                       e.g. https://academydesk.netlify.app
 *   STAFF_NOTIFY_IT               comma-separated emails for new IT tickets
 *   STAFF_NOTIFY_FAC              comma-separated emails for new Facilities tickets
 *   STAFF_NOTIFY_HS               comma-separated emails for new H&S tickets
 */
import type { Handler } from '@netlify/functions';

// ---------------------------------------------------------------------
// Tiny PostgREST helper — avoids @supabase/supabase-js (and its WebSocket
// dependency) entirely. The service role key bypasses RLS.
// ---------------------------------------------------------------------
function pgrest(): { url: string; key: string } {
  return { url: env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1', key: env('SUPABASE_SERVICE_ROLE_KEY') };
}
async function restSelect<T = unknown>(
  table: string,
  query: string,
): Promise<T[]> {
  const { url, key } = pgrest();
  const res = await fetch(`${url}/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`PostgREST ${table} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}
async function restInsert(table: string, row: Record<string, unknown>): Promise<void> {
  const { url, key } = pgrest();
  const res = await fetch(`${url}/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    // Swallow log-write failures — never block the webhook on telemetry.
    console.error(`[send-email] insert into ${table} failed:`, res.status, await res.text());
  }
}

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'tickets' | 'ticket_messages';
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
};

type Ticket = {
  id: string;
  ref: string;
  subject: string;
  description: string;
  department: 'IT' | 'FAC' | 'HS';
  priority: string;
  status: string;
  submitter_id: string | null;
  assignee_id: string | null;
  sla_due_at: string | null;
  legacy_submitter_email: string | null;
  legacy_submitter_name: string | null;
};

type Message = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  is_internal: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_triage: 'Awaiting triage',
  open: 'Open',
  in_progress: 'In progress',
  on_hold: 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical',
  urgent: 'Urgent',
};

const DEPT_LABEL: Record<string, string> = {
  IT: 'IT',
  FAC: 'Facilities',
  HS: 'Health & Safety',
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function deptStaffEmails(department: string): string[] {
  const key = `STAFF_NOTIFY_${department}`;
  const raw = process.env[key] ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendgridSend(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
  const apiKey = env('SENDGRID_API_KEY');
  const from = env('SENDGRID_FROM_EMAIL');

  if (apiKey.startsWith('SG....') || !apiKey.startsWith('SG.')) {
    console.warn('[send-email] SENDGRID_API_KEY not configured; skipping send.');
    return { skipped: true };
  }

  const body = {
    personalizations: [{ to: opts.to.map((email) => ({ email })) }],
    from: { email: from, name: 'AcademyDesk' },
    reply_to: opts.replyTo ? { email: opts.replyTo } : undefined,
    subject: opts.subject,
    content: [
      { type: 'text/plain', value: opts.text },
      { type: 'text/html', value: opts.html },
    ],
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`SendGrid ${res.status}: ${detail}`);
  }
  return { skipped: false };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTemplate(opts: {
  title: string;
  intro: string;
  ticket: Ticket;
  bodyBlock?: string;
  appUrl: string;
}): { html: string; text: string } {
  const link = `${opts.appUrl.replace(/\/$/, '')}/tickets/${opts.ticket.id}`;
  const html = `
<!doctype html>
<html><body style="margin:0;padding:24px;background:#f0f4f8;font-family:-apple-system,Segoe UI,sans-serif;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;border-left:3px solid #1a2744;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <h1 style="margin:0 0 4px;color:#1a2744;font-size:20px">${escapeHtml(opts.title)}</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">${escapeHtml(opts.intro)}</p>

    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-family:monospace;font-size:13px;font-weight:600;color:#1a2744;margin-bottom:6px">${escapeHtml(opts.ticket.ref)}</div>
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:8px">${escapeHtml(opts.ticket.subject)}</div>
      <div style="font-size:12px;color:#6b7280">
        ${escapeHtml(DEPT_LABEL[opts.ticket.department] ?? opts.ticket.department)}
        &nbsp;·&nbsp; Priority: ${escapeHtml(PRIORITY_LABEL[opts.ticket.priority] ?? opts.ticket.priority)}
        &nbsp;·&nbsp; Status: ${escapeHtml(STATUS_LABEL[opts.ticket.status] ?? opts.ticket.status)}
      </div>
    </div>

    ${
      opts.bodyBlock
        ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(opts.bodyBlock)}</div>`
        : ''
    }

    <a href="${link}" style="display:inline-block;background:#f59e0b;color:#1a2744;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:9999px;font-size:14px">
      View ticket →
    </a>

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px">
      Replies to this email are not monitored. Click <strong>View ticket</strong> above to respond on AcademyDesk.
    </p>

    <p style="margin:24px 0 0;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;padding-top:16px">
      AcademyDesk · Warwick Academy helpdesk
    </p>
  </div>
</body></html>`.trim();

  const text = [
    opts.title,
    opts.intro,
    '',
    `${opts.ticket.ref}  —  ${opts.ticket.subject}`,
    `${DEPT_LABEL[opts.ticket.department] ?? opts.ticket.department} · Priority ${PRIORITY_LABEL[opts.ticket.priority] ?? opts.ticket.priority} · Status ${STATUS_LABEL[opts.ticket.status] ?? opts.ticket.status}`,
    opts.bodyBlock ? `\n${opts.bodyBlock}\n` : '',
    `View: ${link}`,
    '',
    'Replies to this email are not monitored. Open the link above to respond on AcademyDesk.',
  ].join('\n');

  return { html, text };
}

async function resolveEmail(
  userId: string | null,
  fallback?: string | null,
): Promise<string | null> {
  if (fallback) return fallback;
  if (!userId) return null;
  const rows = await restSelect<{ email: string }>(
    'profiles',
    `select=email&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows[0]?.email ?? null;
}

async function logNotification(row: {
  ticket_id: string;
  event: string;
  recipients: string[];
  status: 'sent' | 'skipped' | 'error';
  error?: string;
}): Promise<void> {
  await restInsert('notifications_log', {
    ticket_id: row.ticket_id,
    event: row.event,
    recipients: row.recipients,
    status: row.status,
    error: row.error ?? null,
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = event.headers['x-webhook-secret'] ?? event.headers['X-Webhook-Secret'];
  if (!secret || secret !== process.env.NOTIFY_WEBHOOK_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:8888';

  try {
    // --- ticket created --------------------------------------------------
    if (payload.table === 'tickets' && payload.type === 'INSERT') {
      const t = payload.record as unknown as Ticket;
      const recipients = new Set<string>(deptStaffEmails(t.department));
      const submitterEmail = await resolveEmail(t.submitter_id, t.legacy_submitter_email);
      if (submitterEmail) recipients.add(submitterEmail);

      if (recipients.size === 0) {
        await logNotification({
          ticket_id: t.id,
          event: 'ticket.created',
          recipients: [],
          status: 'skipped',
          error: 'no recipients',
        });
        return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no recipients' }) };
      }

      const tpl = renderTemplate({
        title: `New ticket: ${t.ref}`,
        intro: `A new ${DEPT_LABEL[t.department] ?? t.department} ticket has been submitted.`,
        ticket: t,
        bodyBlock: t.description,
        appUrl,
      });
      const result = await sendgridSend({
        to: [...recipients],
        subject: `[${t.ref}] ${t.subject}`,
        ...tpl,
      });
      await logNotification({
        ticket_id: t.id,
        event: 'ticket.created',
        recipients: [...recipients],
        status: result.skipped ? 'skipped' : 'sent',
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // --- ticket status / assignee changed -------------------------------
    if (payload.table === 'tickets' && payload.type === 'UPDATE') {
      const t = payload.record as unknown as Ticket;
      const old = payload.old_record as unknown as Ticket | null;
      if (!old) {
        return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no old record' }) };
      }

      const statusChanged = old.status !== t.status;
      const assigneeChanged = (old.assignee_id ?? null) !== (t.assignee_id ?? null) && !!t.assignee_id;
      let didSomething = false;

      // Notify the new assignee
      if (assigneeChanged && t.assignee_id) {
        const assigneeEmail = await resolveEmail(t.assignee_id);
        if (assigneeEmail) {
          const dueLine = t.sla_due_at
            ? `SLA due: ${new Date(t.sla_due_at).toLocaleString()}`
            : '';
          const tpl = renderTemplate({
            title: `Assigned to you: ${t.ref}`,
            intro: `You've been assigned this ${DEPT_LABEL[t.department] ?? t.department} ticket.${dueLine ? ' ' + dueLine : ''}`,
            ticket: t,
            bodyBlock: t.description,
            appUrl,
          });
          const result = await sendgridSend({
            to: [assigneeEmail],
            subject: `[${t.ref}] Assigned to you`,
            ...tpl,
          });
          await logNotification({
            ticket_id: t.id,
            event: 'ticket.assigned',
            recipients: [assigneeEmail],
            status: result.skipped ? 'skipped' : 'sent',
          });
          didSomething = true;
        } else {
          await logNotification({
            ticket_id: t.id,
            event: 'ticket.assigned',
            recipients: [],
            status: 'skipped',
            error: 'no assignee email',
          });
        }
      }

      // Notify the submitter of a status change (skip the silent
      // awaiting_triage → open/in_progress transition triggered by triage:
      // the assignee notification above is the meaningful event).
      const isTriageTransition =
        old.status === 'awaiting_triage' && t.status !== 'awaiting_triage';
      if (statusChanged && !isTriageTransition) {
        const submitterEmail = await resolveEmail(t.submitter_id, t.legacy_submitter_email);
        if (submitterEmail) {
          const tpl = renderTemplate({
            title: `Status updated: ${STATUS_LABEL[t.status] ?? t.status}`,
            intro: `Your ticket has moved from "${STATUS_LABEL[old.status] ?? old.status}" to "${STATUS_LABEL[t.status] ?? t.status}".`,
            ticket: t,
            appUrl,
          });
          const result = await sendgridSend({
            to: [submitterEmail],
            subject: `[${t.ref}] Status: ${STATUS_LABEL[t.status] ?? t.status}`,
            ...tpl,
          });
          await logNotification({
            ticket_id: t.id,
            event: 'ticket.status_changed',
            recipients: [submitterEmail],
            status: result.skipped ? 'skipped' : 'sent',
          });
          didSomething = true;
        } else {
          await logNotification({
            ticket_id: t.id,
            event: 'ticket.status_changed',
            recipients: [],
            status: 'skipped',
            error: 'no submitter email',
          });
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, skipped: didSomething ? undefined : 'no actionable change' }),
      };
    }

    // --- new message (reply) --------------------------------------------
    if (payload.table === 'ticket_messages' && payload.type === 'INSERT') {
      const m = payload.record as unknown as Message;
      if (m.is_internal) {
        return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'internal note' }) };
      }

      const ticketRows = await restSelect<Ticket>(
        'tickets',
        `select=id,ref,subject,description,department,priority,status,submitter_id,legacy_submitter_email,legacy_submitter_name&id=eq.${encodeURIComponent(m.ticket_id)}&limit=1`,
      );
      if (!ticketRows[0]) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'ticket not found' }) };
      }
      const t = ticketRows[0];

      const authorIsSubmitter = m.author_id && m.author_id === t.submitter_id;
      const recipients = new Set<string>();
      if (authorIsSubmitter) {
        // Notify dept staff
        deptStaffEmails(t.department).forEach((e) => recipients.add(e));
      } else {
        // Notify submitter
        const submitterEmail = await resolveEmail(t.submitter_id, t.legacy_submitter_email);
        if (submitterEmail) recipients.add(submitterEmail);
      }

      if (recipients.size === 0) {
        await logNotification({
          ticket_id: t.id,
          event: 'ticket.reply',
          recipients: [],
          status: 'skipped',
          error: 'no recipients',
        });
        return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no recipients' }) };
      }

      const tpl = renderTemplate({
        title: `New reply on ${t.ref}`,
        intro: authorIsSubmitter
          ? 'The submitter has added a reply.'
          : 'Support has replied to your ticket.',
        ticket: t,
        bodyBlock: m.body,
        appUrl,
      });
      const result = await sendgridSend({
        to: [...recipients],
        subject: `[${t.ref}] New reply`,
        ...tpl,
      });
      await logNotification({
        ticket_id: t.id,
        event: 'ticket.reply',
        recipients: [...recipients],
        status: result.skipped ? 'skipped' : 'sent',
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'unhandled event' }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-email] error', message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};

/**
 * SendGrid Inbound Parse webhook — converts an incoming email into a ticket
 * (or appends a reply to an existing one).
 *
 * Configure SendGrid Inbound Parse to POST (multipart/form-data) here:
 *   https://<site>.netlify.app/.netlify/functions/sendgrid-inbound?secret=<INBOUND_PARSE_SECRET>
 *
 * Required env vars:
 *   INBOUND_PARSE_SECRET            shared secret in the URL ?secret= query param
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INBOUND_ALLOWED_DOMAINS         (optional) comma-separated allowlist; empty = accept any
 *   INBOUND_DEFAULT_DEPARTMENT      (optional) IT|FAC|HS — default when To-address has no hint
 *
 * Routing:
 *   - To: it@/tech@/helpdesk@/support@   → IT
 *   - To: fac@/facilities@/maintenance@  → FAC
 *   - To: hs@/health@/safety@/nurse@     → HS
 *   - else → INBOUND_DEFAULT_DEPARTMENT (or IT)
 *
 * Reply detection:
 *   Subject containing [IT-1234] / [FAC-1234] / [HS-1234] is treated as a reply
 *   to that existing ticket and inserted into ticket_messages.
 *
 * Attachments are not yet persisted — see TODO at the bottom.
 */
import type { Handler } from '@netlify/functions';
import Busboy from 'busboy';

// --------------------------------------------------------------------------
// PostgREST helpers (service-role; bypasses RLS)
// --------------------------------------------------------------------------

function pgrest(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return { url: `${url}/rest/v1`, key };
}

async function restGet<T = unknown>(table: string, query: string): Promise<T[]> {
  const { url, key } = pgrest();
  const res = await fetch(`${url}/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`PostgREST GET ${table} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function restInsert<T = unknown>(
  table: string,
  row: Record<string, unknown>,
  returnRow = false,
): Promise<T | null> {
  const { url, key } = pgrest();
  const res = await fetch(`${url}/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: returnRow ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`PostgREST INSERT ${table} ${res.status}: ${await res.text()}`);
  if (!returnRow) return null;
  const arr = (await res.json()) as T[];
  return arr[0] ?? null;
}

// --------------------------------------------------------------------------
// Multipart parsing
// --------------------------------------------------------------------------

type ParsedForm = {
  fields: Record<string, string>;
  files: Array<{ field: string; filename: string; mime: string; size: number }>;
};

function parseMultipart(bodyBuffer: Buffer, contentType: string): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const out: ParsedForm = { fields: {}, files: [] };
    const bb = Busboy({ headers: { 'content-type': contentType } });

    bb.on('field', (name: string, val: string) => {
      out.fields[name] = val;
    });
    bb.on(
      'file',
      (
        name: string,
        stream: NodeJS.ReadableStream,
        info: { filename?: string; mimeType?: string },
      ) => {
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
        });
        stream.on('end', () => {
          out.files.push({
            field: name,
            filename: info.filename ?? 'attachment',
            mime: info.mimeType ?? 'application/octet-stream',
            size,
          });
        });
        stream.resume();
      },
    );
    bb.on('error', (err) => reject(err));
    bb.on('close', () => resolve(out));

    bb.end(bodyBuffer);
  });
}

// --------------------------------------------------------------------------
// Header / address helpers
// --------------------------------------------------------------------------

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

function extractEmail(input: string | undefined): {
  email: string | null;
  name: string | null;
} {
  if (!input) return { email: null, name: null };
  const m = input.match(EMAIL_RE);
  const email = m ? m[0].toLowerCase() : null;
  const nameMatch = input.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  const name = nameMatch ? nameMatch[1].trim() : null;
  return { email, name };
}

function parseRecipients(toHeader: string | undefined): string[] {
  if (!toHeader) return [];
  return toHeader
    .split(',')
    .map((s) => s.match(EMAIL_RE)?.[0]?.toLowerCase())
    .filter((s): s is string => Boolean(s));
}

function pickDepartment(
  recipients: string[],
  fallback: 'IT' | 'FAC' | 'HS',
): 'IT' | 'FAC' | 'HS' {
  for (const addr of recipients) {
    const local = (addr.split('@')[0] ?? '').toLowerCase();
    if (/(^|[^a-z])(it|tech|helpdesk|support)([^a-z]|$)/.test(local)) return 'IT';
    if (/(^|[^a-z])(fac|facilities|maintenance|building)([^a-z]|$)/.test(local)) return 'FAC';
    if (/(^|[^a-z])(hs|health|safety|nurse)([^a-z]|$)/.test(local)) return 'HS';
  }
  return fallback;
}

const TICKET_REF_RE = /\[((?:IT|FAC|HS)-\d{3,})\]/i;

function extractTicketRef(subject: string | undefined): string | null {
  if (!subject) return null;
  const m = subject.match(TICKET_REF_RE);
  return m ? m[1].toUpperCase() : null;
}

function stripQuotedReply(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const cutMarkers = [
    /^On .+ wrote:\s*$/i,
    /^From: .+/i,
    /^-----\s*Original Message\s*-----/i,
    /^_{5,}/,
  ];
  for (let i = 0; i < lines.length; i++) {
    if (cutMarkers.some((re) => re.test(lines[i]))) {
      return lines.slice(0, i).join('\n').trimEnd();
    }
  }
  return text.trim();
}

function isAllowedSender(email: string): boolean {
  const raw = process.env.INBOUND_ALLOWED_DOMAINS ?? '';
  const allow = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return allow.some((d) => domain === d || domain.endsWith(`.${d}`));
}

// --------------------------------------------------------------------------
// Persistence
// --------------------------------------------------------------------------

type Profile = { id: string; email: string; full_name: string | null };

async function findProfileByEmail(email: string): Promise<Profile | null> {
  const rows = await restGet<Profile>(
    'profiles',
    `select=id,email,full_name&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  return rows[0] ?? null;
}

type Ticket = { id: string; ref: string; submitter_id: string | null };

async function findTicketByRef(ref: string): Promise<Ticket | null> {
  const rows = await restGet<Ticket>(
    'tickets',
    `select=id,ref,submitter_id&ref=eq.${encodeURIComponent(ref)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function createTicket(args: {
  department: 'IT' | 'FAC' | 'HS';
  subject: string;
  description: string;
  submitter: Profile | null;
  senderEmail: string;
  senderName: string | null;
}): Promise<Ticket> {
  const row: Record<string, unknown> = {
    department: args.department,
    subject: args.subject.slice(0, 500),
    description: args.description,
    status: 'open',
    priority: 'normal',
    imported_from: 'email',
    imported_at: new Date().toISOString(),
  };
  if (args.submitter) {
    row.submitter_id = args.submitter.id;
  } else {
    row.submitter_id = null;
    row.legacy_submitter_email = args.senderEmail;
    row.legacy_submitter_name = args.senderName ?? args.senderEmail;
  }
  const inserted = await restInsert<Ticket>('tickets', row, true);
  if (!inserted) throw new Error('Ticket insert returned no row');
  return inserted;
}

async function appendReply(args: {
  ticketId: string;
  body: string;
  authorId: string | null;
}): Promise<boolean> {
  // ticket_messages.author_id is NOT NULL; if the sender has no profile we
  // can't write the row. The caller logs and the email is effectively dropped.
  if (!args.authorId) return false;
  await restInsert('ticket_messages', {
    ticket_id: args.ticketId,
    author_id: args.authorId,
    body: args.body,
    is_internal: false,
  });
  return true;
}

// --------------------------------------------------------------------------
// Handler
// --------------------------------------------------------------------------

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const expected = process.env.INBOUND_PARSE_SECRET;
  if (!expected) {
    console.error('[sendgrid-inbound] INBOUND_PARSE_SECRET not configured');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const provided =
    event.queryStringParameters?.secret ?? event.queryStringParameters?.token ?? '';
  if (provided !== expected) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const contentType =
    event.headers['content-type'] ?? event.headers['Content-Type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return { statusCode: 400, body: 'Expected multipart/form-data' };
  }
  if (!event.body) {
    return { statusCode: 400, body: 'Empty body' };
  }

  const bodyBuf = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'utf8');

  let form: ParsedForm;
  try {
    form = await parseMultipart(bodyBuf, contentType);
  } catch (err) {
    console.error('[sendgrid-inbound] multipart parse failed', err);
    return { statusCode: 400, body: 'Bad multipart' };
  }

  const fromHeader = form.fields.from ?? form.fields.From;
  const toHeader = form.fields.to ?? form.fields.To;
  const subject = (form.fields.subject ?? form.fields.Subject ?? '(no subject)').trim();
  const text = form.fields.text ?? '';

  const { email: senderEmail, name: senderName } = extractEmail(fromHeader);
  if (!senderEmail) {
    return { statusCode: 400, body: 'Could not parse sender' };
  }

  if (!isAllowedSender(senderEmail)) {
    console.warn(`[sendgrid-inbound] sender ${senderEmail} not in allowlist; dropping`);
    return {
      statusCode: 202,
      body: JSON.stringify({ accepted: false, reason: 'sender not allowed' }),
    };
  }

  const recipients = parseRecipients(toHeader);
  const fallbackDept =
    (process.env.INBOUND_DEFAULT_DEPARTMENT as 'IT' | 'FAC' | 'HS') || 'IT';
  const department = pickDepartment(recipients, fallbackDept);

  const profile = await findProfileByEmail(senderEmail);
  const cleanBody = stripQuotedReply(text) || '(no body)';

  // Reply path
  const refInSubject = extractTicketRef(subject);
  if (refInSubject) {
    const ticket = await findTicketByRef(refInSubject);
    if (ticket) {
      const wrote = await appendReply({
        ticketId: ticket.id,
        body: cleanBody,
        authorId: profile?.id ?? null,
      });
      console.log(
        `[sendgrid-inbound] reply to ${ticket.ref} from ${senderEmail} ${wrote ? 'appended' : 'dropped (no profile)'}`,
      );
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          ticket_ref: ticket.ref,
          mode: wrote ? 'reply' : 'reply-dropped',
        }),
      };
    }
    console.warn(
      `[sendgrid-inbound] subject mentioned unknown ref ${refInSubject}; creating new ticket`,
    );
  }

  // New-ticket path
  const ticket = await createTicket({
    department,
    subject,
    description: cleanBody,
    submitter: profile,
    senderEmail,
    senderName,
  });

  console.log(
    `[sendgrid-inbound] created ${ticket.ref} (${department}) from ${senderEmail}` +
      (profile ? ` (profile ${profile.id})` : ' (anonymous)') +
      `, ${form.files.length} attachment(s) skipped`,
  );

  // TODO: persist form.files to Supabase Storage and link via the attachments
  // table once the UI surfaces ticket attachments.

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      ticket_ref: ticket.ref,
      mode: 'new',
      department,
    }),
  };
};

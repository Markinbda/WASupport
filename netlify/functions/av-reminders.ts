/** Daily AV reminder sweep for one-time requests and recurring events. */
import type { Handler } from '@netlify/functions';

type AvRequest = {
  id: string;
  requester_name: string;
  requester_email: string;
  requested_date: string;
  setup_time: string;
  equipment: string[];
  music_request: string;
  location: string;
  details: string | null;
  links: string[];
};
type RecurringEvent = {
  id: string;
  title: string;
  contact_name: string;
  contact_email: string;
  weekday: number;
  start_date: string;
  end_date: string | null;
  setup_time: string;
  location: string;
  last_reminder_occurrence: string | null;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function restHeaders() {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
}

async function select<T>(table: string, query: string): Promise<T[]> {
  const base = env('SUPABASE_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, { headers: restHeaders() });
  if (!response.ok) throw new Error(`Database read failed: ${await response.text()}`);
  return (await response.json()) as T[];
}

async function patch(table: string, id: string, values: Record<string, unknown>) {
  const base = env('SUPABASE_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...restHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Database update failed: ${await response.text()}`);
}

function bermudaDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Atlantic/Bermuda', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function displayTime(time: string) {
  return new Date(`2000-01-01T${time.slice(0, 5)}:00`).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail(to: string, subject: string, lines: string[], action?: { label: string; url: string }) {
  const apiKey = env('SENDGRID_API_KEY');
  const from = env('SENDGRID_FROM_EMAIL');
  const text = [...lines, action ? `\n${action.label}: ${action.url}` : ''].filter(Boolean).join('\n');
  const htmlLines = lines.map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`).join('');
  const htmlAction = action
    ? `<a href="${escapeHtml(action.url)}" style="display:inline-block;margin-top:12px;background:#1a2744;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px">${escapeHtml(action.label)}</a>`
    : '';
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: 'WA Support Center' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: `<div style="font-family:Segoe UI,sans-serif;max-width:620px;padding:24px"><h1 style="font-size:20px;color:#1a2744">${escapeHtml(subject)}</h1>${htmlLines}${htmlAction}</div>` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
}

export const handler: Handler = async () => {
  const today = bermudaDate();
  const tomorrow = addDays(today, 1);
  const inTwoDays = addDays(today, 2);
  const appUrl = (process.env.APP_URL || process.env.URL || 'https://warwickportal.netlify.app').replace(/\/$/, '');
  let oneTimeSent = 0;
  let recurringSent = 0;

  try {
    const requests = await select<AvRequest>(
      'av_requests',
      `select=id,requester_name,requester_email,requested_date,setup_time,equipment,music_request,location,details,links&requested_date=eq.${tomorrow}&reminder_sent_at=is.null`,
    );
    for (const request of requests) {
      const lines = [
        `Hello ${request.requester_name},`,
        'This is a reminder for your AV request tomorrow.',
        `Date: ${displayDate(request.requested_date)}`,
        `Set up by: ${displayTime(request.setup_time)}`,
        `Location: ${request.location}`,
        `Equipment: ${request.equipment.join(', ') || 'None selected'}`,
        `Music: ${request.music_request}`,
        `Details: ${request.details || 'None'}`,
        `Links: ${request.links.join(', ') || 'None'}`,
      ];
      await sendEmail(request.requester_email, `AV request reminder — ${request.location}`, lines);
      await patch('av_requests', request.id, { reminder_sent_at: new Date().toISOString() });
      oneTimeSent += 1;
    }

    const occurrenceWeekday = new Date(`${inTwoDays}T12:00:00Z`).getUTCDay();
    const recurring = await select<RecurringEvent>(
      'av_recurring_events',
      `select=id,title,contact_name,contact_email,weekday,start_date,end_date,setup_time,location,last_reminder_occurrence&is_active=is.true&weekday=eq.${occurrenceWeekday}&start_date=lte.${inTwoDays}&or=(end_date.is.null,end_date.gte.${inTwoDays})`,
    );
    for (const schedule of recurring) {
      if (schedule.last_reminder_occurrence === inTwoDays) continue;
      const formUrl = `${appUrl}/av-request`;
      const lines = [
        `Hello ${schedule.contact_name},`,
        `${schedule.title} is scheduled for ${displayDate(inTwoDays)} at ${displayTime(schedule.setup_time)} in ${schedule.location}.`,
        'Do you need audio/visual support for this occurrence? If so, please submit the AV request form.',
      ];
      await sendEmail(
        schedule.contact_email,
        `AV support check — ${schedule.title}`,
        lines,
        { label: 'Request AV support', url: formUrl },
      );
      await patch('av_recurring_events', schedule.id, { last_reminder_occurrence: inTwoDays });
      recurringSent += 1;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, oneTimeSent, recurringSent }) };
  } catch (error) {
    console.error('[av-reminders]', error);
    return { statusCode: 500, body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) };
  }
};
/**
 * SendGrid Inbound Parse webhook — converts incoming email to a ticket.
 * Configure SendGrid Inbound Parse to POST (multipart/form-data) here.
 *
 * Phase 1 scope: parse sender / subject / body, enforce allowlisted domains,
 * create a ticket via Supabase service role, store attachments in Supabase Storage.
 * Phase 3: invoke AI categorisation before insert.
 */
import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // TODO(phase-1): verify shared secret header, parse multipart, create ticket.
  return {
    statusCode: 202,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accepted: true }),
  };
};

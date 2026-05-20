/**
 * LMRC chat endpoint — Phase 3 stub.
 *
 * Flow (to be filled in once pgvector + KB ingestion exist):
 *   1. Verify Supabase JWT from Authorization header.
 *   2. Embed the user's latest message (OpenAI text-embedding-3-small).
 *   3. SELECT top-k chunks from kb_chunks via match_kb_chunks() RPC.
 *   4. Stream a GPT-4o response grounded in those chunks.
 *   5. Persist the turn in lmrc_messages.
 *   6. If the classifier tags the issue as H&S, force-create ticket + Twilio alert.
 */
import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // TODO(phase-3): implement RAG pipeline.
  return {
    statusCode: 501,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      error: 'not_implemented',
      message: 'LMRC will be wired up in Phase 3.',
    }),
  };
};

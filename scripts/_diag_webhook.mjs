import pg from 'pg';
const { Client } = pg;

// Use direct DB URL if available, else build from project ref
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL env var to your postgres connection string (Database → Connection string → URI).');
  process.exit(1);
}
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  select id, status_code, error_msg, created,
         left(content::text, 400) as content_snippet
  from net._http_response
  order by created desc
  limit 10
`);
console.log(r.rows);
await c.end();

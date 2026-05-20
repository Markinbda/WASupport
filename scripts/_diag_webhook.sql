-- Inspect recent pg_net responses from Supabase Database Webhooks
select id, status_code, error_msg, created, content_type,
       left(content::text, 300) as content_snippet
from net._http_response
order by created desc
limit 10;

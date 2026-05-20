-- Resync ticket ref sequences to past current max ref (after bulk import).
do $$
declare
  v_it  bigint := coalesce((select max(substring(ref from 4)::bigint) from public.tickets where ref like 'IT-%'),  0);
  v_fac bigint := coalesce((select max(substring(ref from 5)::bigint) from public.tickets where ref like 'FAC-%'), 0);
  v_hs  bigint := coalesce((select max(substring(ref from 4)::bigint) from public.tickets where ref like 'HS-%'),  0);
begin
  perform setval('public.ticket_seq_it',  greatest(v_it,  1));
  perform setval('public.ticket_seq_fac', greatest(v_fac, 1));
  perform setval('public.ticket_seq_hs',  greatest(v_hs,  1));
end$$;

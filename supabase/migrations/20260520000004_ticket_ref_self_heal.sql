-- Make ref-assignment trigger self-healing: if a generated ref already
-- exists (e.g. sequence drift after bulk imports), advance and retry
-- until we land on a free value.
create or replace function public.set_ticket_ref()
returns trigger
language plpgsql
as $$
declare
  prefix text;
  seq    text;
  n      bigint;
  candidate text;
  i int := 0;
begin
  if new.ref is not null and new.ref <> '' then
    return new;
  end if;

  case new.department
    when 'IT'  then prefix := 'IT-';  seq := 'public.ticket_seq_it';
    when 'FAC' then prefix := 'FAC-'; seq := 'public.ticket_seq_fac';
    when 'HS'  then prefix := 'HS-';  seq := 'public.ticket_seq_hs';
  end case;

  loop
    n := nextval(seq);
    candidate := prefix || lpad(n::text, 4, '0');
    if not exists (select 1 from public.tickets where ref = candidate) then
      new.ref := candidate;
      exit;
    end if;
    i := i + 1;
    if i > 100000 then
      raise exception 'ticket ref generation exhausted for department %', new.department;
    end if;
  end loop;

  return new;
end;
$$;

-- And eagerly fast-forward each sequence past current max so the loop
-- doesn't have to grind through thousands of taken values on the next
-- inserts.
do $$
declare
  v_it  bigint := coalesce((select max(substring(ref from 4)::bigint) from public.tickets where ref ~ '^IT-[0-9]+$'),  0);
  v_fac bigint := coalesce((select max(substring(ref from 5)::bigint) from public.tickets where ref ~ '^FAC-[0-9]+$'), 0);
  v_hs  bigint := coalesce((select max(substring(ref from 4)::bigint) from public.tickets where ref ~ '^HS-[0-9]+$'),  0);
begin
  perform setval('public.ticket_seq_it',  greatest(v_it,  1), true);
  perform setval('public.ticket_seq_fac', greatest(v_fac, 1), true);
  perform setval('public.ticket_seq_hs',  greatest(v_hs,  1), true);
end$$;

-- Fix: lpad(n::text, 4, '0') TRUNCATES when n > 9999 (e.g. lpad('11099',4,'0') -> '1099').
-- After the bulk Spiceworks import, the IT and FAC sequences passed 9999, so every
-- generated candidate collided with an existing 4-digit ref and the self-heal loop
-- spun until exhausted (or until the statement timeout fired).
--
-- Switch to: pad to 4 digits while small, otherwise emit the full integer.
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
    candidate := prefix || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
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

-- Re-sync sequences past the true numeric max (using a SAFE numeric extraction).
do $$
declare
  v_it  bigint := coalesce(
    (select max(substring(ref from 4)::bigint) from public.tickets
     where ref ~ '^IT-[0-9]+$'), 0);
  v_fac bigint := coalesce(
    (select max(substring(ref from 5)::bigint) from public.tickets
     where ref ~ '^FAC-[0-9]+$'), 0);
  v_hs  bigint := coalesce(
    (select max(substring(ref from 4)::bigint) from public.tickets
     where ref ~ '^HS-[0-9]+$'), 0);
begin
  perform setval('public.ticket_seq_it',  greatest(v_it,  1));
  perform setval('public.ticket_seq_fac', greatest(v_fac, 1));
  perform setval('public.ticket_seq_hs',  greatest(v_hs,  1));
end$$;

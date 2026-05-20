-- Add 'awaiting_triage' to ticket_status. Must be committed in its own
-- migration before the value can be referenced as a default or in CHECKs.

do $$
begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'ticket_status' and e.enumlabel = 'awaiting_triage'
  ) then
    alter type ticket_status add value 'awaiting_triage' before 'open';
  end if;
end$$;

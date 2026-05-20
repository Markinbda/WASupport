-- Inbound email pipeline support.
-- Allows tickets created from anonymous email senders to retain the sender
-- address even when no matching profile exists.

alter table public.tickets
  add column if not exists legacy_submitter_email text;

create index if not exists tickets_legacy_email_idx
  on public.tickets (legacy_submitter_email);

-- Add 'support' to user_role enum. Must run in its own migration so the
-- value is committed before any function/policy references it.
alter type user_role add value if not exists 'support';

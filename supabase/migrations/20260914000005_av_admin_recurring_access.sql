-- Allow av_admin role to read/manage recurring events (previously admin-only).

drop policy if exists "av recurring read" on public.av_recurring_events;
create policy "av recurring read"
  on public.av_recurring_events for select to authenticated
  using (public.current_role() in ('av_admin', 'admin'));

drop policy if exists "av recurring insert" on public.av_recurring_events;
create policy "av recurring insert"
  on public.av_recurring_events for insert to authenticated
  with check (
    public.current_role() in ('av_admin', 'admin')
    and created_by = auth.uid()
  );

drop policy if exists "av recurring update" on public.av_recurring_events;
create policy "av recurring update"
  on public.av_recurring_events for update to authenticated
  using (public.current_role() in ('av_admin', 'admin'))
  with check (public.current_role() in ('av_admin', 'admin'));

notify pgrst, 'reload schema';

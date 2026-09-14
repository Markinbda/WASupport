-- Dedicated AV administration access. General support staff do not inherit it.

drop policy if exists "av requests read" on public.av_requests;
create policy "av requests read"
  on public.av_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or public.current_role() in ('av_admin', 'admin')
  );

drop policy if exists "av recurring read" on public.av_recurring_events;
create policy "av recurring read"
  on public.av_recurring_events for select to authenticated
  using (public.is_admin());

drop policy if exists "av recurring insert" on public.av_recurring_events;
create policy "av recurring insert"
  on public.av_recurring_events for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "av recurring update" on public.av_recurring_events;
create policy "av recurring update"
  on public.av_recurring_events for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "av request storage read" on storage.objects;
create policy "av request storage read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'av-request-files'
    and exists (
      select 1 from public.av_requests r
      where r.id::text = split_part(name, '/', 2)
        and (
          r.requester_id = auth.uid()
          or public.current_role() in ('av_admin', 'admin')
        )
    )
  );

notify pgrst, 'reload schema';
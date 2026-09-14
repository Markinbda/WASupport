drop policy if exists "av request files read" on public.av_request_files;
create policy "av request files read"
  on public.av_request_files for select to authenticated
  using (
    exists (
      select 1 from public.av_requests r
      where r.id = request_id
        and (
          r.requester_id = auth.uid()
          or public.current_role() in ('av_admin', 'admin')
        )
    )
  );

notify pgrst, 'reload schema';
-- Storage: buckets privados por instituição.
--   reports/{institution_id}/{patient_id}/{report_id}.pdf
--   institution-logos/{institution_id}/logo.png

insert into storage.buckets (id, name, public)
values
  ('reports', 'reports', false),
  ('institution-logos', 'institution-logos', false)
on conflict (id) do nothing;

-- Primeiro segmento do caminho como uuid (null se não for uuid, em vez de erro de cast).
create function private.path_institution_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

-- reports: colaboradores leem; admin e psicólogo gravam; admin exclui.
create policy reports_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and private.path_institution_id(name) in (select private.member_institution_ids())
  );

create policy reports_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and private.path_institution_id(name) in (select private.member_institution_ids('{admin,psychologist}'))
  );

create policy reports_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and private.path_institution_id(name) in (select private.member_institution_ids('{admin}'))
  );

-- institution-logos: colaboradores leem; admin da instituição e superadmin gerenciam.
create policy logos_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'institution-logos'
    and (
      private.path_institution_id(name) in (select private.member_institution_ids())
      or (select private.is_platform_admin())
    )
  );

create policy logos_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'institution-logos'
    and (
      private.path_institution_id(name) in (select private.member_institution_ids('{admin}'))
      or (select private.is_platform_admin())
    )
  );

create policy logos_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'institution-logos'
    and (
      private.path_institution_id(name) in (select private.member_institution_ids('{admin}'))
      or (select private.is_platform_admin())
    )
  );

create policy logos_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'institution-logos'
    and (
      private.path_institution_id(name) in (select private.member_institution_ids('{admin}'))
      or (select private.is_platform_admin())
    )
  );

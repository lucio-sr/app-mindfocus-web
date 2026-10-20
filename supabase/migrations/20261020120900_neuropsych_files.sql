-- Testes neuropsicológicos tradicionais: nome do instrumento "outro", anexo (PDF/imagem do teste
-- aplicado) e registro restrito a quem aplica testes (admin e psicólogo).
--
-- Anexo no Storage: assessments/{institution_id}/{patient_id}/{assessment_id}/anexo.{ext}
-- Os escores ficam em `scores` (jsonb), com as chaves definidas no front (web/src/lib/instruments.ts),
-- iguais às colunas da base antiga sem o prefixo do instrumento (ex.: TAVIS t1_acertos).

alter table public.neuropsych_assessments
  add column instrument_name text,
  add column file_path text,
  add column file_name text,
  add constraint neuropsych_other_has_name
    check (instrument <> 'other' or nullif(btrim(instrument_name), '') is not null),
  add constraint neuropsych_file_path_scoped
    check (file_path is null or file_path like institution_id::text || '/' || patient_id::text || '/' || id::text || '/%');

comment on column public.neuropsych_assessments.instrument_name is 'Nome do instrumento quando instrument = other.';
comment on column public.neuropsych_assessments.file_path is 'Anexo no bucket assessments.';

-- Registrar e editar: admin e psicólogo (staff só consulta). Excluir continua só admin.
drop policy neuropsych_assessments_insert on public.neuropsych_assessments;
drop policy neuropsych_assessments_update on public.neuropsych_assessments;

create policy neuropsych_assessments_insert on public.neuropsych_assessments
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids('{admin,psychologist}')));

create policy neuropsych_assessments_update on public.neuropsych_assessments
  for update to authenticated
  using (institution_id in (select private.member_institution_ids('{admin,psychologist}')))
  with check (institution_id in (select private.member_institution_ids('{admin,psychologist}')));

-- Bucket privado, até 20 MB, PDF ou imagem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessments', 'assessments', false, 20971520, '{application/pdf,image/jpeg,image/png}')
on conflict (id) do nothing;

create policy assessments_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assessments'
    and private.path_institution_id(name) in (select private.member_institution_ids())
  );

create policy assessments_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assessments'
    and private.path_institution_id(name) in (select private.member_institution_ids('{admin,psychologist}'))
  );

-- update: permite substituir o anexo (upsert no mesmo caminho)
create policy assessments_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assessments'
    and private.path_institution_id(name) in (select private.member_institution_ids('{admin,psychologist}'))
  )
  with check (
    bucket_id = 'assessments'
    and private.path_institution_id(name) in (select private.member_institution_ids('{admin,psychologist}'))
  );

create policy assessments_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assessments'
    and private.path_institution_id(name) in (select private.member_institution_ids('{admin}'))
  );

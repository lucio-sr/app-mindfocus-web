-- Testes neuropsicológicos: quem registra, anexo no Storage e isolamento.
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.new_user(uid uuid, name text, cpf text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, lower(replace(name, ' ', '.')) || '@exemplo.com.br', jsonb_build_object('full_name', name, 'cpf', cpf));
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

select tests.new_user('00000000-0000-0000-0000-0000000000b2', 'Psico A', '18609139034');
select tests.new_user('00000000-0000-0000-0000-0000000000b3', 'Staff A', '99603082430');
select tests.new_user('00000000-0000-0000-0000-0000000000c1', 'Admin B', '62819482112');

insert into public.institutions (id, name, document_type, document) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '75749118000116'),
  ('22222222-2222-2222-2222-222222222222', 'Escola B',  'cnpj', '89555979000178');
insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b2', 'psychologist'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b3', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', 'admin');
insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente A1', '2016-03-01');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b2');

select lives_ok(
  $$insert into public.neuropsych_assessments (id, institution_id, patient_id, instrument, applied_at, applied_by, scores)
    values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
            'tavis', '2026-10-20', '00000000-0000-0000-0000-0000000000b2', '{"t1_acertos": 40}')$$,
  'psicólogo registra TAVIS');
select throws_ok(
  $$insert into public.neuropsych_assessments (institution_id, patient_id, instrument)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'other')$$,
  '23514', null, '"outro" exige o nome do instrumento');
select lives_ok(
  $$update public.neuropsych_assessments
    set file_path = '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000001/anexo.pdf',
        file_name = 'tavis.pdf'
    where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'psicólogo vincula o anexo');
select throws_ok(
  $$update public.neuropsych_assessments set file_path = '22222222-2222-2222-2222-222222222222/x/anexo.pdf'
    where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23514', null, 'anexo fora da pasta do teste é rejeitado');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('assessments', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000001/anexo.pdf')$$,
  'psicólogo envia o arquivo');

select tests.login('00000000-0000-0000-0000-0000000000b3');
select is((select count(*) from public.neuropsych_assessments), 1::bigint, 'staff consulta os testes');
select is((select count(*) from storage.objects where bucket_id = 'assessments'), 1::bigint, 'staff vê o anexo');
select throws_ok(
  $$insert into public.neuropsych_assessments (institution_id, patient_id, instrument)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'fdt')$$,
  '42501', null, 'staff não registra teste');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('assessments', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/x/anexo.pdf')$$,
  '42501', null, 'staff não envia arquivo');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from public.neuropsych_assessments), 0::bigint, 'outra instituição não vê os testes');
select is((select count(*) from storage.objects where bucket_id = 'assessments'), 0::bigint, 'outra instituição não vê o anexo');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('assessments', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/y/anexo.pdf')$$,
  '42501', null, 'outra instituição não envia arquivo para A');
reset role;

select * from finish();
rollback;

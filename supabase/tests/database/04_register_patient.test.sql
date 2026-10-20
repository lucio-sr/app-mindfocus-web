-- Cadastro "criança primeiro" (RPC register_patient, Edge Function create-patient).
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

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

select tests.new_user('00000000-0000-0000-0000-0000000000b3', 'Staff A', '99603082430');
select tests.new_user('00000000-0000-0000-0000-0000000000c1', 'Admin B', '62819482112');
select tests.new_user('00000000-0000-0000-0000-0000000000d1', 'Mae G', '99351819019');
select tests.new_user('00000000-0000-0000-0000-0000000000d2', 'Pai H', '54323194897');

insert into public.institutions (id, name, document_type, document) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '75749118000116'),
  ('22222222-2222-2222-2222-222222222222', 'Escola B',  'cnpj', '89555979000178');
insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b3', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', 'admin');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b3');

select lives_ok(
  $$select set_config('tests.p', public.register_patient(
      '11111111-1111-1111-1111-111111111111',
      '{"full_name": "João Teste", "birthdate": "2016-03-12", "gender": "Masculino", "education": "4º ano (EF)", "public_school": true}',
      '[{"guardian_id": "00000000-0000-0000-0000-0000000000d1", "relationship": "Mãe"},
        {"guardian_id": "00000000-0000-0000-0000-0000000000d2", "relationship": "Pai", "income": "3 a 5 SM"}]',
      '2026-10')::text, true)$$,
  'staff cadastra criança com dois responsáveis');
select is((select count(*) from public.patient_guardians where patient_id = current_setting('tests.p')::uuid), 2::bigint,
  'dois vínculos de responsável');
select is((select count(*) from public.consents where patient_id = current_setting('tests.p')::uuid), 2::bigint,
  'consentimento de cada responsável');
select results_eq(
  $$select full_name, education, public_school, medications from public.patients where id = current_setting('tests.p')::uuid$$,
  $$values ('João Teste', '4º ano (EF)', true, '{}'::text[])$$,
  'campos da criança e padrões');

select throws_ok(
  $$select public.register_patient('11111111-1111-1111-1111-111111111111', '{"full_name": "X", "birthdate": "2017-01-01"}',
      '[{"guardian_id": "00000000-0000-0000-0000-0000000000d1", "relationship": "Mãe"},
        {"guardian_id": "00000000-0000-0000-0000-0000000000d1", "relationship": "Pai"}]')$$,
  '22023', null, 'responsável repetido é rejeitado');
select throws_ok(
  $$select public.register_patient('11111111-1111-1111-1111-111111111111', '{"full_name": "X", "birthdate": "2017-01-01"}', '[]')$$,
  '22023', null, 'sem responsável é rejeitado');
select throws_ok(
  $$select public.register_patient('11111111-1111-1111-1111-111111111111', '{"full_name": "Sem Parentesco", "birthdate": "2017-01-01"}',
      '[{"guardian_id": "00000000-0000-0000-0000-0000000000d1"}]')$$,
  '23502', null, 'parentesco é obrigatório');
select is((select count(*) from public.patients where full_name = 'Sem Parentesco'), 0::bigint,
  'falha não deixa paciente gravado');
select throws_ok(
  $$select public.register_patient('11111111-1111-1111-1111-111111111111', '{"full_name": "Sem Data"}',
      '[{"guardian_id": "00000000-0000-0000-0000-0000000000d1", "relationship": "Mãe"}]')$$,
  '23502', null, 'data de nascimento é obrigatória');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$select public.register_patient('11111111-1111-1111-1111-111111111111', '{"full_name": "Intruso", "birthdate": "2017-01-01"}',
      '[{"guardian_id": "00000000-0000-0000-0000-0000000000d1", "relationship": "Mãe"}]')$$,
  '42501', null, 'admin de outra instituição não cadastra');
reset role;

select * from finish();
rollback;

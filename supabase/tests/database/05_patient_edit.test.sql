-- Edição de paciente: atualização pelos colaboradores e remoção de responsável.
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.new_user(uid uuid, name text, cpf text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, lower(replace(name, ' ', '.')) || '@exemplo.com.br', jsonb_build_object('full_name', name, 'cpf', cpf));
$$;
create function tests.affected(query text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute query;
  get diagnostics n = row_count;
  return n;
end $$;
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
insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente A1', '2016-03-01');
insert into public.patient_guardians (institution_id, patient_id, guardian_id, relationship) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Mãe'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', 'Pai');
insert into public.consents (institution_id, patient_id, guardian_id, term_version) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '2026-10'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', '2026-10');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b3');

select is(
  tests.affected($$update public.patients set medications = '{metilfenidato}', adhd_diagnosis = true, notes = 'ok'
                   where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$),
  1::bigint, 'staff edita a anamnese');
select is(
  tests.affected($$update public.patient_guardians set relationship = 'Padrasto'
                   where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001' and guardian_id = '00000000-0000-0000-0000-0000000000d2'$$),
  1::bigint, 'staff muda o parentesco');

select lives_ok(
  $$select public.remove_patient_guardian('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2')$$,
  'staff remove um dos responsáveis');
select is((select count(*) from public.patient_guardians where patient_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1::bigint,
  'sobra um vínculo');
select ok((select revoked_at is not null from public.consents where guardian_id = '00000000-0000-0000-0000-0000000000d2'),
  'consentimento do removido fica revogado, não apagado');
select is((select revoked_at from public.consents where guardian_id = '00000000-0000-0000-0000-0000000000d1'), null,
  'consentimento do outro continua válido');

select throws_ok(
  $$select public.remove_patient_guardian('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1')$$,
  '23514', null, 'não remove o último responsável');

-- incluir de volta (o cadastro registra novo consentimento; o antigo revogado continua no histórico)
select lives_ok(
  $$select public.register_guardian_patients('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d2',
      '[{"patient_id": "aaaaaaaa-0000-0000-0000-000000000001", "relationship": "Pai"}]', '2026-10')$$,
  'responsável removido pode ser incluído de novo');
select is((select count(*) from public.consents where guardian_id = '00000000-0000-0000-0000-0000000000d2'), 2::bigint,
  'histórico: consentimento revogado + novo');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$select public.remove_patient_guardian('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2')$$,
  '42501', null, 'outra instituição não remove responsável');
select is(
  tests.affected($$update public.patients set notes = 'invasão' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$),
  0::bigint, 'outra instituição não edita o paciente');
reset role;

select * from finish();
rollback;

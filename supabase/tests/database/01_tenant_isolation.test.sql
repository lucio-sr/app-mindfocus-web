-- Isolamento entre instituições, papéis, superadmin, responsáveis e Storage.
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
-- Quantidade de linhas afetadas por um comando (RLS filtra UPDATE/DELETE sem erro).
create function tests.affected(query text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute query;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

create function tests.new_user(uid uuid, name text, cpf text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, lower(replace(name, ' ', '.')) || '@exemplo.com.br',
          jsonb_build_object('full_name', name, 'cpf', cpf));
$$;

-- ---------------------------------------------------------------------------
-- Cenário
--   Instituição A: admin aA, psicólogo pA, staff sA, X (também em B)
--   Instituição B: admin aB, X
--   Responsável G (paciente pa1 de A), superadmin SA, usuário sem vínculo O
-- ---------------------------------------------------------------------------

select tests.new_user('00000000-0000-0000-0000-0000000000a1', 'Super Admin', '526.018.159-06');
select tests.new_user('00000000-0000-0000-0000-0000000000b1', 'Admin A', '08301661305');
select tests.new_user('00000000-0000-0000-0000-0000000000b2', 'Psico A', '18609139034');
select tests.new_user('00000000-0000-0000-0000-0000000000b3', 'Staff A', '99603082430');
select tests.new_user('00000000-0000-0000-0000-0000000000c1', 'Admin B', '62819482112');
select tests.new_user('00000000-0000-0000-0000-0000000000d1', 'Responsavel G', '99351819019');
select tests.new_user('00000000-0000-0000-0000-0000000000e1', 'Outsider O', '54323194897');
select tests.new_user('00000000-0000-0000-0000-0000000000f1', 'Multi X', '75749118606');

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a1');

insert into public.institutions (id, name, document_type, document, uf) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '55597971000152', 'RS'),
  ('22222222-2222-2222-2222-222222222222', 'Escola B',  'cnpj', '14710497000146', 'PE');

insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', 'admin'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b2', 'psychologist'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b3', 'staff'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f1', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', 'admin'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000f1', 'staff');

insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente A1', '2016-03-01'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Paciente A2', '2015-07-10'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Paciente B1', '2017-01-20');

insert into public.patient_guardians (institution_id, patient_id, guardian_id, relationship) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'mãe');

insert into public.game_sessions (id, institution_id, patient_id) values
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.game_results (institution_id, patient_id, session_id, test, hits) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000a', 'tmt_a', 25),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000b', 'tmt_a', 20);

-- ---------------------------------------------------------------------------
-- Validações e integridade (como postgres)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.institutions (name, document_type, document) values ('X', 'cnpj', '11222333000100')$$,
  '23514', null, 'CNPJ com dígito verificador inválido é rejeitado');

select throws_ok(
  $$insert into auth.users (email, raw_user_meta_data) values ('sem.cpf@exemplo.com.br', '{"full_name": "Sem CPF"}')$$,
  '23502', null, 'conta sem CPF não é criada');

select throws_ok(
  $$insert into auth.users (email, raw_user_meta_data) values ('cpf.ruim@exemplo.com.br', '{"full_name": "CPF Ruim", "cpf": "12345678900"}')$$,
  '23514', null, 'conta com CPF inválido não é criada');

select throws_ok(
  $$insert into public.game_results (institution_id, patient_id, session_id, test)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000a', 'genius')$$,
  '23503', null, 'FK composta impede resultado de B apontando para sessão de A');

-- ---------------------------------------------------------------------------
-- Psicólogo da instituição A
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;

select is((select count(*) from public.institutions), 1::bigint, 'psicólogo A vê só a própria instituição');
select is((select count(*) from public.patients), 2::bigint, 'psicólogo A vê os 2 pacientes de A');
select ok(not exists (select 1 from public.patients where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'psicólogo A não vê paciente de B');

select throws_ok(
  $$insert into public.patients (institution_id, full_name, birthdate)
    values ('22222222-2222-2222-2222-222222222222', 'Intruso', '2016-01-01')$$,
  '42501', null, 'psicólogo A não cadastra paciente em B');

select lives_ok(
  $$insert into public.patients (id, institution_id, full_name, birthdate)
    values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Paciente A3', '2016-05-05')$$,
  'psicólogo A cadastra paciente em A');

select is(
  tests.affected($q$update public.patients set notes = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$),
  0::bigint, 'psicólogo A não altera paciente de B');

select is((select count(*) from public.profiles), 5::bigint,
  'psicólogo A vê o próprio perfil, colegas de A e responsáveis de A');

select throws_ok(
  $$update public.profiles set cpf = '25276018987' where id = '00000000-0000-0000-0000-0000000000b2'$$,
  '42501', null, 'CPF não é editável pelo cliente');

select throws_ok(
  $$select * from public.issue_access_code('bbbbbbbb-0000-0000-0000-000000000001')$$,
  '42501', null, 'psicólogo A não gera PIN para paciente de B');

select lives_ok(
  $$select * from public.issue_access_code('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'psicólogo A gera PIN para paciente de A');

select throws_ok(
  $$select code_hash from public.game_access_codes$$,
  '42501', null, 'hash do PIN não é legível pelo cliente');

select throws_ok(
  $$insert into public.institution_members (institution_id, user_id, role)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000e1', 'staff')$$,
  '42501', null, 'psicólogo (não admin) não adiciona colaboradores');

select is(
  tests.affected($q$delete from public.patients where id = 'aaaaaaaa-0000-0000-0000-000000000002'$q$),
  0::bigint, 'psicólogo (não admin) não exclui paciente');

select is((select count(*) from public.audit_log), 0::bigint, 'psicólogo não lê a auditoria');
select is((select count(*) from public.game_results), 1::bigint, 'psicólogo A vê só resultados de jogo de A');

select lives_ok(
  $$insert into public.reports (institution_id, patient_id, kind, storage_path)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'summary',
            '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r1.pdf')$$,
  'psicólogo registra laudo');

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('reports', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r1.pdf')$$,
  'psicólogo grava PDF na pasta da própria instituição');

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('reports', '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000001/r1.pdf')$$,
  '42501', null, 'psicólogo não grava PDF na pasta de B');

reset role;

-- ---------------------------------------------------------------------------
-- Staff da instituição A
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000b3');
set local role authenticated;

select is((select count(*) from public.patients), 3::bigint, 'staff A vê todos os pacientes de A');

select throws_ok(
  $$insert into public.reports (institution_id, patient_id, kind, storage_path)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'summary',
            '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r2.pdf')$$,
  '42501', null, 'staff não registra laudo');

select is((select count(*) from storage.objects where bucket_id = 'reports'), 1::bigint,
  'staff A lê os PDFs de A');

reset role;

-- ---------------------------------------------------------------------------
-- Admin da instituição A
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;

select lives_ok(
  $$update public.institutions set name = 'Clínica A Ltda' where id = '11111111-1111-1111-1111-111111111111'$$,
  'admin A edita dados da instituição');

select throws_ok(
  $$update public.institutions set status = 'suspended' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'admin A não muda o status da instituição');

select ok((select count(*) from public.audit_log) > 0, 'admin A lê a auditoria de A');
select ok(not exists (select 1 from public.audit_log where institution_id = '22222222-2222-2222-2222-222222222222'),
  'admin A não lê auditoria de B');

select throws_ok(
  $$update public.institution_members set active = false
    where institution_id = '11111111-1111-1111-1111-111111111111' and user_id = '00000000-0000-0000-0000-0000000000b1'$$,
  '23514', null, 'último admin ativo não pode ser desativado');

select is(
  tests.affected($q$delete from public.patients where id = 'aaaaaaaa-0000-0000-0000-000000000002'$q$),
  1::bigint, 'admin A exclui paciente');

reset role;

-- ---------------------------------------------------------------------------
-- Colaborador de duas instituições (X em A e B)
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;

select is((select count(*) from public.patients), 3::bigint, 'X vê pacientes de A e de B');

select throws_ok(
  $$update public.patients set institution_id = '22222222-2222-2222-2222-222222222222'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, 'paciente não muda de instituição, nem por quem é membro das duas');

reset role;

-- ---------------------------------------------------------------------------
-- Responsável G
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;

select is((select count(*) from public.patients), 1::bigint, 'responsável vê só o próprio filho');

select lives_ok(
  $$insert into public.questionnaire_responses (institution_id, patient_id, guardian_id, answers)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-0000000000d1', '{"q1": 2}')$$,
  'responsável responde o questionário do filho');

select throws_ok(
  $$insert into public.questionnaire_responses (institution_id, patient_id, guardian_id, answers)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-0000000000d1', '{"q1": 2}')$$,
  '42501', null, 'responsável não responde por outra criança');

select is((select count(*) from public.game_results), 0::bigint, 'responsável não lê resultados brutos do jogo');
select is((select count(*) from public.institutions), 0::bigint, 'responsável não lista instituições');

reset role;

-- ---------------------------------------------------------------------------
-- Superadmin
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

select is((select count(*) from public.institutions), 2::bigint, 'superadmin vê todas as instituições');
select is((select count(*) from public.patients), 0::bigint, 'superadmin não vê pacientes');

select lives_ok(
  $$insert into public.institutions (name, document_type, document) values ('Consultório C', 'cpf', '25276018987')$$,
  'superadmin cria instituição (pessoa física, CPF)');

select is((select count(*) from public.platform_institution_stats()), 3::bigint,
  'superadmin vê estatísticas de todas as instituições');

select lives_ok(
  $$update public.institutions set status = 'suspended' where id = '22222222-2222-2222-2222-222222222222'$$,
  'superadmin suspende instituição');

reset role;

-- ---------------------------------------------------------------------------
-- Instituição suspensa, usuário sem vínculo e anon
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select is((select count(*) from public.patients), 0::bigint, 'admin de instituição suspensa perde acesso aos pacientes');
reset role;

select tests.login('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select is((select count(*) from public.patients), 2::bigint, 'X continua vendo só os pacientes de A');
reset role;

select tests.login('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select ok(
  (select count(*) from public.institutions) = 0 and (select count(*) from public.patients) = 0,
  'usuário sem vínculo não vê nada');
select throws_ok(
  $$select * from public.platform_institution_stats()$$,
  '42501', null, 'estatísticas da plataforma são exclusivas do superadmin');
reset role;

select tests.logout();
set local role anon;
select throws_ok($$select * from public.patients$$, '42501', null, 'anon não acessa pacientes');
select throws_ok(
  $$select * from public.issue_access_code('aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon não gera PIN');
reset role;

select * from finish();
rollback;

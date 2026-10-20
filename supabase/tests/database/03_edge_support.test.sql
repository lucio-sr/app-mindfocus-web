-- RPCs usadas pelas Edge Functions da Fase 2 (limite de tentativas, cadastro de instituição,
-- colaboradores e responsáveis). Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.new_user(uid uuid, name text, cpf text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, lower(replace(name, ' ', '.')) || '@exemplo.com.br',
          jsonb_build_object('full_name', name, 'cpf', cpf));
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Cenário: instituição A (admin aA, staff sA), instituição B (admin aB), superadmin SA,
-- futuro admin N, sem vínculo O, responsável novo G.
select tests.new_user('00000000-0000-0000-0000-0000000000a1', 'Super Admin', '52601815906');
select tests.new_user('00000000-0000-0000-0000-0000000000b1', 'Admin A', '08301661305');
select tests.new_user('00000000-0000-0000-0000-0000000000b3', 'Staff A', '99603082430');
select tests.new_user('00000000-0000-0000-0000-0000000000c1', 'Admin B', '62819482112');
select tests.new_user('00000000-0000-0000-0000-0000000000d1', 'Responsavel G', '99351819019');
select tests.new_user('00000000-0000-0000-0000-0000000000e1', 'Outsider O', '54323194897');
select tests.new_user('00000000-0000-0000-0000-0000000000f2', 'Novo Admin N', '93786579741');

insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a1');

insert into public.institutions (id, name, document_type, document) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '75749118000116'),
  ('22222222-2222-2222-2222-222222222222', 'Escola B',  'cnpj', '89555979000178');

insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', 'admin'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b3', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', 'admin');

insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente A1', '2016-03-01'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Paciente B1', '2017-01-20');

-- ---------------------------------------------------------------------------
-- Limite de tentativas
-- ---------------------------------------------------------------------------

select ok(public.hit_rate_limit('login:cpf:08301661305', 2, 900), '1ª tentativa dentro do limite');
select ok(public.hit_rate_limit('login:cpf:08301661305', 2, 900), '2ª tentativa dentro do limite');
select ok(not public.hit_rate_limit('login:cpf:08301661305', 2, 900), '3ª tentativa bloqueada');
select ok(public.hit_rate_limit('login:cpf:99603082430', 2, 900), 'outra chave tem contador próprio');
select is((select count(*) from private.rate_limits where key_hash like '%08301661305%'), 0::bigint,
  'a chave é guardada só como hash');

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.hit_rate_limit('x', 1, 60)$$, '42501', null,
  'usuário logado não acessa o limite de tentativas');
reset role;

-- ---------------------------------------------------------------------------
-- current_user_access
-- ---------------------------------------------------------------------------

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select is(public.current_user_access() -> 'memberships' -> 0 ->> 'role', 'admin', 'admin A vê o próprio papel');
select is(jsonb_array_length(public.current_user_access() -> 'memberships'), 1, 'admin A tem um vínculo');
select is((public.current_user_access() ->> 'is_platform_admin')::boolean, false, 'admin A não é superadmin');

select tests.login('00000000-0000-0000-0000-0000000000a1');
select is((public.current_user_access() ->> 'is_platform_admin')::boolean, true, 'SA é superadmin');
reset role;

-- ---------------------------------------------------------------------------
-- create_institution
-- ---------------------------------------------------------------------------

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$select public.create_institution('{"name": "Nova", "document": "62.527.601/0001-04"}', '00000000-0000-0000-0000-0000000000f2')$$,
  '42501', null, 'admin de instituição não cria instituição');

select tests.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$select public.create_institution('{"name": "Nova", "document": "62.527.601/0001-00"}', '00000000-0000-0000-0000-0000000000f2')$$,
  '23514', null, 'CNPJ inválido é rejeitado');
select throws_ok(
  $$select public.create_institution('{"name": "Nova", "document": "123"}', '00000000-0000-0000-0000-0000000000f2')$$,
  '23514', null, 'documento com tamanho errado é rejeitado');

select lives_ok(
  $$select set_config('tests.new_inst', public.create_institution(
      '{"name": " Clínica Nova ", "document": "62.527.601/0001-04", "cep": "01310-100", "uf": "sp"}',
      '00000000-0000-0000-0000-0000000000f2')::text, true)$$,
  'superadmin cria instituição com o primeiro admin');
reset role;

select results_eq(
  $$select name, document_type::text, document, cep, uf from public.institutions
    where id = current_setting('tests.new_inst')::uuid$$,
  $$values ('Clínica Nova', 'cnpj', '62527601000104', '01310100', 'SP')$$,
  'documento e CEP sem máscara, tipo deduzido, UF em maiúsculas');
select results_eq(
  $$select user_id, role::text, created_by from public.institution_members
    where institution_id = current_setting('tests.new_inst')::uuid$$,
  $$values ('00000000-0000-0000-0000-0000000000f2'::uuid, 'admin', '00000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'primeiro admin vinculado, registrado como criado pelo superadmin');

-- ---------------------------------------------------------------------------
-- add_institution_member
-- ---------------------------------------------------------------------------

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b1');
select is(public.add_institution_member('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000e1', 'staff'),
  'created', 'admin A inclui colaborador');
select is(public.add_institution_member('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000e1', 'staff'),
  'unchanged', 'incluir de novo não muda nada');
select is(public.add_institution_member('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000e1', 'psychologist'),
  'updated', 'muda o papel');
update public.institution_members set active = false
  where institution_id = '11111111-1111-1111-1111-111111111111' and user_id = '00000000-0000-0000-0000-0000000000e1';
select is(public.add_institution_member('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000e1', 'staff'),
  'reactivated', 'reativa colaborador desligado');
select throws_ok(
  $$select public.add_institution_member('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000e1', 'staff')$$,
  '42501', null, 'admin A não inclui colaborador em B');

select tests.login('00000000-0000-0000-0000-0000000000b3');
select throws_ok(
  $$select public.add_institution_member('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1', 'admin')$$,
  '42501', null, 'staff não inclui colaborador');
reset role;

-- ---------------------------------------------------------------------------
-- register_guardian_patients
-- ---------------------------------------------------------------------------

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b3');
select is(
  cardinality(public.register_guardian_patients(
    '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1',
    '[{"full_name": "Paciente Novo", "birthdate": "2017-05-02", "medications": ["ritalina"], "uf": "rs", "relationship": "pai"},
      {"patient_id": "aaaaaaaa-0000-0000-0000-000000000001", "relationship": "pai", "income": "2 a 4 SM"}]',
    'v1')),
  2, 'staff cadastra paciente novo e vincula paciente existente');
select results_eq(
  $$select p.full_name, p.uf, p.medications, p.school_dropout, g.relationship
    from public.patients p join public.patient_guardians g on g.patient_id = p.id
    where g.guardian_id = '00000000-0000-0000-0000-0000000000d1' order by p.full_name$$,
  $$values ('Paciente A1', null::text, '{}'::text[], false, 'pai'), ('Paciente Novo', 'RS', '{ritalina}'::text[], false, 'pai')$$,
  'campos e valores padrão do paciente novo');
select is(
  (select count(*) from public.consents where guardian_id = '00000000-0000-0000-0000-0000000000d1' and term_version = 'v1'),
  2::bigint, 'consentimento registrado para cada vínculo');

select throws_ok(
  $$select public.register_guardian_patients('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1',
      '[{"patient_id": "bbbbbbbb-0000-0000-0000-000000000001", "relationship": "mãe"}]')$$,
  '23503', null, 'não vincula paciente de outra instituição');
select throws_ok(
  $$select public.register_guardian_patients('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1',
      '[{"full_name": "Sem Parentesco", "birthdate": "2018-01-01"}]')$$,
  '23502', null, 'parentesco é obrigatório');
select throws_ok(
  $$select public.register_guardian_patients('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1', '[]')$$,
  '22023', null, 'lista de pacientes vazia é rejeitada');
select throws_ok(
  $$select public.register_guardian_patients('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1',
      '[{"full_name": "Atomico", "birthdate": "2018-01-01", "relationship": "mãe"},
        {"full_name": "Sem Data", "relationship": "mãe"}]')$$,
  '23502', null, 'item inválido derruba o cadastro inteiro');
select is((select count(*) from public.patients where full_name = 'Atomico'), 0::bigint,
  'nenhum paciente fica gravado pela metade');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$select public.register_guardian_patients('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1',
      '[{"full_name": "Intruso", "birthdate": "2018-01-01", "relationship": "mãe"}]')$$,
  '42501', null, 'admin de B não cadastra responsável em A');
reset role;

select * from finish();
rollback;
